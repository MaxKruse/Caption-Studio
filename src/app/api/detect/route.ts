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
 * Normalize a bounding box entry to the internal `bbox_2d: [xmin, ymin, xmax, ymax]` format.
 *
 * Handles three formats:
 * - Gemma format (primary): `box_2d` with `[ymin, xmin, ymax, xmax]` (y-first) — swap to x-first
 * - OpenAI / Qwen format: `bbox_2d` with `[xmin, ymin, xmax, ymax]` (x-first) — pass through
 * - Legacy `bbox_2d` with y-first (old Gemma handling): same swap as above
 *
 * All use 0–1000 normalized coordinates.
 */
function normalizeBoxEntry(entry: Record<string, unknown>): {
  bbox_2d: [number, number, number, number];
  label: string;
  confidence: number;
} | null {
  const rawConfidence = entry.confidence;
  const confidence =
    typeof rawConfidence === "number" && !Number.isNaN(rawConfidence)
      ? Math.max(0, Math.min(1, rawConfidence))
      : 0.5;
  const label = (entry.label as string) ?? "unknown";

  // Gemma format: `box_2d` with [ymin, xmin, ymax, xmax]
  if ("box_2d" in entry && Array.isArray(entry.box_2d) && entry.box_2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = entry.box_2d as [number, number, number, number];
    return {
      bbox_2d: [xmin, ymin, xmax, ymax],
      label,
      confidence,
    };
  }

  // OpenAI / Qwen format: `bbox_2d` with [xmin, ymin, xmax, ymax]
  if ("bbox_2d" in entry && Array.isArray(entry.bbox_2d) && entry.bbox_2d.length === 4) {
    return {
      bbox_2d: entry.bbox_2d as [number, number, number, number],
      label,
      confidence,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Label classification for flat array format
// ---------------------------------------------------------------------------

/** Keywords that indicate a face/head detection. Checked in order of specificity. */
const FACE_KEYWORDS = ["face", "head", "portrait", "face close-up", "face shot"];

/** Keywords that indicate a body/full-body detection. */
const BODY_KEYWORDS = ["body", "full body", "full-body", "person", "figure", "pose", "torso"];

/**
 * Classify a label string as "face", "body", or "unknown".
 * Used when the model returns a flat array of detections without explicit category grouping.
 */
function classifyLabel(label: string): "face" | "body" | "unknown" {
  const lower = label.toLowerCase().trim();
  for (const keyword of FACE_KEYWORDS) {
    if (lower.includes(keyword)) return "face";
  }
  for (const keyword of BODY_KEYWORDS) {
    if (lower.includes(keyword)) return "body";
  }
  return "unknown";
}

/**
 * Extract a balanced bracket/brace structure from a string starting at a given index.
 * Handles nested brackets/braces and strings (ignores brackets inside quoted strings).
 */
function extractBalanced(
  str: string,
  startIndex: number,
  openChar: string,
  closeChar: string
): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i];

    // Handle string escaping
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }

    // Skip characters inside strings
    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return str.substring(startIndex, i + 1);
      }
    }
  }

  return null; // Unbalanced
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse the model's detection response into face and body bounding box arrays.
 *
 * Handles three response shapes:
 * 1. **Flat JSON array** (Gemma 4 native): `[{box_2d: [...], label: "face"}, ...]`
 *    — sorted into faces/bodies by label classification
 * 2. **Object with faces/bodies arrays** (legacy): `{faces: [...], bodies: [...]}`
 * 3. **Markdown code blocks** wrapping either format
 *
 * Normalizes both `box_2d` (y-first) and `bbox_2d` (x-first) coordinate formats.
 * Defaults confidence to 0.5 when missing.
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

  // Try parsing the string as-is first (works for clean JSON)
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If it fails, try to extract a JSON structure from surrounding text.
    // Use bracket-matching to find the outermost JSON object or array.
    parsed = null;

    const firstBracket = jsonStr.indexOf("[");
    const firstBrace = jsonStr.indexOf("{");

    // Determine which structure comes first:
    // - If `[` comes first (or there's no `{`), it's a flat array
    // - If `{` comes first (and before any `[`), it's a legacy object
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      const extracted = extractBalanced(jsonStr, firstBracket, "[", "]");
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch { /* fall through */ }
      }
    }

    if (!parsed && firstBrace !== -1) {
      const extracted = extractBalanced(jsonStr, firstBrace, "{", "}");
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch { /* fall through */ }
      }
    }

    if (!parsed) {
      return { faceBoxes: [], bodyBoxes: [] };
    }
  }

  if (!parsed) {
    return { faceBoxes: [], bodyBoxes: [] };
  }

  const parseBoxArray = (
    arr: unknown[]
  ): Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }> => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((b: unknown): b is Record<string, unknown> => b != null && typeof b === "object")
      .map((b) => normalizeBoxEntry(b))
      .filter((b): b is NonNullable<typeof b> => b !== null);
  };

  // Case 1: Flat JSON array (Gemma 4 native format)
  if (Array.isArray(parsed)) {
    const allBoxes = parseBoxArray(parsed);
    return {
      faceBoxes: allBoxes.filter((b) => classifyLabel(b.label) === "face"),
      bodyBoxes: allBoxes.filter((b) => classifyLabel(b.label) === "body"),
    };
  }

  // Case 2: Object with faces/bodies arrays (legacy format)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      faceBoxes: parseBoxArray((parsed as Record<string, unknown>).faces as unknown[] ?? []),
      bodyBoxes: parseBoxArray((parsed as Record<string, unknown>).bodies as unknown[] ?? []),
    };
  }

  return { faceBoxes: [], bodyBoxes: [] };
}
