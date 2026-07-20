/**
 * Krea 2 mode caption endpoint.
 * Two-phase workflow:
 *   Phase 1 - Initial captioning (standard captioning with user prompt)
 *   Phase 2 - Per-image refinement (remove character-consistent features using character description)
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
  touchSession,
} from "@/lib/temp-files";
import {
  buildRefineSystemPrompt,
  buildRefineUserPrompt,
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
}, 60_000);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageTask {
  index: number;
  serverName: string;    // deduplicated filename on disk
  originalName: string;  // original uploaded filename
  imageBuffer: Buffer;   // raw image data (for API call)
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

// ---------------------------------------------------------------------------
// Phase 1: Initial captioning
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
// Phase 2: Per-image refinement
// ---------------------------------------------------------------------------

/**
 * Refine a single image's caption by removing character-consistent features.
 * Reads the Phase 1 caption, sends image + caption + character description to LLM,
 * writes the refined caption to disk on success.
 */
async function processRefineImage(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  characterDescription: string,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  const originalCaption = readCaption(sessionId, task.serverName);
  if (!originalCaption) {
    sendEvent("refine_image_complete", {
      index: task.index,
      name: task.originalName,
      status: "skipped",
      reason: "No original caption found",
    });
    return;
  }

  sendEvent("refine_image_start", { index: task.index, name: task.originalName });

  try {
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      task.imageBuffer
    );
    const base64 = apiBuffer.toString("base64");

    const systemPrompt = buildRefineSystemPrompt();
    const userPrompt = buildRefineUserPrompt(originalCaption, characterDescription);

    if (abortSignal.aborted) return;

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ];

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

      // Overwrite caption file with refined version
      if (trimmedCaption) {
        writeCaption(sessionId, task.serverName, trimmedCaption);
      }

      sendEvent("refine_image_complete", {
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
      sendEvent("refine_image_complete", {
        index: task.index,
        name: task.originalName,
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
      // Phase 2: Per-image refinement
      // =========================================================================
      sendEvent("phase", { phase: "refining" });

      const refineConcurrency = Math.min(MAX_CONCURRENCY, tasks.length);
      const refineQueue = [...tasks];

      async function refineNext(): Promise<void> {
        while (refineQueue.length > 0 && !sessionAbort.signal.aborted) {
          const task = refineQueue.shift()!;
          touchSession(sessionId);

          await processRefineImage(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            config.characterDescription,
            sendEvent,
            sessionAbort.signal
          );
        }
      }

      const refineWorkers = Array.from({ length: refineConcurrency }, () => refineNext());
      await Promise.all(refineWorkers);

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
