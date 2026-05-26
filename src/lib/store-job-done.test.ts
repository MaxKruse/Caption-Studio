import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helper: reload store module to get fresh state
// ---------------------------------------------------------------------------

async function getStore() {
  vi.resetModules();
  return import("./store");
}

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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
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
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "ok");
    store.updateImageStatus(jobId, "b.png", "failed", undefined, "err");
    // c.png is still queued

    expect(store.isJobDone(jobId)).toBe(false);

    store.deleteJob(jobId);
  });
});
