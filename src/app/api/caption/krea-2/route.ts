/**
 * Krea 2 mode caption endpoint.
 * Three-phase multi-turn conversation per image (shared KV cache):
 *   Phase 1 - Initial captioning (image + user prompt)
 *   Phase 2 - Refinement (remove character-consistent features)
 *   Phase 3 - Distillation (simplify for krea2 t2i)
 *
 * All 3 phases share the same conversation context so the image encoding
 * is cached by the KV cache and only new text tokens need processing.
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
  touchSession,
} from "@/lib/temp-files";
import {
  buildRefineUserPrompt,
  buildDistillUserPrompt,
} from "@/lib/krea2-prompts";
import { readFileBuffer, fetchWithTimeout, streamResponse } from "@/lib/caption-helpers";
import { registerSession, unregisterSession, abortSession, getSession } from "@/lib/session-registry";
import { createSseStream } from "@/lib/sse";
import { krea2ConfigSchema } from "@/lib/config-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** Max time allowed per API call (all 3 phases share one call, so generous). */
const API_TIMEOUT_MS = 5 * 60 * 1000;

/** Default max concurrency for parallel image processing. */
const MAX_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Multi-turn image processing (all 3 phases, single conversation)
// ---------------------------------------------------------------------------

/**
 * Process a single image through all 3 phases as a multi-turn conversation.
 *
 * Phase 1: Image + user prompt -> initial caption
 * Phase 2: Conversation + refine instructions -> refined caption
 * Phase 3: Conversation + distill instructions -> distilled prompt
 *
 * The image is only in the first user message. Subsequent phases reuse
 * the conversation context (KV cache) so only new text tokens are processed.
 */
async function processImageAllPhases(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  triggerWordPerson: string,
  triggerWordOther: string,
  characterDescription: string,
  total: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: task.index, name: task.originalName });

  try {
    // Prepare image once (used in first message of the conversation)
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      task.imageBuffer
    );
    const base64 = apiBuffer.toString("base64");

    // Build conversation history (shared across all phases)
    const messages: Array<Record<string, unknown>> = [];

    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }

    // =========================================================================
    // Phase 1: Initial captioning
    // =========================================================================
    sendEvent("phase", { phase: "captioning", index: task.index });

    const promptWithContext = buildUserPrompt(
      userPrompt,
      triggerWordPerson,
      triggerWordOther
    );
    const resolvedPrompt = promptWithContext;

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

    if (abortSignal.aborted) return;

    const response1 = await fetchWithTimeout(
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

    if (!response1.ok) {
      const errorText = await response1.text();
      throw new Error(`API ${response1.status}: ${errorText}`);
    }

    const result1 = await streamResponse(
      response1,
      "captioning",
      task.index,
      sendEvent,
      abortSignal
    );

    if (!result1) return;

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: result1.caption });

    // Write Phase 1 caption to disk
    writeCaption(sessionId, task.serverName, result1.caption);

    sendEvent("image_complete", {
      index: task.index,
      name: task.originalName,
      phase: "captioning",
      status: "completed",
      caption: result1.caption,
      reasoningContent: result1.reasoningContent,
    });

    // =========================================================================
    // Phase 2: Per-image refinement
    // =========================================================================
    sendEvent("phase", { phase: "refining", index: task.index });

    const refineUserPrompt = buildRefineUserPrompt(
      result1.caption,
      characterDescription,
      triggerWordPerson,
      triggerWordOther
    );

    messages.push({ role: "user", content: refineUserPrompt });

    if (abortSignal.aborted) return;

    const response2 = await fetchWithTimeout(
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

    if (!response2.ok) {
      const errorText = await response2.text();
      throw new Error(`API ${response2.status}: ${errorText}`);
    }

    const result2 = await streamResponse(
      response2,
      "refining",
      task.index,
      sendEvent,
      abortSignal
    );

    if (!result2) return;

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: result2.caption });

    // Write Phase 2 caption to disk
    writeCaption(sessionId, task.serverName, result2.caption);

    sendEvent("refine_image_complete", {
      index: task.index,
      name: task.originalName,
      status: "completed",
      caption: result2.caption,
      reasoningContent: result2.reasoningContent,
    });

    // =========================================================================
    // Phase 3: Krea 2 prompt distillation
    // =========================================================================
    sendEvent("phase", { phase: "distilling", index: task.index });

    const distillUserPrompt = buildDistillUserPrompt(
      result2.caption,
      triggerWordPerson,
      triggerWordOther
    );

    messages.push({ role: "user", content: distillUserPrompt });

    if (abortSignal.aborted) return;

    const response3 = await fetchWithTimeout(
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

    if (!response3.ok) {
      const errorText = await response3.text();
      throw new Error(`API ${response3.status}: ${errorText}`);
    }

    const result3 = await streamResponse(
      response3,
      "distilling",
      task.index,
      sendEvent,
      abortSignal
    );

    if (!result3) return;

    // Write Phase 3 (final) caption to disk
    writeCaption(sessionId, task.serverName, result3.caption);

    sendEvent("distill_image_complete", {
      index: task.index,
      name: task.originalName,
      status: "completed",
      caption: result3.caption,
      reasoningContent: result3.reasoningContent,
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

  let config;

  try {
    const parsed = JSON.parse(configRaw);
    const result = krea2ConfigSchema.safeParse(parsed);
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

  // Use names from config if provided, otherwise fall back to file names
  const configNames = formData.get("imageNames");
  const imageNames = configNames && typeof configNames === "string"
    ? JSON.parse(configNames) as string[]
    : imageFiles.map((f) => f.name);

  const person = config.triggerWordPerson?.trim() ?? "";
  const other = config.triggerWordOther?.trim() ?? "";

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
  const [stream, sendEvent, closeStream] = createSseStream();

  const sessionAbort = new AbortController();
  registerSession(sessionId, sessionAbort);

  request.signal.addEventListener("abort", () => {
    sessionAbort.abort();
  });

  // Send sessionId as first event
  sendEvent("session", { sessionId });

  // Process all images (each image goes through all 3 phases sequentially)
  (async () => {
    try {
      const concurrency = Math.min(MAX_CONCURRENCY, tasks.length);
      const queue = [...tasks];

      async function processNext(): Promise<void> {
        while (queue.length > 0 && !sessionAbort.signal.aborted) {
          const task = queue.shift()!;
          touchSession(sessionId);

          await processImageAllPhases(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            config.systemPrompt,
            config.userPrompt,
            person,
            other,
            config.characterDescription,
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
