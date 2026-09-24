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
import { getModelParallel } from "@/lib/model-utils";
import { prepareForApi } from "@/lib/image-utils";
import { buildUserPrompt } from "@/lib/prompt-utils";
import {
  createSession,
  saveImagesBatch,
  readImage,
  writeCaption,
  touchSession,
  deleteSession,
} from "@/lib/temp-files";
import {
  buildRefineUserPrompt,
  buildDistillUserPrompt,
} from "@/lib/krea2-prompts";
import { buildKrea2SystemPrompt } from "@/lib/krea2-system-prompt";
import { readFileBuffer, chatComplete, streamResponse } from "@/lib/caption-helpers";
import {
  parseCaptionRequest,
  handleSessionAbort,
  emitRejectionEvents,
  summarizeRejections,
  type RejectedImage,
} from "@/lib/caption-route";
import { registerSession, unregisterSession } from "@/lib/session-registry";
import { createSseStream } from "@/lib/sse";
import { runWorkerPool } from "@/lib/worker-pool";
import { krea2ConfigSchema } from "@/lib/config-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageTask {
  index: number;
  serverName: string;    // deduplicated filename on disk (bytes read at process time)
  originalName: string;  // original uploaded filename
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max time allowed per API call (all 3 phases share one call, so generous). */
const API_TIMEOUT_MS = 15 * 60 * 1000;

/** Per-image per-phase timeout to avoid 15 min worst case for a batch. */
const PER_IMAGE_PHASE_TIMEOUT_MS = 5 * 60 * 1000;

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
 * The image is only in the first user message. All phases are pinned to
 * the same llama.cpp slot (slotId = worker index) so the server reuses
 * the cached KV of the image + prior phases instead of re-prefilling.
 */
async function processImageAllPhases(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  slotId: number,
  systemPrompt: string,
  userPrompt: string,
  triggerWordPerson: string,
  triggerWordOther: string,
  characterDescription: string,
  maxImageDimension: number | undefined,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: task.index, name: task.originalName });

  try {
    // Read the image from the session dir at process time: tasks carry
    // only names, so a large batch does not hold raw image bytes in RAM.
    // The buffer is kept for all 3 phases of this conversation.
    const imageBuffer = await readImage(sessionId, task.serverName);
    if (!imageBuffer) {
      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "failed",
        error: "image file missing from the session (it may have been cleaned up)",
      });
      return;
    }
    // Prepare image once (used in first message of the conversation)
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      imageBuffer,
      maxImageDimension
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

    const response1 = await chatComplete(normalizedUrl, {
      model,
      messages,
      slotId,
      timeoutMs: API_TIMEOUT_MS,
      signal: abortSignal,
    });

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
    await writeCaption(sessionId, task.serverName, result1.caption);

    sendEvent("image_complete", {
      index: task.index,
      name: task.originalName,
      phase: "captioning",
      status: "completed",
      caption: result1.caption,
      reasoningContent: result1.reasoningContent,
      cachedTokens: result1.cachedTokens,
      promptTokens: result1.promptTokens,
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

    const response2 = await chatComplete(normalizedUrl, {
      model,
      messages,
      slotId,
      timeoutMs: PER_IMAGE_PHASE_TIMEOUT_MS,
      signal: abortSignal,
    });

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
    await writeCaption(sessionId, task.serverName, result2.caption);

    sendEvent("refine_image_complete", {
      index: task.index,
      name: task.originalName,
      status: "completed",
      caption: result2.caption,
      reasoningContent: result2.reasoningContent,
      cachedTokens: result2.cachedTokens,
      promptTokens: result2.promptTokens,
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

    const response3 = await chatComplete(normalizedUrl, {
      model,
      messages,
      slotId,
      timeoutMs: PER_IMAGE_PHASE_TIMEOUT_MS,
      signal: abortSignal,
    });

    const result3 = await streamResponse(
      response3,
      "distilling",
      task.index,
      sendEvent,
      abortSignal
    );

    if (!result3) return;

    // Write Phase 3 (final) caption to disk
    await writeCaption(sessionId, task.serverName, result3.caption);

    sendEvent("distill_image_complete", {
      index: task.index,
      name: task.originalName,
      status: "completed",
      caption: result3.caption,
      reasoningContent: result3.reasoningContent,
      cachedTokens: result3.cachedTokens,
      promptTokens: result3.promptTokens,
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
  const parsed = await parseCaptionRequest(request, krea2ConfigSchema);
  if (!parsed.ok) return parsed.response;
  const { config, imageFiles, imageNames } = parsed;

  const person = config.triggerWordPerson?.trim() ?? "";
  const other = config.triggerWordOther?.trim() ?? "";

  // Create session and save images to temp files
  const session = await createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();

  // Read all image buffers in parallel, then write them to disk in parallel.
  const readItems = await Promise.all(
    imageFiles.map(async (file, i) => ({
      i,
      imageBuffer: await readFileBuffer(file),
      originalName: imageNames[i] || `image-${i}.jpg`,
    }))
  );

  const results = await saveImagesBatch(
    sessionId,
    readItems.map(({ imageBuffer, originalName }) => ({
      originalName,
      data: imageBuffer,
    })),
    usedBases
  );

  const tasks: ImageTask[] = [];
  const rejections: RejectedImage[] = [];
  readItems.forEach(({ i, originalName }, idx) => {
    const result = results[idx];
    if (result.name) {
      tasks.push({ index: i, serverName: result.name, originalName });
    } else {
      rejections.push({
        index: i,
        name: originalName,
        reason: result.reason ?? "invalid-format",
      });
    }
  });

  if (tasks.length === 0) {
    await deleteSession(sessionId);
    return Response.json(
      { error: `No valid images to process - ${summarizeRejections(rejections, imageFiles.length)}` },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(config.serverUrl));
  const effectiveSystemPrompt = config.systemPrompt?.trim() ? config.systemPrompt : buildKrea2SystemPrompt();
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

  // Send sessionId as first event, then report any upload rejections so
  // each affected row shows its reason instead of a vague timeout.
  sendEvent("session", { sessionId });
  emitRejectionEvents(sendEvent, rejections, imageFiles.length);

  // Process all images (each image goes through all 3 phases sequentially)
  (async () => {
    try {
      const serverParallel = await serverParallelPromise;
      // Each worker is pinned to its own llama.cpp slot so its images and
      // phases share the slot's KV cache (worker index < maxConcurrency
      // which is clamped to the server's --parallel).
      await runWorkerPool(
        tasks,
        Math.min(serverParallel ?? MAX_CONCURRENCY, MAX_CONCURRENCY),
        (task, slotId) => {
          touchSession(sessionId);
          return processImageAllPhases(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            slotId,
            effectiveSystemPrompt,
            config.userPrompt,
            person,
            other,
            config.characterDescription,
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
// DELETE - Abort an active session
// ---------------------------------------------------------------------------
export function DELETE(request: NextRequest) {
  return handleSessionAbort(request);
}
