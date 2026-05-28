/**
 * Face/body detection endpoint with SSE progress streaming.
 * POST /api/detect — start detection job, returns jobId
 * GET  /api/detect?jobId=<id> — streams SSE progress updates
 */

import { NextRequest } from "next/server";
import { prepareForDetection } from "@/lib/image-utils";
import { normalizeServerUrl } from "@/lib/url-utils";
import {
  DETECTION_CONCURRENCY,
  getDetectionPrompts,
} from "@/components/CaptionStudioCropConstants";
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
// Request/response types
// ---------------------------------------------------------------------------

interface DetectRequest {
  serverUrl: string;
  model: string;
  contentMode: "sfw" | "nsfw";
  /** Max concurrent detection requests (defaults to DETECTION_CONCURRENCY). */
  parallelRequests?: number;
}

// ---------------------------------------------------------------------------
// POST - Start detection job (async with SSE progress)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const configRaw = formData.get("config");
  if (!configRaw || typeof configRaw !== "string") {
    return Response.json({ error: "Missing config" }, { status: 400 });
  }

  let config: DetectRequest;
  try {
    config = JSON.parse(configRaw);
  } catch {
    return Response.json({ error: "Invalid config JSON" }, { status: 400 });
  }

  if (!config.serverUrl || !config.model) {
    return Response.json(
      { error: "serverUrl and model are required" },
      { status: 400 }
    );
  }

  const imageFiles = formData.getAll("images") as File[];
  if (imageFiles.length === 0) {
    return Response.json({ error: "No images provided" }, { status: 400 });
  }

  const contentMode = config.contentMode ?? "nsfw";
  const parallelRequests = config.parallelRequests ?? DETECTION_CONCURRENCY;

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
  const baseUrl = normalizeServerUrl(serverUrl);
  const { systemPrompt, userPrompt } = getDetectionPrompts(contentMode);
  const primaryQueue: File[] = [...imageFiles];
  const retryCount = new Map<string, number>();

  /** Attempt detection for a single image. Returns true if successful. */
  async function attemptDetection(file: File): Promise<boolean> {
    const attempts = retryCount.get(file.name) ?? 0;

    try {
      const imageBuffer = Buffer.from(await file.arrayBuffer());
      const { buffer, mimeType } = await prepareForDetection(imageBuffer);
      const base64 = buffer.toString("base64");

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
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
          ],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(180_000), // 3 min timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = (data?.choices?.[0]?.message?.content ?? "").trim();
      const { faceBoxes, bodyBoxes } = parseDetectionResponse(content);

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

  /** Worker that processes images from a queue. */
  async function worker(queue: File[]): Promise<void> {
    while (queue.length > 0) {
      const file = queue.shift()!;
      updateDetectionImage(jobId, file.name, "processing");
      await attemptDetection(file);
    }
  }

  // Launch workers for primary queue
  await Promise.all(
    Array.from(
      { length: Math.min(parallelRequests, primaryQueue.length) },
      () => worker(primaryQueue)
    )
  );

  // Process retry queue
  const retryQueue = getRetryQueue(jobId);
  if (retryQueue && retryQueue.size > 0) {
    const retryFiles = Array.from(retryQueue.values());
    await Promise.all(
      Array.from(
        { length: Math.min(parallelRequests, retryFiles.length) },
        () => worker(retryFiles)
      )
    );
    retryQueue.clear();
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse the model's detection response into face and body bounding box arrays.
 * Handles JSON objects, markdown code blocks, and plain text.
 * Extracts confidence scores (defaults to 0.5 when missing).
 */
export function parseDetectionResponse(content: string): {
  faceBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  bodyBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
} {
  if (!content) {
    return { faceBoxes: [], bodyBoxes: [] };
  }

  // Try to extract JSON from markdown code blocks
  let jsonStr = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the text
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    const parseBoxArray = (
      arr: unknown[]
    ): Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }> => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((b: unknown): b is Record<string, unknown> => b != null && typeof b === "object")
        .map((b) => {
          const rawConfidence = b.confidence;
          const confidence =
            typeof rawConfidence === "number" && !Number.isNaN(rawConfidence)
              ? Math.max(0, Math.min(1, rawConfidence))
              : 0.5;
          return {
            bbox_2d: b.bbox_2d as [number, number, number, number],
            label: (b.label as string) ?? "unknown",
            confidence,
          };
        })
        .filter((b) => b.bbox_2d && Array.isArray(b.bbox_2d) && b.bbox_2d.length === 4);
    };

    return {
      faceBoxes: parseBoxArray(parsed.faces as unknown[] ?? []),
      bodyBoxes: parseBoxArray(parsed.bodies as unknown[] ?? []),
    };
  } catch {
    return { faceBoxes: [], bodyBoxes: [] };
  }
}
