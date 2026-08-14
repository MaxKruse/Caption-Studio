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
  saveImage,
  writeCaption,
  writeTags,
  touchSession,
} from "@/lib/temp-files";
import { readFileBuffer, fetchWithTimeout, streamResponse } from "@/lib/caption-helpers";
import { buildChatRequest } from "@/lib/llama-request";
import { forAnimaConfigSchema, type ForAnimaConfig } from "@/lib/config-schema";
import { registerSession, unregisterSession, abortSession, getSession } from "@/lib/session-registry";
import { createSseStream } from "@/lib/sse";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max time allowed per API call. */
const API_TIMEOUT_MS = 15 * 60 * 1000;

/** Default max concurrency for parallel image processing. */
const MAX_CONCURRENCY = 8;

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

    const response = await fetchWithTimeout(
      `${normalizedUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildChatRequest({ model, messages, slotId })),
        cache: "no-store",
      },
      API_TIMEOUT_MS,
      abortSignal
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText}`);
    }

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

  // Zod-validated config (same schema family as krea-2)
  let config: ForAnimaConfig;
  try {
    const result = forAnimaConfigSchema.safeParse(JSON.parse(configRaw));
    if (!result.success) {
      return Response.json(
        { error: "Invalid config", details: result.error.flatten() },
        { status: 400 }
      );
    }
    config = result.data;
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

  // Create session and save images to temp files
  const session = await createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();
  const tasks: ImageTask[] = [];

  // Read image buffers and caption texts in parallel
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
        originalName: imageNames[i] || `image-${i}.jpg`,
      };
    })
  );

  for (const { i, imageBuffer, booruTags, originalName } of readItems) {
    const serverName = await saveImage(
      sessionId,
      originalName,
      imageBuffer,
      usedBases
    );

    if (serverName) {
      tasks.push({
        index: i,
        serverName,
        originalName,
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
  const [stream, sendEvent, closeStream] = createSseStream();

  // Detect server parallelism to avoid overloading llama.cpp
  const serverParallel = await getModelParallel(config.serverUrl, config.model);
  const maxConcurrency = Math.min(
    serverParallel ?? MAX_CONCURRENCY,
    MAX_CONCURRENCY
  );

  const sessionAbort = new AbortController();
  registerSession(sessionId, sessionAbort);

  request.signal.addEventListener("abort", () => {
    sessionAbort.abort();
  });

  // Send sessionId as first event
  sendEvent("session", { sessionId });

  // Process images in parallel
  (async () => {
    try {
      const concurrency = Math.min(maxConcurrency, tasks.length);
      const queue = [...tasks];

      async function processNext(slotId: number): Promise<void> {
        while (queue.length > 0 && !sessionAbort.signal.aborted) {
          const task = queue.shift()!;
          touchSession(sessionId);

          await processImage(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            slotId,
            systemPrompt,
            sendEvent,
            sessionAbort.signal
          );
        }
      }

      // Each worker is pinned to its own llama.cpp slot (worker index is
      // always < server --parallel due to the getModelParallel clamp).
      const workers = Array.from(
        { length: concurrency },
        (_, workerIndex) => processNext(workerIndex)
      );
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
// DELETE - Abort an active session
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionAbort = getSession(sessionId);
  if (!sessionAbort) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const aborted = abortSession(sessionId);
  if (!aborted) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
