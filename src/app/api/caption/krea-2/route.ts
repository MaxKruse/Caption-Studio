/**
 * Krea 2 mode caption endpoint.
 * Two-phase workflow:
 *   Phase 1 - Initial captioning (same as simple mode)
 *   Phase 2 - Re-captioning with sliding window (size=8, step=4)
 *             LLM refines captions to exclude character-consistent features
 *
 * POST /api/caption/krea-2 - accepts FormData, starts processing, returns SSE stream
 * DELETE /api/caption/krea-2?sessionId=<id> - aborts an active session
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";
import { prepareForApi } from "@/lib/image-utils";
import { buildUserPrompt } from "@/lib/prompt-utils";
import {
  createSession,
  saveImage,
  writeCaption,
  readCaption,
  getSession,
  touchSession,
} from "@/lib/temp-files";
import { computeSlidingWindows } from "@/lib/krea2-window";
import {
  buildRecaptionSystemPrompt,
  buildRecaptionUserPrompt,
  type ImageCaptionPair,
} from "@/lib/krea2-prompts";

// ---------------------------------------------------------------------------
// Active session tracking for explicit abort
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, AbortController>();

/** Cleanup stale sessions (completed sessions that weren't removed). */
setInterval(() => {
  for (const [sessionId, ac] of activeSessions.entries()) {
    if (ac.signal.aborted) {
      activeSessions.delete(sessionId);
    }
  }
}, 60_000); // every minute

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageTask {
  index: number;
  serverName: string;    // deduplicated filename on disk
  originalName: string;  // original uploaded filename
  imageBuffer: Buffer;   // raw image data (for API call)
}

interface RecaptionResult {
  index: number;
  caption: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max time allowed per API call. */
const API_TIMEOUT_MS = 5 * 60 * 1000;

/** Default max concurrency for parallel image processing. */
const MAX_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace variable placeholders in prompt text. */
function replaceVariables(
  text: string,
  imageName: string,
  index: number,
  total: number
): string {
  return text
    .replace(/{image_name}/g, imageName)
    .replace(/{index}/g, String(index + 1))
    .replace(/{total}/g, String(total));
}

/** Extract image buffer from a File object. */
async function readFileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Fetch with timeout + external abort signal support.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse re-captioning JSON response from LLM.
 * Handles both clean JSON and JSON embedded in markdown code blocks.
 */
function parseRecaptionResponse(raw: string): RecaptionResult[] {
  let cleaned = raw.trim();

  // Strip markdown code block fences if present
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item: unknown) =>
          item != null &&
          typeof item === "object" &&
          "index" in item &&
          "caption" in item
      ) as RecaptionResult[];
    }
  } catch {
    // Not valid JSON - try line-by-line extraction
  }

  // Fallback: try to find JSON array in the text
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item: unknown) =>
            item != null &&
            typeof item === "object" &&
            "index" in item &&
            "caption" in item
        ) as RecaptionResult[];
      }
    } catch {
      // Still not valid
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Phase 1: Initial captioning (same as simple mode)
// ---------------------------------------------------------------------------

/**
 * Process a single image and emit SSE events via sendEvent.
 * Writes caption to .txt file on completion.
 */
async function processImage(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  triggerWordPerson: string,
  triggerWordOther: string,
  total: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: task.index, name: task.originalName });

  try {
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      task.imageBuffer
    );
    const base64 = apiBuffer.toString("base64");

    const promptWithContext = buildUserPrompt(
      userPrompt,
      triggerWordPerson,
      triggerWordOther
    );
    const resolvedPrompt = replaceVariables(
      promptWithContext,
      task.originalName,
      task.index,
      total
    );

    if (abortSignal.aborted) return;

    const messages: Array<Record<string, unknown>> = [];

    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }

    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
        { type: "text", text: resolvedPrompt },
      ],
    });

    const response = await fetchWithTimeout(
      `${normalizedUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        cache: "no-store",
      },
      API_TIMEOUT_MS,
      abortSignal
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    let caption = "";
    let reasoningContent = "";
    const body = response.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    while (true) {
      if (abortSignal.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (abortSignal.aborted) {
          reader.cancel();
          return;
        }

        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(dataStr);
          const delta = chunk?.choices?.[0]?.delta;
          if (delta?.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            sendEvent("token", {
              type: "reasoning",
              index: task.index,
              content: delta.reasoning_content,
              full: reasoningContent,
            });
          }
          if (delta?.content) {
            caption += delta.content;
            sendEvent("token", {
              type: "caption",
              index: task.index,
              content: delta.content,
              full: caption,
            });
          }
        } catch {
          // skip malformed
        }
      }
    }

    if (!abortSignal.aborted) {
      const trimmedCaption = caption.trim();

      // Write caption file to disk
      if (trimmedCaption) {
        writeCaption(sessionId, task.serverName, trimmedCaption);
      }

      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "completed",
        caption: trimmedCaption,
        reasoningContent: reasoningContent.trim(),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!abortSignal.aborted) {
      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "failed",
        error: message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Re-captioning with sliding window
// ---------------------------------------------------------------------------

/**
 * Process a single re-captioning bucket (sliding window).
 * Sends images + original captions + character description to LLM.
 * Writes updated captions to disk on success.
 */
async function processRecaptionBucket(
  bucket: number[],
  sessionId: string,
  tasks: ImageTask[],
  normalizedUrl: string,
  model: string,
  characterDescription: string,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  const meta = getSession(sessionId);
  if (!meta) {
    sendEvent("recaption_bucket_complete", {
      bucket,
      status: "failed",
      error: "Session not found",
    });
    return;
  }

  sendEvent("recaption_bucket_start", {
    bucket,
    size: bucket.length,
  });

  try {
    // Build image-caption pairs for this bucket
    const pairs: ImageCaptionPair[] = [];

    for (const idx of bucket) {
      const task = tasks[idx];
      if (!task) continue;

      const caption = readCaption(sessionId, task.serverName);
      pairs.push({
        index: task.index,
        name: task.originalName,
        caption: caption ?? "",
      });
    }

    if (pairs.length === 0) {
      sendEvent("recaption_bucket_complete", {
        bucket,
        status: "skipped",
        reason: "No captions to refine",
      });
      return;
    }

    // Prepare images as base64 data URLs for the API
    const imagePreps = await Promise.all(
      bucket.map(async (idx) => {
        const task = tasks[idx];
        if (!task) return null;
        const { buffer, mimeType } = await prepareForApi(
          task.originalName,
          task.imageBuffer
        );
        return {
          index: task.index,
          base64: buffer.toString("base64"),
          mimeType,
        };
      })
    );

    const validPreps = imagePreps.filter((p): p is NonNullable<typeof p> => p != null);

    if (validPreps.length === 0) {
      sendEvent("recaption_bucket_complete", {
        bucket,
        status: "skipped",
        reason: "No valid images to process",
      });
      return;
    }

    // Build messages for the re-captioning API call
    const systemPrompt = buildRecaptionSystemPrompt();
    const userPrompt = buildRecaptionUserPrompt(characterDescription, pairs);

    const messages: Array<Record<string, unknown>> = [];
    messages.push({ role: "system", content: systemPrompt });

    // Build user message with images + text
    const userContent: Array<Record<string, unknown>> = [];

    // Add all images first
    for (const prep of validPreps) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${prep.mimeType};base64,${prep.base64}` },
      });
    }

    // Add the text prompt after all images
    userContent.push({ type: "text", text: userPrompt });

    messages.push({ role: "user", content: userContent });

    // Call the API
    const response = await fetchWithTimeout(
      `${normalizedUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        cache: "no-store",
      },
      API_TIMEOUT_MS,
      abortSignal
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    // Stream the response and accumulate content
    let fullContent = "";
    let fullReasoning = "";
    const body = response.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    while (true) {
      if (abortSignal.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (abortSignal.aborted) {
          reader.cancel();
          return;
        }

        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(dataStr);
          const delta = chunk?.choices?.[0]?.delta;
          if (delta?.reasoning_content) {
            fullReasoning += delta.reasoning_content;
            sendEvent("token", {
              type: "recaption_reasoning",
              bucket,
              content: delta.reasoning_content,
              full: fullReasoning,
            });
          }
          if (delta?.content) {
            fullContent += delta.content;
            sendEvent("token", {
              type: "recaption_caption",
              bucket,
              content: delta.content,
              full: fullContent,
            });
          }
        } catch {
          // skip malformed
        }
      }
    }

    if (abortSignal.aborted) return;

    // Parse the re-captioning results
    const results = parseRecaptionResponse(fullContent);

    // Apply updated captions
    for (const result of results) {
      const task = tasks[result.index];
      if (task && result.caption.trim()) {
        const oldCaption = readCaption(sessionId, task.serverName) ?? "";
        writeCaption(sessionId, task.serverName, result.caption.trim());

        sendEvent("recaption_image_updated", {
          index: task.index,
          name: task.originalName,
          oldCaption,
          newCaption: result.caption.trim(),
        });
      }
    }

    sendEvent("recaption_bucket_complete", {
      bucket,
      status: "completed",
      refinedCount: results.length,
      reasoningContent: fullReasoning.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!abortSignal.aborted) {
      sendEvent("recaption_bucket_complete", {
        bucket,
        status: "failed",
        error: message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// POST - Start processing and return SSE stream
// Accepts FormData (images as files + config as JSON string)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    return Response.json(
      { error: "Only multipart/form-data is supported" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const configRaw = formData.get("config");
  if (!configRaw || typeof configRaw !== "string") {
    return Response.json({ error: "Missing config" }, { status: 400 });
  }

  let config: {
    serverUrl: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    triggerWordPerson: string;
    triggerWordOther: string;
    characterDescription: string;
  };

  try {
    const parsed = JSON.parse(configRaw);
    config = {
      serverUrl: parsed.serverUrl ?? "",
      model: parsed.model ?? "",
      systemPrompt: parsed.systemPrompt ?? "",
      userPrompt: parsed.userPrompt ?? "",
      triggerWordPerson: parsed.triggerWordPerson ?? "",
      triggerWordOther: parsed.triggerWordOther ?? "",
      characterDescription: parsed.characterDescription ?? "",
    };
  } catch {
    return Response.json({ error: "Invalid config JSON" }, { status: 400 });
  }

  const imageFiles = formData.getAll("images") as File[];
  if (imageFiles.length === 0) {
    return Response.json({ error: "No images provided" }, { status: 400 });
  }

  // Use names from config if provided, otherwise fall back to file names
  const configNames = formData.get("imageNames");
  const imageNames = configNames && typeof configNames === "string"
    ? JSON.parse(configNames) as string[]
    : imageFiles.map((f) => f.name);

  const person = config.triggerWordPerson?.trim() ?? "";
  const other = config.triggerWordOther?.trim() ?? "";

  if (!config.serverUrl || !config.model) {
    return Response.json(
      { error: "serverUrl and model are required" },
      { status: 400 }
    );
  }

  if (!config.characterDescription?.trim()) {
    return Response.json(
      { error: "characterDescription is required for Krea 2 mode" },
      { status: 400 }
    );
  }

  // Create session and save images to temp files
  const session = createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();
  const tasks: ImageTask[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const buffer = await readFileBuffer(imageFiles[i]);
    const serverName = saveImage(
      sessionId,
      imageNames[i] || `image-${i}.jpg`,
      buffer,
      usedBases
    );

    if (serverName) {
      tasks.push({
        index: i,
        serverName,
        originalName: imageNames[i] || `image-${i}.jpg`,
        imageBuffer: buffer,
      });
    }
  }

  if (tasks.length === 0) {
    return Response.json(
      { error: "No valid images to process" },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(config.serverUrl));
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const sendEvent = (type: string, data: unknown) => {
    if (controller) {
      const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(line));
    }
  };

  const closeStream = () => {
    if (controller) controller.close();
  };

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const sessionAbort = new AbortController();
  activeSessions.set(sessionId, sessionAbort);

  request.signal.addEventListener("abort", () => {
    sessionAbort.abort();
  });

  // Send sessionId as first event
  sendEvent("session", { sessionId });

  // Process both phases
  (async () => {
    try {
      // =========================================================================
      // Phase 1: Initial captioning
      // =========================================================================
      sendEvent("phase", { phase: "captioning" });

      const concurrency = Math.min(MAX_CONCURRENCY, tasks.length);
      const queue = [...tasks];

      async function processNext(): Promise<void> {
        while (queue.length > 0 && !sessionAbort.signal.aborted) {
          const task = queue.shift()!;
          touchSession(sessionId);

          await processImage(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            config.systemPrompt,
            config.userPrompt,
            person,
            other,
            tasks.length,
            sendEvent,
            sessionAbort.signal
          );
        }
      }

      const workers = Array.from({ length: concurrency }, () => processNext());
      await Promise.all(workers);

      if (sessionAbort.signal.aborted) {
        closeStream();
        return;
      }

      // =========================================================================
      // Phase 2: Re-captioning with sliding window
      // =========================================================================
      sendEvent("phase", { phase: "recaptioning" });

      const windows = computeSlidingWindows(tasks.length);

      for (const window of windows) {
        if (sessionAbort.signal.aborted) break;
        touchSession(sessionId);

        await processRecaptionBucket(
          window,
          sessionId,
          tasks,
          normalizedUrl,
          config.model,
          config.characterDescription,
          sendEvent,
          sessionAbort.signal
        );
      }

      if (!sessionAbort.signal.aborted) {
        sendEvent("done", { allComplete: true });
      }
      closeStream();
    } catch (error) {
      if (!sessionAbort.signal.aborted) {
        sendEvent("error", { error: String(error) });
      }
      closeStream();
    } finally {
      activeSessions.delete(sessionId);
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE - Abort an active session
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionAbort = activeSessions.get(sessionId);
  if (!sessionAbort) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  sessionAbort.abort();
  activeSessions.delete(sessionId);
  return Response.json({ ok: true });
}
