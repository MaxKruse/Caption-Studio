/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// GET /api/detect — SSE progress stream
// ---------------------------------------------------------------------------

describe("GET /api/detect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when jobId is missing", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/detect");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing jobId");
  });

  it("returns 404 when job not found", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/detect?jobId=nonexistent");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Job not found");
  });

  it("returns SSE stream with correct headers", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["test.png"],
      "http://localhost:8080",
      "gpt-4o"
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/detect?jobId=${jobId}`);
    const res = await GET(req as any);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    store.deleteDetectionJob(jobId);
  });

  it("streams initial progress data", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png", "b.jpg"],
      "http://localhost:8080",
      "gpt-4o"
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/detect?jobId=${jobId}`);
    const res = await GET(req as any);

    // Read the first chunk of the SSE stream
    const reader = res.body?.getReader();
    const { value, done } = await reader!.read();
    const text = new TextDecoder().decode(value);

    expect(done).toBe(false);
    expect(text).toContain("data:");
    expect(text).toContain("total");

    reader?.cancel();
    store.deleteDetectionJob(jobId);
  });

  it("streams initial progress with correct counts", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png", "b.jpg", "c.webp"],
      "http://localhost:8080",
      "gpt-4o"
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/detect?jobId=${jobId}`);
    const res = await GET(req as any);

    const reader = res.body?.getReader();
    const { value } = await reader!.read();
    const text = new TextDecoder().decode(value);

    const parsed = JSON.parse(text.replace("data: ", "").trim());
    expect(parsed.total).toBe(3);
    expect(parsed.queued).toBe(3);
    expect(parsed.processing).toBe(0);
    expect(parsed.completed).toBe(0);
    expect(parsed.failed).toBe(0);

    reader?.cancel();
    store.deleteDetectionJob(jobId);
  });

  it("reflects updated progress after status changes", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png", "b.jpg"],
      "http://localhost:8080",
      "gpt-4o"
    );

    // Simulate processing progress
    store.updateDetectionImage(jobId, "a.png", "processing");

    const progress = store.getDetectionProgress(jobId);
    expect(progress.queued).toBe(1);
    expect(progress.processing).toBe(1);

    store.updateDetectionImage(jobId, "a.png", "completed", [], []);

    const progress2 = store.getDetectionProgress(jobId);
    expect(progress2.completed).toBe(1);
    expect(progress2.queued).toBe(1);

    store.deleteDetectionJob(jobId);
  });

  it("isDetectionDone returns false when images are queued", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png", "b.jpg"],
      "http://localhost:8080",
      "gpt-4o"
    );

    expect(store.isDetectionDone(jobId)).toBe(false);

    store.deleteDetectionJob(jobId);
  });

  it("isDetectionDone returns true when all completed", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png", "b.jpg"],
      "http://localhost:8080",
      "gpt-4o"
    );

    store.updateDetectionImage(jobId, "a.png", "completed", [], []);
    store.updateDetectionImage(jobId, "b.jpg", "completed", [], []);

    expect(store.isDetectionDone(jobId)).toBe(true);

    store.deleteDetectionJob(jobId);
  });

  it("isDetectionDone returns true with mixed completed and failed", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png", "b.jpg"],
      "http://localhost:8080",
      "gpt-4o"
    );

    store.updateDetectionImage(jobId, "a.png", "completed", [], []);
    store.updateDetectionImage(jobId, "b.jpg", "failed", [], [], "API error");

    expect(store.isDetectionDone(jobId)).toBe(true);

    store.deleteDetectionJob(jobId);
  });

  it("isDetectionDone returns true for nonexistent job", async () => {
    const store = await import("@/lib/detect-store");

    expect(store.isDetectionDone("nonexistent")).toBe(true);
  });

  it("getDetectionProgress returns zeros for nonexistent job", async () => {
    const store = await import("@/lib/detect-store");

    const progress = store.getDetectionProgress("nonexistent");

    expect(progress.total).toBe(0);
    expect(progress.queued).toBe(0);
    expect(progress.processing).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.failed).toBe(0);
  });

  it("buildDetectionStatusMap includes faceBoxes and bodyBoxes", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png"],
      "http://localhost:8080",
      "gpt-4o"
    );

    const faceBoxes = [{ bbox_2d: [100, 200, 400, 500] as [number, number, number, number], label: "face" }];
    const bodyBoxes = [{ bbox_2d: [50, 100, 950, 900] as [number, number, number, number], label: "body" }];

    store.updateDetectionImage(jobId, "a.png", "completed", faceBoxes, bodyBoxes);

    const job = store.getDetectionJob(jobId)!;
    const statuses = store.buildDetectionStatusMap(job);

    expect(statuses["a.png"].status).toBe("completed");
    expect(statuses["a.png"].faceBoxes).toEqual(faceBoxes);
    expect(statuses["a.png"].bodyBoxes).toEqual(bodyBoxes);

    store.deleteDetectionJob(jobId);
  });

  it("buildDetectionStatusMap includes error for failed images", async () => {
    const store = await import("@/lib/detect-store");
    const jobId = store.createDetectionJob(
      ["a.png"],
      "http://localhost:8080",
      "gpt-4o"
    );

    store.updateDetectionImage(jobId, "a.png", "failed", [], [], "API timeout");

    const job = store.getDetectionJob(jobId)!;
    const statuses = store.buildDetectionStatusMap(job);

    expect(statuses["a.png"].status).toBe("failed");
    expect(statuses["a.png"].error).toBe("API timeout");

    store.deleteDetectionJob(jobId);
  });
});
