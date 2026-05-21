/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// GET /api/status — Job status polling
// ---------------------------------------------------------------------------

describe("GET /api/status", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 when jobId is missing", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/status");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing jobId");
  });

  it("returns 404 when job not found", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/status?jobId=nonexistent");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Job not found");
  });

  it("returns status for all images in a job", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
        { name: "c.webp", data: Buffer.from("c") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.statuses).toBeDefined();
    expect(Object.keys(data.statuses).length).toBe(3);

    store.deleteJob(jobId);
  });

  it("returns queued status for all images initially", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["a.png"].status).toBe("queued");
    expect(data.statuses["b.jpg"].status).toBe("queued");

    store.deleteJob(jobId);
  });

  it("returns updated statuses after changes", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
        { name: "c.webp", data: Buffer.from("c") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    // Simulate processing: one completed, one failed, one still processing
    store.updateImageStatus(jobId, "a.png", "completed", "a cat", undefined, "prompt a");
    store.updateImageStatus(jobId, "b.jpg", "processing");
    store.updateImageStatus(jobId, "c.webp", "failed", undefined, "API error");

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["a.png"].status).toBe("completed");
    expect(data.statuses["a.png"].caption).toBe("a cat");
    expect(data.statuses["a.png"].prompt).toBe("prompt a");

    expect(data.statuses["b.jpg"].status).toBe("processing");

    expect(data.statuses["c.webp"].status).toBe("failed");
    expect(data.statuses["c.webp"].error).toBe("API error");

    store.deleteJob(jobId);
  });

  it("returns empty caption and error for queued images", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "a.png", data: Buffer.from("a") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["a.png"].caption).toBeUndefined();
    expect(data.statuses["a.png"].error).toBeUndefined();
    expect(data.statuses["a.png"].prompt).toBeUndefined();

    store.deleteJob(jobId);
  });

  it("includes reasoningContent field in status response", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat",
      undefined,
      "describe this",
      "The image shows a feline..."
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["test.png"].reasoningContent).toBe(
      "The image shows a feline..."
    );

    store.deleteJob(jobId);
  });

  it("includes prompt field in status response", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
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

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["test.png"].prompt).toBe(
      "System: You are helpful\nUser: describe this"
    );

    store.deleteJob(jobId);
  });

  it("omits reasoningContent when not set", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat",
      undefined,
      "describe this"
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["test.png"].reasoningContent).toBeUndefined();

    store.deleteJob(jobId);
  });

  it("returns all fields together (caption, prompt, reasoningContent)", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat sitting on a table",
      undefined,
      "describe this",
      "The image shows a feline..."
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/status?jobId=${jobId}`);
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.statuses["test.png"].status).toBe("completed");
    expect(data.statuses["test.png"].caption).toBe("a cat sitting on a table");
    expect(data.statuses["test.png"].prompt).toBe("describe this");
    expect(data.statuses["test.png"].reasoningContent).toBe("The image shows a feline...");

    store.deleteJob(jobId);
  });
});
