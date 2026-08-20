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
import { getModelParallel } from "@/lib/model-utils";
import { prepareForApi } from "@/lib/image-utils";
import {
  buildAnimaSystemPrompt,
  buildAnimaUserPrompt,
  assembleFinalCaption,
} from "@/lib/anima-prompt";
import {
  createSession,
  saveImagesBatch,
  writeCaption,
  writeTags,
  touchSession,
  deleteSession,
} from "@/lib/temp-files";
import { readFileBuffer, chatComplete, streamResponse } from "@/lib/caption-helpers";
import { forAnimaConfigSchema, type ForAnimaConfig } from "@/lib/config-schema";
import { parseCaptionRequest, handleSessionAbort } from "@/lib/caption-route";
import { registerSession, unregisterSession } from "@/lib/session-registry";
import { createSseStream } from "@/lib/sse";
import { runWorkerPool, runWorkerPoolStreaming } from "@/lib/worker-pool";
import { createSessionQueue, type SessionQueue } from "@/lib/session-queue";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Max time allowed per API call (per image).
 * For Anima enhancement emits a short natural-language addition on top
 * of existing booru tags, so 5 min bounds a hung request without
 * starving very slow local models (krea-2 phase 1 keeps 15 min for
 * full captions from scratch).
 */
export const API_TIMEOUT_MS = 5 * 60 * 1000;

/** Default max concurrency for parallel image processing. */
const MAX_CONCURRENCY = 8;

/**
 * Chunked uploads: if no further chunk arrives within this window (and
 * the expected image count has not been reached), the session ends with
 * an error instead of hanging open.
 */
export const CHUNK_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Chunked upload state
// ---------------------------------------------------------------------------

/** Per-session state for in-flight chunked uploads. */
interface ChunkedSessionEntry {
  queue: SessionQueue<ImageTask>;
  /** Base-name dedup set, shared across all chunks of the session. */
  usedBases: Set<string>;
}

const chunkedSessions = new Map<string, ChunkedSessionEntry>();

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
 *
 * Pinned to a llama.cpp slot (slotId = worker index) so all images from
 * the same worker reuse the slot's cached KV (system prompt, and prior
 * images' shared prefixes via chunk reuse).
 */
async function processImage(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  slotId: number,
  systemPrompt: string,
  maxImageDimension: number | undefined,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: task.index, name: task.originalName });

  try {
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      task.imageBuffer,
      maxImageDimension
    );
    const base64 = apiBuffer.toString("base64");

    const userPrompt = buildAnimaUserPrompt(task.booruTags, task.originalName);
    const resolvedPrompt = userPrompt;

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

    const response = await chatComplete(normalizedUrl, {
      model,
      messages,
      slotId,
      timeoutMs: API_TIMEOUT_MS,
      signal: abortSignal,
    });

    const result = await streamResponse(response, "captioning", task.index, sendEvent, abortSignal);
    if (!result || abortSignal.aborted) return;

    const trimmedAddition = result.caption.trim();

    // Assemble final caption: booru tags + LLM addition
    const finalCaption = assembleFinalCaption(task.booruTags, trimmedAddition);

    // Write caption file to disk (full: booru tags + LLM addition)
    if (finalCaption) {
      await writeCaption(sessionId, task.serverName, finalCaption);
    }

    // Write tags-only file for clean LoRA metadata embedding
    const trimmedTags = task.booruTags.trim();
    if (trimmedTags) {
      await writeTags(sessionId, task.serverName, trimmedTags);
    }

    sendEvent("image_complete", {
      index: task.index,
      name: task.originalName,
      status: "completed",
      caption: finalCaption,
      booruTags: task.booruTags.trim(),
      llmAddition: trimmedAddition,
      reasoningContent: result.reasoningContent.trim(),
      cachedTokens: result.cachedTokens,
      promptTokens: result.promptTokens,
    });
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
// Shared chunk saving
// ---------------------------------------------------------------------------

/**
 * Read a chunk's images + caption texts, validate/save them into the
 * session directory, and return the processing tasks with GLOBAL image
 * indices (indexOffset + local position).
 */
async function saveChunkToSession(
  sessionId: string,
  imageFiles: File[],
  imageNames: string[],
  captionFiles: File[],
  usedBases: Set<string>,
  indexOffset: number
): Promise<ImageTask[]> {
  const readItems = await Promise.all(
    imageFiles.map(async (file, i) => {
      const [imageBuffer, booruTags] = await Promise.all([
        readFileBuffer(file),
        captionFiles[i] ? captionFiles[i].text() : Promise.resolve(""),
      ]);
      return {
        i,
        imageBuffer,
        booruTags,
        originalName: imageNames[i] || `image-${indexOffset + i}.jpg`,
      };
    })
  );

  const serverNames = await saveImagesBatch(
    sessionId,
    readItems.map(({ imageBuffer, originalName }) => ({
      originalName,
      data: imageBuffer,
    })),
    usedBases
  );

  const tasks: ImageTask[] = [];
  readItems.forEach(({ i, imageBuffer, booruTags, originalName }, idx) => {
    const serverName = serverNames[idx];
    if (serverName) {
      tasks.push({ index: indexOffset + i, serverName, originalName, imageBuffer, booruTags });
    }
  });
  return tasks;
}

// ---------------------------------------------------------------------------
// POST - Start processing and return SSE stream
// Accepts FormData (images + caption files + config as JSON string).
// Large batches arrive in chunks: chunk 0 (config.sessionId + chunkIndex 0)
// opens the SSE stream and workers start immediately; later chunks POST to
// the same route and receive a JSON ack while their images are enqueued.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const parsed = await parseCaptionRequest(request, forAnimaConfigSchema, ["captions"]);
  if (!parsed.ok) return parsed.response;
  const { config, imageFiles, imageNames } = parsed;

  // Caption files (booru tag files) - paired by index with images
  const captionFiles = parsed.extraFiles.captions;

  // Aliased condition: when isChunked is true, all four locals are defined.
  const { sessionId, expectedImageCount, chunkIndex, chunkSize } = config;
  const isChunked =
    sessionId !== undefined &&
    expectedImageCount !== undefined &&
    chunkIndex !== undefined &&
    chunkSize !== undefined;

  if (!isChunked) {
    return handleSingleShot(request, config, imageFiles, imageNames, captionFiles);
  }

  if (imageFiles.length > chunkSize) {
    return Response.json({ error: "Chunk exceeds chunkSize" }, { status: 400 });
  }

  if (chunkIndex > 0) {
    return handleChunkContinuation(sessionId, chunkIndex, chunkSize, imageFiles, imageNames, captionFiles);
  }

  return handleChunkStart(request, config, sessionId, expectedImageCount, imageFiles, imageNames, captionFiles);
}

// ---------------------------------------------------------------------------
// Single-shot upload (small batches - legacy behavior)
// ---------------------------------------------------------------------------

async function handleSingleShot(
  request: NextRequest,
  config: ForAnimaConfig,
  imageFiles: File[],
  imageNames: string[],
  captionFiles: File[]
): Promise<Response> {
  const session = await createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();
  const tasks = await saveChunkToSession(sessionId, imageFiles, imageNames, captionFiles, usedBases, 0);

  if (tasks.length === 0) {
    await deleteSession(sessionId);
    return Response.json({ error: "No valid images to process" }, { status: 400 });
  }

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(config.serverUrl));
  const systemPrompt = buildAnimaSystemPrompt();
  const [stream, sendEvent, closeStream] = createSseStream();

  // Detect server parallelism in the background (never throws) so the
  // session event can stream immediately and the client can render its
  // progress UI while discovery runs.
  const serverParallelPromise = getModelParallel(config.serverUrl, config.model);

  const sessionAbort = new AbortController();
  registerSession(sessionId, sessionAbort);

  request.signal.addEventListener("abort", () => {
    sessionAbort.abort();
  });

  // Send sessionId as first event
  sendEvent("session", { sessionId });
  if (tasks.length < imageFiles.length) {
    sendEvent("warning", {
      message: `Only ${tasks.length} of ${imageFiles.length} images accepted (per-session limit or invalid image data)`,
    });
  }

  // Process images in parallel
  (async () => {
    try {
      const serverParallel = await serverParallelPromise;
      // Each worker is pinned to its own llama.cpp slot (worker index is
      // always < server --parallel due to the getModelParallel clamp).
      await runWorkerPool(
        tasks,
        Math.min(serverParallel ?? MAX_CONCURRENCY, MAX_CONCURRENCY),
        (task, slotId) => {
          touchSession(sessionId);
          return processImage(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            slotId,
            systemPrompt,
            config.maxImageDimension,
            sendEvent,
            sessionAbort.signal
          );
        },
        sessionAbort.signal
      );

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
      unregisterSession(sessionId);
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
// Chunked upload: chunk 0 (opens the SSE stream)
// ---------------------------------------------------------------------------

async function handleChunkStart(
  request: NextRequest,
  config: ForAnimaConfig,
  sessionId: string,
  expectedImageCount: number,
  imageFiles: File[],
  imageNames: string[],
  captionFiles: File[]
): Promise<Response> {
  let session;
  try {
    session = await createSession(sessionId);
  } catch {
    return Response.json({ error: "Session already exists" }, { status: 400 });
  }

  const usedBases = new Set<string>();
  const firstTasks = await saveChunkToSession(sessionId, imageFiles, imageNames, captionFiles, usedBases, 0);

  if (firstTasks.length === 0) {
    await deleteSession(sessionId);
    return Response.json({ error: "No valid images to process" }, { status: 400 });
  }

  const queue = createSessionQueue<ImageTask>({
    expected: expectedImageCount,
    idleTimeoutMs: CHUNK_IDLE_TIMEOUT_MS,
  });
  chunkedSessions.set(sessionId, { queue, usedBases });

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(config.serverUrl));
  const systemPrompt = buildAnimaSystemPrompt();
  const [stream, sendEvent, closeStream] = createSseStream();
  const serverParallelPromise = getModelParallel(config.serverUrl, config.model);

  const sessionAbort = new AbortController();
  registerSession(sessionId, sessionAbort);

  request.signal.addEventListener("abort", () => {
    sessionAbort.abort();
  });

  // Send sessionId as first event, then start draining chunk 0 while the
  // remaining chunks are still uploading.
  sendEvent("session", { sessionId });
  if (firstTasks.length < imageFiles.length) {
    sendEvent("warning", {
      message: `Only ${firstTasks.length} of ${imageFiles.length} images in the first chunk were accepted`,
    });
  }
  for (const task of firstTasks) {
    queue.enqueue(task);
  }

  (async () => {
    try {
      const serverParallel = await serverParallelPromise;
      await runWorkerPoolStreaming(
        queue,
        Math.min(serverParallel ?? MAX_CONCURRENCY, MAX_CONCURRENCY),
        (task, slotId) => {
          touchSession(sessionId);
          return processImage(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            slotId,
            systemPrompt,
            config.maxImageDimension,
            sendEvent,
            sessionAbort.signal
          );
        },
        sessionAbort.signal
      );

      const outcome = await queue.done;
      if (outcome === "timed-out" && !sessionAbort.signal.aborted) {
        sendEvent("error", {
          error: `Upload incomplete: expected ${expectedImageCount} images, received ${queue.arrived}`,
        });
      } else if (!sessionAbort.signal.aborted) {
        sendEvent("done", { allComplete: true });
      }
      closeStream();
    } catch (error) {
      if (!sessionAbort.signal.aborted) {
        sendEvent("error", { error: String(error) });
      }
      closeStream();
    } finally {
      chunkedSessions.delete(sessionId);
      queue.dispose();
      unregisterSession(sessionId);
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
// Chunked upload: continuation chunks (JSON ack)
// ---------------------------------------------------------------------------

async function handleChunkContinuation(
  sessionId: string,
  chunkIndex: number,
  chunkSize: number,
  imageFiles: File[],
  imageNames: string[],
  captionFiles: File[]
): Promise<Response> {
  const entry = chunkedSessions.get(sessionId);
  if (!entry) {
    // Session finished, timed out, or was aborted - the client treats a
    // 404 as "nothing more to send".
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const indexOffset = chunkIndex * chunkSize;
  const tasks = await saveChunkToSession(sessionId, imageFiles, imageNames, captionFiles, entry.usedBases, indexOffset);

  touchSession(sessionId);
  for (const task of tasks) {
    entry.queue.enqueue(task);
  }

  return Response.json({
    ok: true,
    accepted: tasks.length,
    rejected: imageFiles.length - tasks.length,
  });
}

// ---------------------------------------------------------------------------
// DELETE - Abort an active session
// ---------------------------------------------------------------------------
export function DELETE(request: NextRequest) {
  return handleSessionAbort(request);
}
