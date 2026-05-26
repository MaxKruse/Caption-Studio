/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// GET /api/caption — SSE progress stream
// ---------------------------------------------------------------------------

describe("GET /api/caption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when jobId is missing", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/caption");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing jobId");
  });

  it("returns 404 when job not found", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/caption?jobId=nonexistent");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Job not found");
  });

  it("returns SSE stream with correct headers", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/caption?jobId=${jobId}`);
    const res = await GET(req as any);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    store.deleteJob(jobId);
  });

  it("streams initial progress data", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/caption?jobId=${jobId}`);
    const res = await GET(req as any);

    // Read the first chunk of the SSE stream
    const reader = res.body?.getReader();
    const { value, done } = await reader!.read();
    const text = new TextDecoder().decode(value);

    expect(done).toBe(false);
    expect(text).toContain("data:");
    expect(text).toContain("total");

    reader?.cancel();
    store.deleteJob(jobId);
  });

  it("streams initial progress with correct structure", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/caption?jobId=${jobId}`);
    const res = await GET(req as any);

    const reader = res.body?.getReader();
    const { value } = await reader!.read();
    const text = new TextDecoder().decode(value);

    // Initial event sends progress only (no statuses)
    const parsed = JSON.parse(text.replace("data: ", "").trim());
    expect(parsed.total).toBe(1);
    expect(parsed.queued).toBe(1);

    reader?.cancel();
    store.deleteJob(jobId);
  });

  it("isJobDone returns true when all images are completed", async () => {
    const store = await import("@/lib/store");

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    // Initially not done
    expect(store.isJobDone(jobId)).toBe(false);

    // After all completed
    store.updateImageStatus(jobId, "a.png", "completed", "cat");
    store.updateImageStatus(jobId, "b.jpg", "completed", "dog");
    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("isJobDone returns true with mixed completed and failed", async () => {
    const store = await import("@/lib/store");

    const jobId = await store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "cat");
    store.updateImageStatus(jobId, "b.jpg", "failed", undefined, "err");
    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("SSE interval includes statuses in payload structure", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const progress = store.getProgress(jobId);
    const statuses: Record<string, { status: string; caption?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
        };
      }
    }

    // Verify the SSE interval payload structure
    const ssePayload = { ...progress, statuses };
    expect(ssePayload.statuses["test.png"].status).toBe("completed");
    expect(ssePayload.statuses["test.png"].caption).toBe("a cat");
    expect(ssePayload.completed).toBe(1);

    store.deleteJob(jobId);
  });

  it("SSE statuses include prompt field", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "You are helpful",
      "describe this",
      "generic_single",
      "",
      "",
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat",
      undefined,
      "System: You are helpful\nUser: describe this"
    );

    // Simulate what the SSE interval builds
    const statuses: Record<string, { status: string; caption?: string; error?: string; prompt?: string; reasoningContent?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    expect(statuses["test.png"].prompt).toBe(
      "System: You are helpful\nUser: describe this"
    );

    store.deleteJob(jobId);
  });

  it("SSE statuses include reasoningContent field", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat",
      undefined,
      "describe this",
      "I think this is a cat because..."
    );

    // Simulate what the SSE interval builds
    const statuses: Record<string, { status: string; caption?: string; error?: string; prompt?: string; reasoningContent?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    expect(statuses["test.png"].reasoningContent).toBe(
      "I think this is a cat because..."
    );

    store.deleteJob(jobId);
  });

  it("SSE statuses omit reasoningContent when not set", async () => {
    const store = await import("@/lib/store");
    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "generic_single",
      "",
      "",
      1
    );

    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const statuses: Record<string, { status: string; caption?: string; error?: string; prompt?: string; reasoningContent?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    expect(statuses["test.png"].reasoningContent).toBeUndefined();

    store.deleteJob(jobId);
  });
});
