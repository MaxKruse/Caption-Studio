import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// detect-store — detection job store
// ---------------------------------------------------------------------------

describe("detect-store", () => {
  let store: typeof import("./detect-store");

  beforeEach(async () => {
    vi.resetModules();
    store = await import("./detect-store");
  });

  describe("createDetectionJob", () => {
    it("creates a job with all images queued", () => {
      const jobId = store.createDetectionJob(
        ["a.png", "b.jpg", "c.webp"],
        "http://localhost:8080",
        "gpt-4o"
      );

      const job = store.getDetectionJob(jobId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.images.size).toBe(3);
      expect(job?.serverUrl).toBe("http://localhost:8080");
      expect(job?.model).toBe("gpt-4o");

      for (const entry of job!.images.values()) {
        expect(entry.status).toBe("queued");
      }
    });

    it("generates unique job IDs", () => {
      const id1 = store.createDetectionJob(["a.png"], "http://x", "m");
      const id2 = store.createDetectionJob(["b.png"], "http://x", "m");

      expect(id1).not.toBe(id2);
    });

    it("job ID starts with det_ prefix", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      expect(jobId.startsWith("det_")).toBe(true);
    });

    it("stores image names in entries", () => {
      const jobId = store.createDetectionJob(
        ["photo1.png", "photo2.jpg"],
        "http://x",
        "m"
      );

      const job = store.getDetectionJob(jobId);
      const entries = Array.from(job!.images.values());

      expect(entries[0].name).toBe("photo1.png");
      expect(entries[1].name).toBe("photo2.jpg");
    });
  });

  describe("getDetectionJob", () => {
    it("returns undefined for nonexistent job", () => {
      expect(store.getDetectionJob("nonexistent")).toBeUndefined();
    });

    it("returns job after creation", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      expect(store.getDetectionJob(jobId)).toBeDefined();
    });
  });

  describe("deleteDetectionJob", () => {
    it("removes job from store", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      expect(store.getDetectionJob(jobId)).toBeDefined();
      store.deleteDetectionJob(jobId);
      expect(store.getDetectionJob(jobId)).toBeUndefined();
    });

    it("does nothing for nonexistent job", () => {
      // Should not throw
      store.deleteDetectionJob("nonexistent");
    });
  });

  describe("updateDetectionImage", () => {
    it("updates status to processing", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "processing");

      const entry = store.getDetectionJob(jobId)!.images.get("a.png");
      expect(entry?.status).toBe("processing");
    });

    it("updates status to completed with boxes", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      const faceBoxes = [{ bbox_2d: [100, 200, 300, 400] as [number, number, number, number], label: "face" }];
      const bodyBoxes = [{ bbox_2d: [50, 100, 950, 900] as [number, number, number, number], label: "body" }];

      store.updateDetectionImage(jobId, "a.png", "completed", faceBoxes, bodyBoxes);

      const entry = store.getDetectionJob(jobId)!.images.get("a.png");
      expect(entry?.status).toBe("completed");
      expect(entry?.faceBoxes).toEqual(faceBoxes);
      expect(entry?.bodyBoxes).toEqual(bodyBoxes);
    });

    it("updates status to failed with error", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "failed", [], [], "API error");

      const entry = store.getDetectionJob(jobId)!.images.get("a.png");
      expect(entry?.status).toBe("failed");
      expect(entry?.error).toBe("API error");
    });

    it("does nothing for nonexistent job", () => {
      // Should not throw
      store.updateDetectionImage("nonexistent", "a.png", "processing");
    });

    it("does nothing for nonexistent image in job", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      // Should not throw
      store.updateDetectionImage(jobId, "nonexistent.png", "processing");
    });

    it("preserves other images when updating one", () => {
      const jobId = store.createDetectionJob(["a.png", "b.jpg"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "processing");

      const job = store.getDetectionJob(jobId)!;
      expect(job.images.get("a.png")?.status).toBe("processing");
      expect(job.images.get("b.jpg")?.status).toBe("queued");
    });
  });

  describe("isDetectionDone", () => {
    it("returns false when images are queued", () => {
      const jobId = store.createDetectionJob(["a.png", "b.jpg"], "http://x", "m");

      expect(store.isDetectionDone(jobId)).toBe(false);
    });

    it("returns false when images are processing", () => {
      const jobId = store.createDetectionJob(["a.png", "b.jpg"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "processing");

      expect(store.isDetectionDone(jobId)).toBe(false);
    });

    it("returns true when all completed", () => {
      const jobId = store.createDetectionJob(["a.png", "b.jpg"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "completed", [], []);
      store.updateDetectionImage(jobId, "b.jpg", "completed", [], []);

      expect(store.isDetectionDone(jobId)).toBe(true);
    });

    it("returns false when images are failed (needs retry)", () => {
      const jobId = store.createDetectionJob(["a.png", "b.jpg"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "completed", [], []);
      store.updateDetectionImage(jobId, "b.jpg", "failed", [], [], "err");

      // Failed images (retryCount=0) need retry — not done yet
      expect(store.isDetectionDone(jobId)).toBe(false);
    });

    it("returns true with mixed completed and skipped", () => {
      const jobId = store.createDetectionJob(["a.png", "b.jpg"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "completed", [], []);
      const entry = store.getDetectionJob(jobId)!.images.get("b.jpg");
      entry!.status = "skipped";
      entry!.retryCount = 1;
      entry!.error = "Detection failed permanently";

      expect(store.isDetectionDone(jobId)).toBe(true);
    });

    it("returns true for nonexistent job", () => {
      expect(store.isDetectionDone("nonexistent")).toBe(true);
    });
  });

  describe("getDetectionProgress", () => {
    it("returns zeros for nonexistent job", () => {
      const progress = store.getDetectionProgress("nonexistent");

      expect(progress).toEqual({
        total: 0,
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      });
    });

    it("returns correct initial counts", () => {
      const jobId = store.createDetectionJob(
        ["a.png", "b.jpg", "c.webp"],
        "http://x",
        "m"
      );

      const progress = store.getDetectionProgress(jobId);

      expect(progress.total).toBe(3);
      expect(progress.queued).toBe(3);
      expect(progress.processing).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(0);
    });

    it("returns updated counts after changes", () => {
      const jobId = store.createDetectionJob(
        ["a.png", "b.jpg", "c.webp"],
        "http://x",
        "m"
      );

      store.updateDetectionImage(jobId, "a.png", "processing");
      store.updateDetectionImage(jobId, "b.jpg", "completed", [], []);
      store.updateDetectionImage(jobId, "c.webp", "failed", [], [], "err");

      const progress = store.getDetectionProgress(jobId);

      expect(progress.total).toBe(3);
      expect(progress.queued).toBe(0);
      expect(progress.processing).toBe(1);
      expect(progress.completed).toBe(1);
      expect(progress.failed).toBe(1);
    });
  });

  describe("buildDetectionStatusMap", () => {
    it("returns status for all images", () => {
      const jobId = store.createDetectionJob(
        ["a.png", "b.jpg"],
        "http://x",
        "m"
      );

      const job = store.getDetectionJob(jobId)!;
      const statuses = store.buildDetectionStatusMap(job);

      expect(Object.keys(statuses)).toHaveLength(2);
      expect(statuses["a.png"].status).toBe("queued");
      expect(statuses["b.jpg"].status).toBe("queued");
    });

    it("includes faceBoxes and bodyBoxes for completed images", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      const faceBoxes = [{ bbox_2d: [100, 200, 300, 400] as [number, number, number, number], label: "face" }];
      const bodyBoxes = [{ bbox_2d: [50, 100, 950, 900] as [number, number, number, number], label: "body" }];

      store.updateDetectionImage(jobId, "a.png", "completed", faceBoxes, bodyBoxes);

      const job = store.getDetectionJob(jobId)!;
      const statuses = store.buildDetectionStatusMap(job);

      expect(statuses["a.png"].faceBoxes).toEqual(faceBoxes);
      expect(statuses["a.png"].bodyBoxes).toEqual(bodyBoxes);
    });

    it("includes error for failed images", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "failed", [], [], "API timeout");

      const job = store.getDetectionJob(jobId)!;
      const statuses = store.buildDetectionStatusMap(job);

      expect(statuses["a.png"].error).toBe("API timeout");
    });

    it("includes retryCount in status map", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");

      store.updateDetectionImage(jobId, "a.png", "failed", [], [], "retrying");
      const entry = store.getDetectionJob(jobId)!.images.get("a.png");
      entry!.retryCount = 1;

      const job = store.getDetectionJob(jobId)!;
      const statuses = store.buildDetectionStatusMap(job);

      expect(statuses["a.png"].retryCount).toBe(1);
    });
  });

  describe("retry queue", () => {
    it("adds and retrieves files from retry queue", () => {
      const mockFile = { name: "test.png" } as File;
      const jobId = store.createDetectionJob(["test.png"], "http://x", "m");

      store.addToRetryQueue(jobId, mockFile);
      const queue = store.getRetryQueue(jobId);

      expect(queue).toBeDefined();
      expect(queue!.has("test.png")).toBe(true);
      store.deleteDetectionJob(jobId);
    });

    it("returns undefined for nonexistent retry queue", () => {
      expect(store.getRetryQueue("nonexistent")).toBeUndefined();
    });

    it("cleanupJob removes job and retry queue", () => {
      const mockFile = { name: "test.png" } as File;
      const jobId = store.createDetectionJob(["test.png"], "http://x", "m");
      store.addToRetryQueue(jobId, mockFile);

      store.cleanupJob(jobId);

      expect(store.getDetectionJob(jobId)).toBeUndefined();
      expect(store.getRetryQueue(jobId)).toBeUndefined();
    });
  });

  describe("retry tracking", () => {
    it("new entries start with retryCount 0", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");
      const entry = store.getDetectionJob(jobId)!.images.get("a.png");
      expect(entry!.retryCount).toBe(0);
    });

    it("isDetectionDone returns false for failed with retryCount 0", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");
      store.updateDetectionImage(jobId, "a.png", "failed", [], [], "err");
      expect(store.isDetectionDone(jobId)).toBe(false);
    });

    it("isDetectionDone returns true for skipped with retryCount 1", () => {
      const jobId = store.createDetectionJob(["a.png"], "http://x", "m");
      const entry = store.getDetectionJob(jobId)!.images.get("a.png");
      entry!.status = "skipped";
      entry!.retryCount = 1;
      expect(store.isDetectionDone(jobId)).toBe(true);
    });
  });
});
