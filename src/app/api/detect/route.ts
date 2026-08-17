/**
 * Face/body detection endpoint with SSE progress streaming.
 * POST /api/detect — start detection job, returns jobId
 * GET  /api/detect?jobId=<id> — streams SSE progress updates
 *
 * Uses the shared route stack where the wire contract allows it:
 * parseCaptionRequest (Zod-validated config) and chatComplete
 * (slot-pinned request building + timeout + error mapping). The SSE
 * payload format is detect-specific (raw progress objects with a
 * terminal `done: true` flag) and is kept stable for API consumers.
 */

import { NextRequest } from "next/server";
import { prepareForDetection } from "@/lib/image-utils";
import { getModelParallel } from "@/lib/model-utils";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";
import { parseDetectionResponse } from "@/lib/detect-parsing";
import { chatComplete } from "@/lib/caption-helpers";
import { parseCaptionRequest } from "@/lib/caption-route";
import { detectConfigSchema } from "@/lib/config-schema";
import {
  DETECTION_CONCURRENCY,
  getDetectionPrompts,
} from "@/lib/detection-prompts";
import {
  createDetectionJob,
  getDetectionJob,
  cleanupJob,
  updateDetectionImage,
  isDetectionDone,
  getDetectionProgress,
  buildDetectionStatusMap,
  getRetryQueue,
  addToRetryQueue,
} from "@/lib/detect-store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DETECTION_API_TIMEOUT_MS = 600_000; // 10 min per image

// ---------------------------------------------------------------------------
// POST - Start detection job (async with SSE progress)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const parsed = await parseCaptionRequest(request, detectConfigSchema);
  if (!parsed.ok) return parsed.response;
  const { config, imageFiles } = parsed;

  const contentMode = config.contentMode;

  // Determine concurrency: use client value, auto-detect from server, or fall back to default
  let parallelRequests: number;
  if (config.parallelRequests && config.parallelRequests > 0) {
    parallelRequests = config.parallelRequests;
  } else {
    const serverParallel = await getModelParallel(config.serverUrl, config.model);
    parallelRequests = serverParallel ?? DETECTION_CONCURRENCY;
  }
  parallelRequests = Math.min(Math.max(parallelRequests, 1), 8);

  // Create detection job in store
  const imageNames = imageFiles.map((f) => f.name);
  const jobId = createDetectionJob(
    imageNames,
    config.serverUrl,
    config.model
  );

  // Start async processing (fire and forget)
  void processDetectionJob(jobId, config.serverUrl, config.model, imageFiles, contentMode, parallelRequests);

  return Response.json({ jobId });
}

// ---------------------------------------------------------------------------
// GET - SSE progress stream for detection job
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = getDetectionJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // Create an SSE stream
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  // Send an SSE event
  const sendEvent = (data: unknown) => {
    if (controller) {
      const line = `data: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(line));
    }
  };

  // Send initial progress
  sendEvent(getDetectionProgress(jobId));

  // Poll for updates every 300ms
  const interval = setInterval(() => {
    const progress = getDetectionProgress(jobId);
    const jobRef = getDetectionJob(jobId);

    const statuses = jobRef ? buildDetectionStatusMap(jobRef) : {};
    sendEvent({ ...progress, statuses });

    if (isDetectionDone(jobId)) {
      clearInterval(interval);
      sendEvent({ ...progress, statuses, done: true });
      controller?.close();

      // Cleanup job from memory
      cleanupJob(jobId);
    }
  }, 300);

  // Cleanup on client disconnect
  request.signal.addEventListener("abort", () => {
    clearInterval(interval);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Async detection processor
// ---------------------------------------------------------------------------

/** Process all images for face + body detection (parallel worker pool with retry). */
async function processDetectionJob(
  jobId: string,
  serverUrl: string,
  model: string,
  imageFiles: File[],
  contentMode: "sfw" | "nsfw",
  parallelRequests: number
): Promise<void> {
  const baseUrl = normalizeServerUrl(toDockerHostUrl(serverUrl));
  const { systemPrompt, userPrompt } = getDetectionPrompts(contentMode, model);
  const primaryQueue: File[] = [...imageFiles];
  const retryCount = new Map<string, number>();

  /**
   * Attempt detection for a single image. Returns true if successful.
   * Pinned to the worker's llama.cpp slot so retries and later images
   * from the same worker reuse the slot's cached system prompt KV.
   */
  async function attemptDetection(file: File, slotId: number): Promise<boolean> {
    const attempts = retryCount.get(file.name) ?? 0;

    try {
      const imageBuffer = Buffer.from(await file.arrayBuffer());
      const { buffer, mimeType, width, height } = await prepareForDetection(imageBuffer);
      const base64 = buffer.toString("base64");

      const messages: Array<Record<string, unknown>> = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ];

      // maxRetries: 0 - retries are managed by the job-level retry wave,
      // which also records "failed/retrying" state in the store.
      const response = await chatComplete(baseUrl, {
        model,
        messages,
        slotId,
        timeoutMs: DETECTION_API_TIMEOUT_MS,
        stream: false,
        maxRetries: 0,
      });

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = String(data.choices?.[0]?.message?.content ?? "").trim();
      const { faceBoxes, bodyBoxes } = parseDetectionResponse(content, { width, height });

      // Check if detection found anything useful
      const hasAnyDetection = faceBoxes.length > 0 || bodyBoxes.length > 0;

      if (!hasAnyDetection && attempts === 0) {
        // No face or body detected — retry once
        retryCount.set(file.name, 1);
        updateDetectionImage(
          jobId,
          file.name,
          "failed",
          [],
          [],
          `No face or body detected — retrying (attempt 1/1)`
        );
        addToRetryQueue(jobId, file);
        return false;
      }

      updateDetectionImage(
        jobId,
        file.name,
        "completed",
        faceBoxes,
        bodyBoxes
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (attempts === 0) {
        // First attempt failed — retry once
        retryCount.set(file.name, 1);
        updateDetectionImage(
          jobId,
          file.name,
          "failed",
          [],
          [],
          `Detection failed — retrying (attempt 1/1): ${message}`
        );
        addToRetryQueue(jobId, file);
        return false;
      }

      // Second attempt also failed — skip this image
      updateDetectionImage(
        jobId,
        file.name,
        "skipped",
        [],
        [],
        `Detection failed permanently after retry: ${message}`
      );
      return false;
    }
  }

  /** Worker that processes images from a queue, pinned to one llama.cpp slot. */
  async function worker(queue: File[], slotId: number): Promise<void> {
    while (queue.length > 0) {
      const file = queue.shift()!;
      updateDetectionImage(jobId, file.name, "processing");
      await attemptDetection(file, slotId);
    }
  }

  // Launch workers for primary queue (each pinned to its own slot so the
  // shared system prompt KV is reused across images of the same worker)
  await Promise.all(
    Array.from(
      { length: Math.min(parallelRequests, primaryQueue.length) },
      (_, workerIndex) => worker(primaryQueue, workerIndex)
    )
  );

  // Process retry queue
  const retryQueue = getRetryQueue(jobId);
  if (retryQueue && retryQueue.size > 0) {
    const retryFiles = Array.from(retryQueue.values());
    await Promise.all(
      Array.from(
        { length: Math.min(parallelRequests, retryFiles.length) },
        (_, workerIndex) => worker(retryFiles, workerIndex)
      )
    );
    retryQueue.clear();
  }
}
