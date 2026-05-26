/**
 * In-memory store for face/body detection jobs.
 * Tracks per-image detection progress for SSE streaming.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectionImageEntry {
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  faceBoxes?: Array<{ bbox_2d: [number, number, number, number]; label: string }>;
  bodyBoxes?: Array<{ bbox_2d: [number, number, number, number]; label: string }>;
  error?: string;
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
    imageMap.set(name, { name, status: "queued" });
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
  return true;
}

/** Count images by status for progress reporting. */
export function getDetectionProgress(jobId: string): {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
} {
  const job = detectionJobs.get(jobId);
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

/** Build a per-image status map for API responses. */
export function buildDetectionStatusMap(
  job: DetectionJob
): Record<string, { status: string; faceBoxes?: unknown[]; bodyBoxes?: unknown[]; error?: string }> {
  const statuses: Record<string, { status: string; faceBoxes?: unknown[]; bodyBoxes?: unknown[]; error?: string }> = {};

  for (const [, entry] of job.images.entries()) {
    statuses[entry.name] = {
      status: entry.status,
      faceBoxes: entry.faceBoxes,
      bodyBoxes: entry.bodyBoxes,
      error: entry.error,
    };
  }

  return statuses;
}
