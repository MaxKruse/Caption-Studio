/**
 * Tests for the in-memory caption job store (store.ts).
 * Tests job creation, progress tracking, and abort behavior.
 */

import { describe, it, expect } from "bun:test";
import {
  createJob,
  getJob,
  deleteJob,
  updateImageStatus,
  updateImagePartial,
  isJobDone,
  abortJob,
  getProgress,
  buildStatusMap,
} from "@/lib/store";

// ---------------------------------------------------------------------------
// Helper: create a test job
// ---------------------------------------------------------------------------

async function createTestJob(imageCount: number = 3): Promise<string> {
  const images = Array.from({ length: imageCount }, (_, i) => ({
    name: `image-${i}.jpg`,
    data: Buffer.from(`fake data ${i}`),
  }));

  return createJob(
    images,
    "http://localhost:8080",
    "gemma-3-12b-it",
    "You are a captioner.",
    "Describe this image.",
    "",
    "",
    4
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createJob", () => {
  it("creates a job with correct metadata", async () => {
    const jobId = await createTestJob(2);
    const job = getJob(jobId);

    expect(job).toBeTruthy();
    expect(job!.id).toBe(jobId);
    expect(job!.serverUrl).toBe("http://localhost:8080");
    expect(job!.model).toBe("gemma-3-12b-it");
    expect(job!.images.size).toBe(2);
  });

  it("sets all images to 'queued' status", async () => {
    const jobId = await createTestJob(3);
    const job = getJob(jobId);

    for (const entry of job!.images.values()) {
      expect(entry.status).toBe("queued");
    }
  });

  it("stores image data as buffers", async () => {
    const jobId = await createTestJob(1);
    const job = getJob(jobId);
    const entry = Array.from(job!.images.values())[0];

    expect(entry.data.toString()).toBe("fake data 0");
    expect(entry.originalData.toString()).toBe("fake data 0");
  });

  it("creates an abort controller", async () => {
    const jobId = await createTestJob(1);
    const job = getJob(jobId);

    expect(job!.abortSignal).toBeTruthy();
    expect(job!.abortSignal.signal.aborted).toBe(false);
  });
});

describe("getJob / deleteJob", () => {
  it("getJob returns undefined for unknown job", () => {
    expect(getJob("nonexistent")).toBeUndefined();
  });

  it("deleteJob removes the job", async () => {
    const jobId = await createTestJob(1);
    expect(getJob(jobId)).toBeTruthy();

    deleteJob(jobId);
    expect(getJob(jobId)).toBeUndefined();
  });
});

describe("updateImageStatus", () => {
  it("updates status to 'processing'", async () => {
    const jobId = await createTestJob(1);
    updateImageStatus(jobId, "image-0.jpg", "processing");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.status).toBe("processing");
  });

  it("updates status to 'completed' with caption", async () => {
    const jobId = await createTestJob(1);
    updateImageStatus(jobId, "image-0.jpg", "completed", "A beautiful sunset");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.status).toBe("completed");
    expect(entry!.caption).toBe("A beautiful sunset");
  });

  it("updates status to 'failed' with error", async () => {
    const jobId = await createTestJob(1);
    updateImageStatus(jobId, "image-0.jpg", "failed", undefined, "API timeout");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.status).toBe("failed");
    expect(entry!.error).toBe("API timeout");
  });

  it("sets processingStartedAt on 'processing' status", async () => {
    const jobId = await createTestJob(1);
    updateImageStatus(jobId, "image-0.jpg", "processing");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.processingStartedAt).toBeTruthy();
  });

  it("sets processingDurationMs on 'completed' status", async () => {
    const jobId = await createTestJob(1);
    updateImageStatus(jobId, "image-0.jpg", "processing");

    // Small delay to ensure duration > 0
    Bun.sleepSync(10);

    updateImageStatus(jobId, "image-0.jpg", "completed", "caption");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.processingDurationMs).toBeGreaterThan(0);
  });

  it("is a no-op for unknown job", () => {
    // Should not throw
    updateImageStatus("nonexistent", "image.jpg", "processing");
  });

  it("is a no-op for unknown image", async () => {
    const jobId = await createTestJob(1);
    // Should not throw
    updateImageStatus(jobId, "nonexistent.jpg", "processing");
  });
});

describe("updateImagePartial", () => {
  it("updates partial caption", async () => {
    const jobId = await createTestJob(1);
    updateImagePartial(jobId, "image-0.jpg", "partial caption", undefined);

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.partialCaption).toBe("partial caption");
  });

  it("updates partial reasoning", async () => {
    const jobId = await createTestJob(1);
    updateImagePartial(jobId, "image-0.jpg", undefined, "thinking...");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.partialReasoning).toBe("thinking...");
  });

  it("updates both partial caption and reasoning", async () => {
    const jobId = await createTestJob(1);
    updateImagePartial(jobId, "image-0.jpg", "caption so far", "reasoning so far");

    const job = getJob(jobId);
    const entry = job!.images.get("image-0.jpg");
    expect(entry!.partialCaption).toBe("caption so far");
    expect(entry!.partialReasoning).toBe("reasoning so far");
  });
});

describe("isJobDone", () => {
  it("returns false when all images are queued", async () => {
    const jobId = await createTestJob(2);
    expect(isJobDone(jobId)).toBe(false);
  });

  it("returns false when some images are processing", async () => {
    const jobId = await createTestJob(2);
    updateImageStatus(jobId, "image-0.jpg", "processing");
    expect(isJobDone(jobId)).toBe(false);
  });

  it("returns true when all images are completed", async () => {
    const jobId = await createTestJob(2);
    updateImageStatus(jobId, "image-0.jpg", "completed", "caption 0");
    updateImageStatus(jobId, "image-1.jpg", "completed", "caption 1");
    expect(isJobDone(jobId)).toBe(true);
  });

  it("returns true when all images are failed", async () => {
    const jobId = await createTestJob(2);
    updateImageStatus(jobId, "image-0.jpg", "failed", undefined, "error");
    updateImageStatus(jobId, "image-1.jpg", "failed", undefined, "error");
    expect(isJobDone(jobId)).toBe(true);
  });

  it("returns true for mix of completed and failed", async () => {
    const jobId = await createTestJob(2);
    updateImageStatus(jobId, "image-0.jpg", "completed", "caption");
    updateImageStatus(jobId, "image-1.jpg", "failed", undefined, "error");
    expect(isJobDone(jobId)).toBe(true);
  });

  it("returns true for unknown job", () => {
    expect(isJobDone("nonexistent")).toBe(true);
  });
});

describe("abortJob", () => {
  it("marks all queued images as failed", async () => {
    const jobId = await createTestJob(3);
    updateImageStatus(jobId, "image-0.jpg", "processing");

    const result = abortJob(jobId);
    expect(result).toBe(true);

    // Job is deleted, so we can't check entries. But we know queued ones were marked failed.
    expect(getJob(jobId)).toBeUndefined();
  });

  it("signals the abort controller", async () => {
    const jobId = await createTestJob(1);
    const job = getJob(jobId);
    abortJob(jobId);
    expect(job!.abortSignal.signal.aborted).toBe(true);
  });

  it("removes the job from memory", async () => {
    const jobId = await createTestJob(1);
    abortJob(jobId);
    expect(getJob(jobId)).toBeUndefined();
  });

  it("returns false for unknown job", () => {
    expect(abortJob("nonexistent")).toBe(false);
  });
});

describe("getProgress", () => {
  it("returns correct counts for all queued", async () => {
    const jobId = await createTestJob(3);
    const progress = getProgress(jobId);

    expect(progress.total).toBe(3);
    expect(progress.queued).toBe(3);
    expect(progress.processing).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.failed).toBe(0);
  });

  it("returns correct counts for mixed states", async () => {
    const jobId = await createTestJob(5);
    updateImageStatus(jobId, "image-0.jpg", "completed", "caption");
    updateImageStatus(jobId, "image-1.jpg", "completed", "caption");
    updateImageStatus(jobId, "image-2.jpg", "processing");
    updateImageStatus(jobId, "image-3.jpg", "failed", undefined, "error");
    // image-4.jpg stays queued

    const progress = getProgress(jobId);
    expect(progress.total).toBe(5);
    expect(progress.completed).toBe(2);
    expect(progress.processing).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.queued).toBe(1);
  });

  it("returns empty counts for unknown job", () => {
    const progress = getProgress("nonexistent");
    expect(progress.total).toBe(0);
    expect(progress.queued).toBe(0);
    expect(progress.processing).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.failed).toBe(0);
  });

  it("calculates avgTimeMs when images have durations", async () => {
    const jobId = await createTestJob(2);
    updateImageStatus(jobId, "image-0.jpg", "processing");
    updateImageStatus(jobId, "image-1.jpg", "processing");

    Bun.sleepSync(10);

    updateImageStatus(jobId, "image-0.jpg", "completed", "caption");
    updateImageStatus(jobId, "image-1.jpg", "completed", "caption");

    const progress = getProgress(jobId);
    expect(progress.avgTimeMs).toBeGreaterThan(0);
  });

  it("calculates estimatedRemainingMs", async () => {
    const jobId = await createTestJob(4);
    updateImageStatus(jobId, "image-0.jpg", "processing");
    updateImageStatus(jobId, "image-1.jpg", "processing");

    Bun.sleepSync(10);

    updateImageStatus(jobId, "image-0.jpg", "completed", "caption");
    updateImageStatus(jobId, "image-1.jpg", "completed", "caption");

    const progress = getProgress(jobId);
    expect(progress.estimatedRemainingMs).toBeGreaterThan(0);
    // 2 remaining * avgTimeMs
    expect(progress.estimatedRemainingMs).toBeCloseTo(progress.avgTimeMs! * 2, -1);
  });
});

describe("buildStatusMap", () => {
  it("builds a map keyed by original filename", async () => {
    const jobId = await createTestJob(2);
    updateImageStatus(jobId, "image-0.jpg", "completed", "caption 0");
    updateImageStatus(jobId, "image-1.jpg", "processing");

    const job = getJob(jobId);
    const statusMap = buildStatusMap(job!);

    expect(statusMap["image-0.jpg"].status).toBe("completed");
    expect(statusMap["image-0.jpg"].caption).toBe("caption 0");
    expect(statusMap["image-1.jpg"].status).toBe("processing");
  });

  it("includes partial content", async () => {
    const jobId = await createTestJob(1);
    updateImageStatus(jobId, "image-0.jpg", "processing");
    updateImagePartial(jobId, "image-0.jpg", "partial", "reasoning");

    const job = getJob(jobId);
    const statusMap = buildStatusMap(job!);

    expect(statusMap["image-0.jpg"].partialCaption).toBe("partial");
    expect(statusMap["image-0.jpg"].partialReasoning).toBe("reasoning");
  });
});
