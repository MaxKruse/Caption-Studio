import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helper: reload store module to get fresh state
// ---------------------------------------------------------------------------

async function getStore() {
  vi.resetModules();
  return import("./store");
}

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

describe("createJob", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates a job with a single image", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "system prompt",
      "",
      "describe this",
      "",
      false,
      4
    );

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
    expect(jobId.length).toBeGreaterThan(0);

    const job = store.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(jobId);
    expect(job?.images.size).toBe(1);
    expect(job?.serverUrl).toBe("http://localhost:8080");
    expect(job?.model).toBe("llama3");

    store.deleteJob(jobId);
  });

  it("creates a job with multiple images", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "img1.png", data: Buffer.from("a") },
        { name: "img2.jpg", data: Buffer.from("b") },
        { name: "img3.webp", data: Buffer.from("c") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "Batch01",
      true,
      2
    );

    const job = store.getJob(jobId);
    expect(job?.images.size).toBe(3);
    expect(job?.captionName).toBe("Batch01");
    expect(job?.includeNameInPrompt).toBe(true);
    expect(job?.parallelRequests).toBe(2);

    // All images start as queued
    for (const entry of job!.images.values()) {
      expect(entry.status).toBe("queued");
    }

    store.deleteJob(jobId);
  });

  it("stores all job configuration fields correctly", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://example.com/api",
      "gpt-4o",
      "You are helpful",
      "Prefix text",
      "User prompt text",
      "MyBatch",
      true,
      8
    );

    const job = store.getJob(jobId);
    expect(job?.serverUrl).toBe("http://example.com/api");
    expect(job?.model).toBe("gpt-4o");
    expect(job?.systemPrompt).toBe("You are helpful");
    expect(job?.promptPrefix).toBe("Prefix text");
    expect(job?.userPrompt).toBe("User prompt text");
    expect(job?.captionName).toBe("MyBatch");
    expect(job?.includeNameInPrompt).toBe(true);
    expect(job?.parallelRequests).toBe(8);
    expect(job?.createdAt).toBeGreaterThan(0);

    store.deleteJob(jobId);
  });

  it("generates unique job IDs each time", async () => {
    const store = await getStore();

    const id1 = store.createJob(
      [{ name: "a.png", data: Buffer.from("a") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );
    const id2 = store.createJob(
      [{ name: "b.png", data: Buffer.from("b") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    expect(id1).not.toBe(id2);
    store.deleteJob(id1);
    store.deleteJob(id2);
  });

  it("sets createdAt timestamp", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    const job = store.getJob(jobId);
    expect(job?.createdAt).toBeGreaterThan(Date.now() - 1000);
    expect(job?.createdAt).toBeLessThanOrEqual(Date.now());

    store.deleteJob(jobId);
  });
});

// ---------------------------------------------------------------------------
// getJob
// ---------------------------------------------------------------------------

describe("getJob", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the job for a valid ID", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    const job = store.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(jobId);

    store.deleteJob(jobId);
  });

  it("returns undefined for non-existent job ID", async () => {
    const store = await getStore();

    const job = store.getJob("nonexistent");
    expect(job).toBeUndefined();
  });

  it("returns undefined for empty string ID", async () => {
    const store = await getStore();

    const job = store.getJob("");
    expect(job).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteJob
// ---------------------------------------------------------------------------

describe("deleteJob", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("removes a job from the store", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    expect(store.getJob(jobId)).toBeDefined();
    store.deleteJob(jobId);
    expect(store.getJob(jobId)).toBeUndefined();
  });

  it("does nothing when deleting a non-existent job", async () => {
    const store = await getStore();

    // Should not throw
    expect(() => store.deleteJob("nonexistent")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// updateImageStatus
// ---------------------------------------------------------------------------

describe("updateImageStatus", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("updates status to processing", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "test.png", "processing");
    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.status).toBe("processing");

    store.deleteJob(jobId);
  });

  it("updates status to completed with caption", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat sitting on a table"
    );

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.status).toBe("completed");
    expect(entry?.caption).toBe("a cat sitting on a table");

    store.deleteJob(jobId);
  });

  it("updates status to failed with error message", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "failed",
      undefined,
      "API timeout"
    );

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.status).toBe("failed");
    expect(entry?.error).toBe("API timeout");

    store.deleteJob(jobId);
  });

  it("stores the prompt used for each image", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "system prompt",
      "",
      "describe this",
      "",
      false,
      4
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat sitting",
      undefined,
      "describe this image"
    );

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.prompt).toBe("describe this image");

    store.deleteJob(jobId);
  });

  it("does not overwrite prompt when not provided", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "img.jpg", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "model",
      "",
      "",
      "user prompt text",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "img.jpg", "processing");
    store.updateImageStatus(
      jobId,
      "img.jpg",
      "completed",
      "caption",
      undefined,
      "stored prompt"
    );

    // Update status again without prompt
    store.updateImageStatus(jobId, "img.jpg", "completed", "new caption");

    const entry = store.getJob(jobId)!.images.get("img.jpg");
    expect(entry?.prompt).toBe("stored prompt");

    store.deleteJob(jobId);
  });

  it("does not update non-existent job silently", async () => {
    const store = await getStore();

    // Should not throw
    store.updateImageStatus("nonexistent", "test.png", "processing");
    expect(store.getJob("nonexistent")).toBeUndefined();
  });

  it("does not update non-existent image silently", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    // Should not throw
    store.updateImageStatus(jobId, "nonexistent.png", "processing");

    store.deleteJob(jobId);
  });

  it("stores reasoningContent when provided", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat sitting on a table",
      undefined,
      "describe this image",
      "The image shows a feline animal..."
    );

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.reasoningContent).toBe("The image shows a feline animal...");

    store.deleteJob(jobId);
  });

  it("does not overwrite reasoningContent when not provided", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "img.jpg", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(
      jobId,
      "img.jpg",
      "completed",
      "caption",
      undefined,
      "prompt text",
      "reasoning text"
    );

    // Update again without reasoningContent
    store.updateImageStatus(jobId, "img.jpg", "completed", "new caption");

    const entry = store.getJob(jobId)!.images.get("img.jpg");
    expect(entry?.reasoningContent).toBe("reasoning text");

    store.deleteJob(jobId);
  });

  it("updates only the specified image in a multi-image job", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "b.png", "completed", "caption b");

    const job = store.getJob(jobId)!;
    expect(job.images.get("a.png")?.status).toBe("queued");
    expect(job.images.get("b.png")?.status).toBe("completed");
    expect(job.images.get("b.png")?.caption).toBe("caption b");
    expect(job.images.get("c.png")?.status).toBe("queued");

    store.deleteJob(jobId);
  });
});

// ---------------------------------------------------------------------------
// isJobDone
// ---------------------------------------------------------------------------

describe("isJobDone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true for non-existent job", async () => {
    const store = await getStore();
    expect(store.isJobDone("nonexistent")).toBe(true);
  });

  it("returns false when all images are queued", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    expect(store.isJobDone(jobId)).toBe(false);

    store.deleteJob(jobId);
  });

  it("returns false when some images are processing", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "done");
    expect(store.isJobDone(jobId)).toBe(false);

    store.deleteJob(jobId);
  });

  it("returns true when all images are completed", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "done");
    store.updateImageStatus(jobId, "b.png", "completed", "done");

    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("returns true when all images are failed", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "a.png", "failed", undefined, "err");
    store.updateImageStatus(jobId, "b.png", "failed", undefined, "err");

    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("returns true with mixed completed and failed images", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "ok");
    store.updateImageStatus(jobId, "b.png", "failed", undefined, "err");
    store.updateImageStatus(jobId, "c.png", "completed", "ok");

    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("returns false when at least one image is still queued", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "ok");
    store.updateImageStatus(jobId, "b.png", "failed", undefined, "err");
    // c.png is still queued

    expect(store.isJobDone(jobId)).toBe(false);

    store.deleteJob(jobId);
  });
});

// ---------------------------------------------------------------------------
// getProgress
// ---------------------------------------------------------------------------

describe("getProgress", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns zeros for non-existent job", async () => {
    const store = await getStore();

    const progress = store.getProgress("nonexistent");
    expect(progress).toEqual({
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    });
  });

  it("counts all images as queued initially", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    const progress = store.getProgress(jobId);
    expect(progress).toEqual({
      total: 3,
      queued: 3,
      processing: 0,
      completed: 0,
      failed: 0,
    });

    store.deleteJob(jobId);
  });

  it("counts mixed statuses correctly", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
        { name: "d.png", data: Buffer.from("d") },
        { name: "e.png", data: Buffer.from("e") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    // 2 completed, 1 processing, 1 failed, 1 queued
    store.updateImageStatus(jobId, "a.png", "completed", "ok");
    store.updateImageStatus(jobId, "b.png", "completed", "ok");
    store.updateImageStatus(jobId, "c.png", "processing");
    store.updateImageStatus(jobId, "d.png", "failed", undefined, "err");
    // e.png stays queued

    const progress = store.getProgress(jobId);
    expect(progress).toEqual({
      total: 5,
      queued: 1,
      processing: 1,
      completed: 2,
      failed: 1,
    });

    store.deleteJob(jobId);
  });

  it("counts all completed correctly", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "", "prompt", "", false, 1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "ok");
    store.updateImageStatus(jobId, "b.png", "completed", "ok");

    const progress = store.getProgress(jobId);
    expect(progress).toEqual({
      total: 2,
      queued: 0,
      processing: 0,
      completed: 2,
      failed: 0,
    });

    store.deleteJob(jobId);
  });
});
