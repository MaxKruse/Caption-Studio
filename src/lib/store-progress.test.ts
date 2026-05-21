import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helper: reload store module to get fresh state
// ---------------------------------------------------------------------------

async function getStore() {
  vi.resetModules();
  return import("./store");
}

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
