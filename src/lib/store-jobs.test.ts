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

    const jobId = await store.createJob(
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

    const jobId = await store.createJob(
      [
        { name: "img1.png", data: Buffer.from("a") },
        { name: "img2.jpg", data: Buffer.from("b") },
        { name: "img3.webp", data: Buffer.from("c") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "Batch01",
      2
    );

    const job = store.getJob(jobId);
    expect(job?.images.size).toBe(3);
    expect(job?.subjectName).toBe("Batch01");
    expect(job?.parallelRequests).toBe(2);

    // All images start as queued
    for (const entry of job!.images.values()) {
      expect(entry.status).toBe("queued");
    }

    store.deleteJob(jobId);
  });

  it("stores all job configuration fields correctly", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://example.com/api",
      "gpt-4o",
      "You are helpful",
      "User prompt text",
      "generic_single",
      "",
      "MyBatch",
      8
    );

    const job = store.getJob(jobId);
    expect(job?.serverUrl).toBe("http://example.com/api");
    expect(job?.model).toBe("gpt-4o");
    expect(job?.systemPrompt).toBe("You are helpful");
    expect(job?.userPrompt).toBe("User prompt text");
    expect(job?.captionTypeId).toBe("generic_single");
    expect(job?.subjectName).toBe("MyBatch");
    expect(job?.parallelRequests).toBe(8);
    expect(job?.createdAt).toBeGreaterThan(0);

    store.deleteJob(jobId);
  });

  it("generates unique job IDs each time", async () => {
    const store = await getStore();

    const id1 = await store.createJob(
      [{ name: "a.png", data: Buffer.from("a") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );
    const id2 = await store.createJob(
      [{ name: "b.png", data: Buffer.from("b") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    expect(id1).not.toBe(id2);
    store.deleteJob(id1);
    store.deleteJob(id2);
  });

  it("sets createdAt timestamp", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
