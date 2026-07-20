/**
 * For Anima mode caption endpoint.
 *
 * Takes images + existing caption files (booru tags from taggui) and uses an
 * LLM to generate natural language additions that enrich the dataset captions.
 *
 * Final caption = original booru tags + LLM-generated addition.
 *
 * POST /api/caption/for-anima - accepts FormData, starts processing, returns SSE stream
 * DELETE /api/caption/for-anima?sessionId=<id> - aborts an active session
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";
import { prepareForApi } from "@/lib/image-utils";
import {
  buildAnimaSystemPrompt,
  buildAnimaUserPrompt,
  assembleFinalCaption,
} from "@/lib/anima-prompt";
import {
  createSession,
  saveImage,
  writeCaption,
  touchSession,
} from "@/lib/temp-files";

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

/** Extract text buffer from a File object. */
async function readFileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

/** Max time allowed per API call. */
const API_TIMEOUT_MS = 5 * 60 * 1000;

/** Default max concurrency for parallel image processing. */
const MAX_CONCURRENCY = 8;

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
// Image processing
// ---------------------------------------------------------------------------

interface ImageTask {
  index: number;
  serverName: string;     // deduplicated filename on disk
  originalName: string;   // original uploaded filename
  imageBuffer: Buffer;    // raw image data (for API call)
  booruTags: string;      // existing caption text (booru tags)
}

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

    const userPrompt = buildAnimaUserPrompt(task.booruTags, task.originalName);
    const resolvedPrompt = replaceVariables(
      userPrompt,
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

    let llmAddition = "";
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
            llmAddition += delta.content;
            sendEvent("token", {
              type: "caption",
              index: task.index,
              content: delta.content,
              full: llmAddition,
            });
          }
        } catch {
          // skip malformed
        }
      }
    }

    if (!abortSignal.aborted) {
      const trimmedAddition = llmAddition.trim();

      // Assemble final caption: booru tags + LLM addition
      const finalCaption = assembleFinalCaption(task.booruTags, trimmedAddition);

      // Write caption file to disk
      if (finalCaption) {
        writeCaption(sessionId, task.serverName, finalCaption);
      }

      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "completed",
        caption: finalCaption,
        booruTags: task.booruTags.trim(),
        llmAddition: trimmedAddition,
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
// POST - Start processing and return SSE stream
// Accepts FormData (images + caption files + config as JSON string)
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
  };

  try {
    config = JSON.parse(configRaw);
  } catch {
    return Response.json({ error: "Invalid config JSON" }, { status: 400 });
  }

  const imageFiles = formData.getAll("images") as File[];
  if (imageFiles.length === 0) {
    return Response.json({ error: "No images provided" }, { status: 400 });
  }

  // Caption files (booru tag files) - paired by index with images
  const captionFiles = formData.getAll("captions") as File[];

  // Use names from config if provided, otherwise fall back to file names
  const configNames = formData.get("imageNames");
  const imageNames: string[] = configNames && typeof configNames === "string"
    ? JSON.parse(configNames) as string[]
    : imageFiles.map((f) => f.name);

  if (!config.serverUrl || !config.model) {
    return Response.json(
      { error: "serverUrl and model are required" },
      { status: 400 }
    );
  }

  // Create session and save images to temp files
  const session = createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();
  const tasks: ImageTask[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const imageBuffer = await readFileBuffer(imageFiles[i]);
    const serverName = saveImage(
      sessionId,
      imageNames[i] || `image-${i}.jpg`,
      imageBuffer,
      usedBases
    );

    // Read corresponding caption file (booru tags), or use empty string
    let booruTags = "";
    if (captionFiles[i]) {
      booruTags = await captionFiles[i].text();
    }

    if (serverName) {
      tasks.push({
        index: i,
        serverName,
        originalName: imageNames[i] || `image-${i}.jpg`,
        imageBuffer,
        booruTags,
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
  const systemPrompt = buildAnimaSystemPrompt();
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

  // Process images in parallel
  (async () => {
    try {
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
            systemPrompt,
            tasks.length,
            sendEvent,
            sessionAbort.signal
          );
        }
      }

      const workers = Array.from({ length: concurrency }, () => processNext());
      await Promise.all(workers);

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
