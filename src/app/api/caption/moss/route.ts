/**
 * MOSS-Image mode caption endpoint.
 *
 * Implements the image-captioning approach from the MOSS-Image user guide
 * (post-training section): a single recaptioner prompt asks the VLM for
 * exactly one JSON object (long/medium/short captions + watermark boxes +
 * borders) - the caption format used to post-train MOSS-Image-Base.
 *
 * The request body is non-streaming (the shape the app reads) plus the
 * thinking toggle (`chat_template_kwargs.enable_thinking`) and this
 * app's slot-pinning fields for deterministic KV cache reuse. Sampling
 * (temperature, top_p) and the output budget are NOT sent - the
 * llama-server has them pre-configured.
 *
 * Optional grounding, appended to the prompt only when present:
 * - `subjectDescription` (config): what the subject in the images is.
 * - Reference captions: a `captions` file per image (index-paired)
 *   grounds the model on the original caption.
 *
 * The `.txt` caption file written to the session dir (and therefore the
 * downloaded ZIP) contains the normalized JSON caption object.
 *
 * POST /api/caption/moss - accepts FormData, starts processing, returns SSE stream
 * DELETE /api/caption/moss?sessionId=<id> - aborts an active session
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";
import { getModelParallel } from "@/lib/model-utils";
import { prepareForApi } from "@/lib/image-utils";
import {
  createSession,
  saveImagesBatch,
  readImage,
  writeCaption,
  touchSession,
  deleteSession,
} from "@/lib/temp-files";
import {
  parseCaptionRequest,
  handleSessionAbort,
  emitRejectionEvents,
  emitDownscaleNotice,
  summarizeRejections,
  type RejectedImage,
} from "@/lib/caption-route";
import { readFileBuffer, chatComplete, readChatCompletion } from "@/lib/caption-helpers";
import { buildMossChatRequest } from "@/lib/llama-request";
import { buildMossCaptionPrompt, parseMossCaption } from "@/lib/moss-prompt";
import { registerSession, unregisterSession } from "@/lib/session-registry";
import { createSseStream } from "@/lib/sse";
import { runWorkerPool } from "@/lib/worker-pool";
import { mossConfigSchema } from "@/lib/config-schema";
import { logStructured } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageTask {
  index: number;
  serverName: string;    // deduplicated filename on disk (bytes read at process time)
  originalName: string;  // original uploaded filename
  reference: string;     // reference caption text ("" when none was uploaded)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-image timeout: thinking mode plus a long JSON caption is slow. */
const API_TIMEOUT_MS = 15 * 60 * 1000;

/** Client-side ceiling for parallel image processing. */
const MAX_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Per-image processing
// ---------------------------------------------------------------------------

/**
 * Recaption one image: read it from the session dir, build the guide's
 * single user message (text prompt first, image second), call the model
 * non-streaming, and write the normalized JSON caption object to disk.
 */
async function processImage(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  slotId: number,
  enableThinking: boolean,
  subjectDescription: string,
  maxImageDimension: number | undefined,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: task.index, name: task.originalName });

  try {
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
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      imageBuffer,
      maxImageDimension
    );
    const base64 = apiBuffer.toString("base64");
    if (abortSignal.aborted) return;

    // Guide message shape: one user message, text part first, then the
    // image part (no system message - the prompt carries all instructions).
    const messages: Array<Record<string, unknown>> = [
      {
        role: "user",
        content: [
          { type: "text", text: buildMossCaptionPrompt(subjectDescription, task.reference) },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      },
    ];

    const response = await chatComplete(normalizedUrl, {
      model,
      messages,
      slotId,
      timeoutMs: API_TIMEOUT_MS,
      signal: abortSignal,
      body: buildMossChatRequest({ model, messages, slotId, enableThinking }),
    });

    const result = await readChatCompletion(response, abortSignal);
    if (!result || abortSignal.aborted) return;

    if (!result.caption) {
      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "failed",
        error: "empty response from model",
      });
      return;
    }

    // The JSON caption object is the post-training data format - save it
    // normalized (pretty-printed when parseable, trimmed raw otherwise).
    const { normalized } = parseMossCaption(result.caption);
    await writeCaption(sessionId, task.serverName, normalized);

    sendEvent("image_complete", {
      index: task.index,
      name: task.originalName,
      status: "completed",
      caption: normalized,
      reasoningContent: result.reasoningContent,
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
// POST - Start processing and return SSE stream
// Accepts FormData (images as files + optional caption files + config JSON)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const parsed = await parseCaptionRequest(request, mossConfigSchema, ["captions"]);
  if (!parsed.ok) return parsed.response;
  const { config, imageFiles, imageNames } = parsed;

  // Reference caption files - paired by index with images (stem pairing
  // already happened client-side in the uploader).
  const captionFiles = parsed.extraFiles.captions;

  // Create session and save images to temp files
  const session = await createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();

  // Read all image buffers and paired references in parallel, then write
  // the images to disk in parallel.
  const readItems = await Promise.all(
    imageFiles.map(async (file, i) => ({
      i,
      imageBuffer: await readFileBuffer(file),
      originalName: imageNames[i] || `image-${i}.jpg`,
      reference: (await captionFiles[i]?.text().catch(() => "")) ?? "",
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
  const downscaledNames: string[] = [];
  readItems.forEach(({ i, originalName, reference }, idx) => {
    const result = results[idx];
    if (result.name) {
      tasks.push({ index: i, serverName: result.name, originalName, reference });
      if (result.downscaled) downscaledNames.push(originalName);
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

  logStructured("info", "caption session started", {
    mode: "moss",
    sessionId,
    images: imageFiles.length,
    accepted: tasks.length,
    rejected: rejections.length,
  });

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(config.serverUrl));
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
  // each affected row shows its reason instead of a vague timeout, then
  // tell the user which images had their intermediate files downscaled.
  sendEvent("session", { sessionId });
  emitRejectionEvents(sendEvent, rejections, imageFiles.length);
  emitDownscaleNotice(sendEvent, downscaledNames);

  // Process all images in parallel
  (async () => {
    try {
      const serverParallel = await serverParallelPromise;
      if (serverParallel === undefined) {
        sendEvent("warning", {
          message: `Could not detect the server's --parallel for model "${config.model}" - processing at concurrency 1 to stay within the server's slot count.`,
        });
      }
      // Each worker is pinned to its own llama.cpp slot so the slot's KV
      // cache is reused across the batch (worker index is always <
      // server --parallel: clamped to the discovered value, with a
      // concurrency-1 fallback when the value cannot be detected).
      await runWorkerPool(
        tasks,
        Math.min(serverParallel ?? 1, MAX_CONCURRENCY),
        (task, slotId) => {
          touchSession(sessionId);
          return processImage(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            slotId,
            config.enableThinking,
            config.subjectDescription,
            config.maxImageDimension,
            sendEvent,
            sessionAbort.signal
          );
        },
        sessionAbort.signal
      );

      logStructured("info", "caption session ended", {
        mode: "moss",
        sessionId,
        outcome: sessionAbort.signal.aborted ? "aborted" : "completed",
        images: tasks.length,
      });
      if (!sessionAbort.signal.aborted) {
        sendEvent("done", { allComplete: true });
      }
      closeStream();
    } catch (error) {
      logStructured("error", "caption session crashed", {
        mode: "moss",
        sessionId,
        error: String(error),
      });
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
