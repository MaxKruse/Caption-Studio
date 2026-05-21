/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// POST /api/caption — Start a batch captioning job
// ---------------------------------------------------------------------------

describe("POST /api/caption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when no images provided", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [] }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns 400 when images is not an array", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: "not-an-array" }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns 400 when images is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns 400 when serverUrl is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: Buffer.from("fake").toString("base64") }],
        model: "llama3",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when model is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: Buffer.from("fake").toString("base64") }],
        serverUrl: "http://localhost:8080",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when both serverUrl and model are missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: Buffer.from("fake").toString("base64") }],
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns a job ID on success", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake-png-data").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        systemPrompt: "You are helpful",
        userPrompt: "Describe this image",
        captionName: "Batch01",
        includeNameInPrompt: true,
        parallelRequests: 4,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.jobId).toBeDefined();
    expect(typeof data.jobId).toBe("string");

    vi.unstubAllGlobals();
  });

  it("clamps parallelRequests to 1-8 range", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    // Send parallelRequests = 100
    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        parallelRequests: 100,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(data.jobId).toBeDefined();

    // Check the store has clamped value
    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    expect(job?.parallelRequests).toBe(8);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });

  it("uses default 4 when parallelRequests is 0 (falsy fallback)", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        parallelRequests: 0,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    // Number(0) || 4 = 4, so 0 falls back to 4
    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    expect(job?.parallelRequests).toBe(4);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });

  it("clamps parallelRequests to minimum 1 when explicitly set", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        parallelRequests: 1,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    expect(job?.parallelRequests).toBe(1);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });

  it("decodes base64 image data correctly", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const originalData = "fake-image-content";
    const base64Data = Buffer.from(originalData).toString("base64");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: base64Data }],
        serverUrl: "http://localhost:8080",
        model: "llama3",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    const imageEntry = job?.images.get("test.png");
    expect(imageEntry?.data.toString()).toBe(originalData);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });
});
