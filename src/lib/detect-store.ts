/**
 * In-memory store for face/body detection jobs.
 * Tracks per-image detection progress for SSE streaming.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectionImageEntry {
  name: string;
  status: "queued" | "processing" | "completed" | "failed" | "skipped";
  faceBoxes?: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  bodyBoxes?: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  error?: string;
  /** Number of retry attempts made (0 = not retried yet). */
  retryCount: number;
}

export interface DetectionJob {
  id: string;
  images: Map<string, DetectionImageEntry>;
  serverUrl: string;
  model: string;
  createdAt: number;
}

/** Global map of active detection jobs. */
const detectionJobs = new Map<string, DetectionJob>();

/** Queue of files waiting for retry (filename -> file). */
const retryQueues = new Map<string, Map<string, File>>();

/** Generate a short random job ID. */
function generateId(): string {
  return `det_${Math.random().toString(36).substring(2, 10)}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Create a new detection job. All images start as "queued". */
export function createDetectionJob(
  imageNames: string[],
  serverUrl: string,
  model: string
): string {
  const id = generateId();
  const imageMap = new Map<string, DetectionImageEntry>();

  for (const name of imageNames) {
    imageMap.set(name, { name, status: "queued", retryCount: 0 });
  }

  detectionJobs.set(id, {
    id,
    images: imageMap,
    serverUrl,
    model,
    createdAt: Date.now(),
  });

  return id;
}

/** Get a detection job by ID. */
export function getDetectionJob(id: string): DetectionJob | undefined {
  return detectionJobs.get(id);
}

/** Delete a detection job (cleanup after completion). */
export function deleteDetectionJob(id: string): void {
  detectionJobs.delete(id);
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

/** Update the status of a single image in a detection job. */
export function updateDetectionImage(
  jobId: string,
  filename: string,
  status: DetectionImageEntry["status"],
  faceBoxes?: DetectionImageEntry["faceBoxes"],
  bodyBoxes?: DetectionImageEntry["bodyBoxes"],
  error?: string
): void {
  const job = detectionJobs.get(jobId);
  if (!job) return;
  const entry = job.images.get(filename);
  if (!entry) return;

  entry.status = status;
  if (faceBoxes !== undefined) entry.faceBoxes = faceBoxes;
  if (bodyBoxes !== undefined) entry.bodyBoxes = bodyBoxes;
  if (error !== undefined) entry.error = error;
}

// ---------------------------------------------------------------------------
// Progress queries
// ---------------------------------------------------------------------------

/** Check if all images in a detection job are done. */
export function isDetectionDone(jobId: string): boolean {
  const job = detectionJobs.get(jobId);
  if (!job) return true;

  for (const entry of job.images.values()) {
    if (entry.status === "queued" || entry.status === "processing") {
      return false;
    }
  }
  // Check if there are any failed images that haven't been retried yet
  const hasUnretriedFailed = Array.from(job.images.values()).some(
    (entry) => entry.status === "failed" && entry.retryCount === 0
  );
  if (hasUnretriedFailed) {
    return false;
  }
  return true;
}

/** Count images by status for progress reporting. */
export function getDetectionProgress(jobId: string): {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
} {
  const job = detectionJobs.get(jobId);
  if (!job) return { total: 0, queued: 0, processing: 0, completed: 0, failed: 0, skipped: 0 };

  let queued = 0, processing = 0, completed = 0, failed = 0, skipped = 0;

  for (const entry of job.images.values()) {
    switch (entry.status) {
      case "queued": queued++; break;
      case "processing": processing++; break;
      case "completed": completed++; break;
      case "failed": failed++; break;
      case "skipped": skipped++; break;
    }
  }

  return {
    total: job.images.size,
    queued,
    processing,
    completed,
    failed,
    skipped,
  };
}

/** Get files waiting for retry for a job. */
export function getRetryQueue(jobId: string): Map<string, File> | undefined {
  return retryQueues.get(jobId);
}

/** Add a file to the retry queue for a job. */
export function addToRetryQueue(jobId: string, file: File): void {
  let queue = retryQueues.get(jobId);
  if (!queue) {
    queue = new Map();
    retryQueues.set(jobId, queue);
  }
  queue.set(file.name, file);
}

/** Remove all retry queues for a job. */
export function cleanupJob(jobId: string): void {
  deleteDetectionJob(jobId);
  retryQueues.delete(jobId);
}

/** Build a per-image status map for API responses. */
export function buildDetectionStatusMap(
  job: DetectionJob
): Record<string, { status: string; faceBoxes?: unknown[]; bodyBoxes?: unknown[]; error?: string; retryCount?: number }> {
  const statuses: Record<string, { status: string; faceBoxes?: unknown[]; bodyBoxes?: unknown[]; error?: string; retryCount?: number }> = {};

  for (const [, entry] of job.images.entries()) {
    statuses[entry.name] = {
      status: entry.status,
      faceBoxes: entry.faceBoxes,
      bodyBoxes: entry.bodyBoxes,
      error: entry.error,
      retryCount: entry.retryCount,
    };
  }

  return statuses;
}
