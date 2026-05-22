/**
 * In-memory store for batch captioning jobs.
 * Each job tracks uploaded images, processing status, and results.
 */

export interface ImageEntry {
  name: string;
  data: Buffer;
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  error?: string;
  prompt?: string; // the prompt text sent to the API for this image
  reasoningContent?: string; // reasoning_content from the API (some models)
  processingStartedAt?: number; // timestamp when processing began
  processingDurationMs?: number; // ms taken to complete (completed or failed)
}

export interface CaptionJob {
  id: string;
  images: Map<string, ImageEntry>; // filename -> entry
  serverUrl: string;
  model: string;
  systemPrompt: string;
  promptPrefix: string;
  userPrompt: string;
  captionName: string;
  includeNameInPrompt: boolean;
  parallelRequests: number;
  createdAt: number;
  abortSignal: AbortController; // used to cancel processing workers
}

/** Global map of active jobs. Keyed by job ID. */
const jobs = new Map<string, CaptionJob>();

/** Generate a short random job ID. */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/** Create a new job and return its ID. */
export function createJob(
  images: { name: string; data: Buffer }[],
  serverUrl: string,
  model: string,
  systemPrompt: string,
  promptPrefix: string,
  userPrompt: string,
  captionName: string,
  includeNameInPrompt: boolean,
  parallelRequests: number
): string {
  const id = generateId();
  const imageMap = new Map<string, ImageEntry>();

  for (const img of images) {
    imageMap.set(img.name, {
      name: img.name,
      data: img.data,
      status: "queued",
    });
  }

  const abortController = new AbortController();

  jobs.set(id, {
    id,
    images: imageMap,
    serverUrl,
    model,
    systemPrompt,
    promptPrefix,
    userPrompt,
    captionName,
    includeNameInPrompt,
    parallelRequests,
    createdAt: Date.now(),
    abortSignal: abortController,
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
