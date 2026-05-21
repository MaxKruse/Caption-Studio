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
}

export interface CaptionJob {
  id: string;
  images: Map<string, ImageEntry>; // filename -> entry
  serverUrl: string;
  model: string;
  systemPrompt: string;
  promptPrefix: string;
  userPrompt: string;
  createdAt: number;
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
  userPrompt: string
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

  jobs.set(id, {
    id,
    images: imageMap,
    serverUrl,
    model,
    systemPrompt,
    promptPrefix,
    userPrompt,
    createdAt: Date.now(),
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
  error?: string
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const entry = job.images.get(filename);
  if (!entry) return;

  entry.status = status;
  if (caption !== undefined) entry.caption = caption;
  if (error !== undefined) entry.error = error;
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

/** Count images by status for progress reporting. */
export function getProgress(jobId: string): {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
} {
  const job = jobs.get(jobId);
  if (!job) return { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 };

  let queued = 0, processing = 0, completed = 0, failed = 0;
  for (const entry of job.images.values()) {
    switch (entry.status) {
      case "queued": queued++; break;
      case "processing": processing++; break;
      case "completed": completed++; break;
      case "failed": failed++; break;
    }
  }

  return {
    total: job.images.size,
    queued,
    processing,
    completed,
    failed,
  };
}
