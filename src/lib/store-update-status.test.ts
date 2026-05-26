import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helper: reload store module to get fresh state
// ---------------------------------------------------------------------------

async function getStore() {
  vi.resetModules();
  return import("./store");
}

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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "describe this",
      "generic_single",
      "",
      "",
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
      "user prompt text",
      "generic_single",
      "",
      "",
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    // Should not throw
    store.updateImageStatus(jobId, "nonexistent.png", "processing");

    store.deleteJob(jobId);
  });

  it("stores reasoningContent when provided", async () => {
    const store = await getStore();

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
