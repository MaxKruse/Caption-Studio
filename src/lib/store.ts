/**
 * In-memory store for batch captioning jobs.
 * Each job tracks uploaded images, processing status, and results.
 * Images are cropped ONCE at job creation and stored as cropped data.
 */

import sharp from "sharp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageCropData {
  cropType: "portrait" | "body";
  cropRect: { x: number; y: number; width: number; height: number };
}

export interface ImageEntry {
  name: string;
  data: Buffer;          // cropped image data (or original if no crop)
  originalData: Buffer;  // always the original uncropped data
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  error?: string;
  prompt?: string; // the prompt text sent to the API for this image
  reasoningContent?: string; // reasoning_content from the API (some models)
  processingStartedAt?: number; // timestamp when processing began
  processingDurationMs?: number; // ms taken to complete (completed or failed)
  crop?: ImageCropData; // crop configuration (1000-normalized coords)
}

export interface CaptionJob {
  id: string;
  images: Map<string, ImageEntry>; // filename -> entry
  serverUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  captionTypeId: string;
  triggerWord: string;
  subjectName: string;
  parallelRequests: number;
  createdAt: number;
  abortSignal: AbortController; // used to cancel processing workers
  cropData?: Record<string, ImageCropData>; // filename -> crop config
}

/** Global map of active jobs. Keyed by job ID. */
const jobs = new Map<string, CaptionJob>();

/** Generate a short random job ID. */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Apply a crop to an image buffer. Returns cropped buffer.
 * cropRect is in 1000-normalized coordinates.
 */
async function applyCropToBuffer(
  imageBuffer: Buffer,
  cropRect: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const scaleX = width / 1000;
  const scaleY = height / 1000;

  const left = Math.max(0, Math.round(cropRect.x * scaleX));
  const top = Math.max(0, Math.round(cropRect.y * scaleY));
  const cropWidth = Math.min(width - left, Math.round(cropRect.width * scaleX));
  const cropHeight = Math.min(height - top, Math.round(cropRect.height * scaleY));

  return sharp(imageBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toBuffer();
}

/** Create a new job and return its ID. Images are cropped at creation time. */
export async function createJob(
  images: { name: string; data: Buffer }[],
  serverUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  captionTypeId: string,
  triggerWord: string,
  subjectName: string,
  parallelRequests: number,
  cropData?: Record<string, ImageCropData>
): Promise<string> {
  const id = generateId();
  const imageMap = new Map<string, ImageEntry>();

  for (const img of images) {
    const cropConfig = cropData?.[img.name];
    let croppedData: Buffer;

    if (cropConfig?.cropRect) {
      croppedData = await applyCropToBuffer(img.data, cropConfig.cropRect);
    } else {
      croppedData = img.data;
    }

    imageMap.set(img.name, {
      name: img.name,
      data: croppedData,
      originalData: img.data,
      status: "queued",
      crop: cropConfig,
    });
  }

  const abortController = new AbortController();

  jobs.set(id, {
    id,
    images: imageMap,
    serverUrl,
    model,
    systemPrompt,
    userPrompt,
    captionTypeId,
    triggerWord,
    subjectName,
    parallelRequests,
    createdAt: Date.now(),
    abortSignal: abortController,
    cropData,
  });

  return id;
}

/** Get a job by ID. */
export function getJob(id: string): CaptionJob | undefined {
  return jobs.get(id);
}

/** Delete a job (cleanup after download). */
export function deleteJob(id: string): void {
  jobs.delete(id);
}

/** Update the status of a single image entry within a job. */
export function updateImageStatus(
  jobId: string,
  filename: string,
  status: ImageEntry["status"],
  caption?: string,
  error?: string,
  prompt?: string,
  reasoningContent?: string
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const entry = job.images.get(filename);
  if (!entry) return;

  // Track processing start time
  if (status === "processing" && !entry.processingStartedAt) {
    entry.processingStartedAt = Date.now();
  }

  // Track processing duration when done
  if ((status === "completed" || status === "failed") && entry.processingStartedAt) {
    entry.processingDurationMs = Date.now() - entry.processingStartedAt;
  }

  entry.status = status;
  if (caption !== undefined) entry.caption = caption;
  if (error !== undefined) entry.error = error;
  if (prompt !== undefined) entry.prompt = prompt;
  if (reasoningContent !== undefined) entry.reasoningContent = reasoningContent;
}

/** Check if all images in a job are done (completed or failed). */
export function isJobDone(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return true;

  for (const entry of job.images.values()) {
    if (entry.status === "queued" || entry.status === "processing") {
      return false;
    }
  }
  return true;
}

/** Abort a job — marks all queued images as failed and signals workers to stop. */
export function abortJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;

  // Mark all queued images as failed
  for (const entry of job.images.values()) {
    if (entry.status === "queued") {
      entry.status = "failed";
      entry.error = "Aborted by user";
    }
  }

  // Signal workers to stop
  job.abortSignal.abort();

  return true;
}

/** Count images by status for progress reporting. */
export function getProgress(jobId: string): {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  avgTimeMs?: number;       // average ms per completed/failed image
  estimatedRemainingMs?: number; // estimated ms remaining
} {
  const job = jobs.get(jobId);
  if (!job) return { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 };

  let queued = 0, processing = 0, completed = 0, failed = 0;
  const durations: number[] = [];

  for (const entry of job.images.values()) {
    switch (entry.status) {
      case "queued": queued++; break;
      case "processing": processing++; break;
      case "completed": completed++; break;
      case "failed": failed++; break;
    }
    if (entry.processingDurationMs != null) {
      durations.push(entry.processingDurationMs);
    }
  }

  const result: ReturnType<typeof getProgress> = {
    total: job.images.size,
    queued,
    processing,
    completed,
    failed,
  };

  // Calculate average time and remaining estimate if we have data
  if (durations.length > 0) {
    const avgTimeMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const remainingImages = queued;
    result.avgTimeMs = avgTimeMs;
    result.estimatedRemainingMs = Math.round(avgTimeMs * remainingImages);
  }

  return result;
}

/** Build a per-image status map for API responses. */
export function buildStatusMap(
  job: CaptionJob
): Record<
  string,
  {
    status: string;
    caption?: string;
    error?: string;
    prompt?: string;
    reasoningContent?: string;
  }
> {
  const statuses: Record<
    string,
    {
      status: string;
      caption?: string;
      error?: string;
      prompt?: string;
      reasoningContent?: string;
    }
  > = {};

  for (const [filename, entry] of job.images.entries()) {
    statuses[filename] = {
      status: entry.status,
      caption: entry.caption,
      error: entry.error,
      prompt: entry.prompt,
      reasoningContent: entry.reasoningContent,
    };
  }

  return statuses;
}
