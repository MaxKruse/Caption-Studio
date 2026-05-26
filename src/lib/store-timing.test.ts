import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helper: reload store module to get fresh state
// ---------------------------------------------------------------------------

async function getStore() {
  vi.resetModules();
  return import("./store");
}

// ---------------------------------------------------------------------------
// updateImageStatus - timing tracking
// ---------------------------------------------------------------------------

describe("updateImageStatus timing", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("records processingStartedAt when status changes to processing", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    const before = Date.now();
    store.updateImageStatus(jobId, "test.png", "processing");
    const after = Date.now();

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.processingStartedAt).toBeDefined();
    expect(entry!.processingStartedAt!).toBeGreaterThanOrEqual(before);
    expect(entry!.processingStartedAt!).toBeLessThanOrEqual(after);

    store.deleteJob(jobId);
  });

  it("does not overwrite processingStartedAt on repeated processing calls", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "test.png", "processing");
    const firstStart = store.getJob(jobId)!.images.get("test.png")!.processingStartedAt!;

    await new Promise((r) => setTimeout(r, 10));

    store.updateImageStatus(jobId, "test.png", "processing");
    const secondStart = store.getJob(jobId)!.images.get("test.png")!.processingStartedAt!;

    expect(firstStart).toBe(secondStart);

    store.deleteJob(jobId);
  });

  it("records processingDurationMs when status changes to completed", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "test.png", "processing");
    await new Promise((r) => setTimeout(r, 50));
    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.processingDurationMs).toBeDefined();
    expect(entry!.processingDurationMs!).toBeGreaterThanOrEqual(40);
    expect(entry!.processingDurationMs!).toBeLessThanOrEqual(200);

    store.deleteJob(jobId);
  });

  it("records processingDurationMs when status changes to failed", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "test.png", "processing");
    await new Promise((r) => setTimeout(r, 30));
    store.updateImageStatus(jobId, "test.png", "failed", undefined, "timeout");

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.processingDurationMs).toBeDefined();
    expect(entry!.processingDurationMs!).toBeGreaterThanOrEqual(20);
    expect(entry!.processingDurationMs!).toBeLessThanOrEqual(200);

    store.deleteJob(jobId);
  });

  it("does not record duration when completed without processing", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    // Skip processing, go straight to completed
    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry?.processingDurationMs).toBeUndefined();

    store.deleteJob(jobId);
  });

  it("preserves processingDurationMs across subsequent status updates", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "test.png", "processing");
    await new Promise((r) => setTimeout(r, 30));
    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const duration = store.getJob(jobId)!.images.get("test.png")!.processingDurationMs!;

    // Update again - duration should persist
    store.updateImageStatus(jobId, "test.png", "completed", "updated caption");

    const entry = store.getJob(jobId)!.images.get("test.png");
    expect(entry!.processingDurationMs).toBe(duration);

    store.deleteJob(jobId);
  });
});

// ---------------------------------------------------------------------------
// getProgress - timing estimates
// ---------------------------------------------------------------------------

describe("getProgress timing estimates", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not include timing fields when no images have finished", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    // All queued, none finished yet
    const progress = store.getProgress(jobId);
    expect(progress.avgTimeMs).toBeUndefined();
    expect(progress.estimatedRemainingMs).toBeUndefined();

    store.deleteJob(jobId);
  });

  it("calculates avgTimeMs after one image completes", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "a.png", "processing");
    await new Promise((r) => setTimeout(r, 50));
    store.updateImageStatus(jobId, "a.png", "completed", "ok");

    const progress = store.getProgress(jobId);
    expect(progress.avgTimeMs).toBeDefined();
    expect(progress.avgTimeMs!).toBeGreaterThanOrEqual(40);
    expect(progress.avgTimeMs!).toBeLessThanOrEqual(200);

    store.deleteJob(jobId);
  });

  it("calculates estimatedRemainingMs based on queued count", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "a.png", "processing");
    await new Promise((r) => setTimeout(r, 50));
    store.updateImageStatus(jobId, "a.png", "completed", "ok");

    const progress = store.getProgress(jobId);
    // 2 images left (b and c are queued), avg ~50ms
    expect(progress.estimatedRemainingMs).toBeDefined();
    expect(progress.estimatedRemainingMs!).toBeGreaterThanOrEqual(80);
    expect(progress.estimatedRemainingMs!).toBeLessThanOrEqual(400);

    store.deleteJob(jobId);
  });

  it("averages duration across multiple completed images", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
        { name: "c.png", data: Buffer.from("c") },
      ],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    // First image: ~30ms
    store.updateImageStatus(jobId, "a.png", "processing");
    await new Promise((r) => setTimeout(r, 30));
    store.updateImageStatus(jobId, "a.png", "completed", "ok");

    // Second image: ~70ms
    store.updateImageStatus(jobId, "b.png", "processing");
    await new Promise((r) => setTimeout(r, 70));
    store.updateImageStatus(jobId, "b.png", "completed", "ok");

    const progress = store.getProgress(jobId);
    // avg should be around (30 + 70) / 2 = 50ms
    expect(progress.avgTimeMs!).toBeGreaterThanOrEqual(40);
    expect(progress.avgTimeMs!).toBeLessThanOrEqual(120);

    store.deleteJob(jobId);
  });

  it("includes failed images in the average calculation", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "a.png", "processing");
    await new Promise((r) => setTimeout(r, 40));
    store.updateImageStatus(jobId, "a.png", "failed", undefined, "err");

    const progress = store.getProgress(jobId);
    expect(progress.avgTimeMs).toBeDefined();
    expect(progress.avgTimeMs!).toBeGreaterThanOrEqual(30);

    store.deleteJob(jobId);
  });

  it("estimates zero remaining when no queued images left", async () => {
    const store = await getStore();

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost", "model", "", "prompt", "generic_single", "", "", 1
    );

    store.updateImageStatus(jobId, "a.png", "processing");
    await new Promise((r) => setTimeout(r, 30));
    store.updateImageStatus(jobId, "a.png", "completed", "ok");
    store.updateImageStatus(jobId, "b.png", "processing");
    // b is processing, 0 queued

    const progress = store.getProgress(jobId);
    expect(progress.estimatedRemainingMs).toBe(0);

    store.deleteJob(jobId);
  });

  it("returns zeros without timing for non-existent job", async () => {
    const store = await getStore();

    const progress = store.getProgress("nonexistent");
    expect(progress.total).toBe(0);
    expect(progress.avgTimeMs).toBeUndefined();
    expect(progress.estimatedRemainingMs).toBeUndefined();
  });
});
