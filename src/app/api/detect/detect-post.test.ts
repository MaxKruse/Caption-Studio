/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// POST /api/detect — validation and job creation
// ---------------------------------------------------------------------------

describe("POST /api/detect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when config is missing", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing config");
  });

  it("returns 400 when config parses to non-object (number)", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    // "123" is valid JSON but parses to a number, not an object
    formData.set("config", "123");

    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    // Number has no serverUrl or model
    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when config JSON is invalid", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    formData.set("config", "not-valid-json{{{");

    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid config JSON");
  });

  it("returns 400 when serverUrl is missing", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    formData.set("config", JSON.stringify({ model: "gpt-4o" }));

    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when model is missing", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    formData.set("config", JSON.stringify({ serverUrl: "http://localhost:8080" }));

    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when both serverUrl and model are missing", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    formData.set("config", JSON.stringify({}));

    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when no images are provided", async () => {
    const { POST } = await import("./route");

    const formData = new FormData();
    formData.set("config", JSON.stringify({
      serverUrl: "http://localhost:8080",
      model: "gpt-4o",
    }));

    const req = new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns jobId on valid request", async () => {
    const store = await import("@/lib/detect-store");

    const { POST } = await import("./route");

    // Mock FormData — jsdom + Node.js Request have FormData compatibility issues
    const mockFormData = {
      get: (key: string) => key === "config"
        ? JSON.stringify({ serverUrl: "http://localhost:8080", model: "gpt-4o" })
        : null,
      getAll: (key: string) => key === "images" ? [{ name: "test.png", arrayBuffer: async () => new ArrayBuffer(4) }] : [],
    };
    const mockReq = {
      headers: { get: () => "multipart/form-data" },
      formData: async () => mockFormData,
    };

    const res = await POST(mockReq as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.jobId).toBeDefined();
    expect(typeof data.jobId).toBe("string");
    expect(data.jobId.startsWith("det_")).toBe(true);

    // Job should exist in store
    const job = store.getDetectionJob(data.jobId);
    expect(job).toBeDefined();
    expect(job?.images.size).toBe(1);

    store.deleteDetectionJob(data.jobId);
  });

  it("creates job with correct image count and names", async () => {
    const store = await import("@/lib/detect-store");

    const { POST } = await import("./route");

    const mockFormData = {
      get: (key: string) => key === "config"
        ? JSON.stringify({ serverUrl: "http://localhost:8080", model: "gpt-4o" })
        : null,
      getAll: (key: string) => key === "images"
        ? [
            { name: "a.png", arrayBuffer: async () => new ArrayBuffer(1) },
            { name: "b.jpg", arrayBuffer: async () => new ArrayBuffer(1) },
            { name: "c.webp", arrayBuffer: async () => new ArrayBuffer(1) },
          ]
        : [],
    };
    const mockReq = {
      headers: { get: () => "multipart/form-data" },
      formData: async () => mockFormData,
    };

    const res = await POST(mockReq as any);
    const data = await res.json();

    const job = store.getDetectionJob(data.jobId);
    expect(job?.images.size).toBe(3);

    // Verify image names are stored correctly
    const names = Array.from(job!.images.keys());
    expect(names).toContain("a.png");
    expect(names).toContain("b.jpg");
    expect(names).toContain("c.webp");

    store.deleteDetectionJob(data.jobId);
  });

  it("stores serverUrl and model in job", async () => {
    const store = await import("@/lib/detect-store");

    const { POST } = await import("./route");

    const mockFormData = {
      get: (key: string) => key === "config"
        ? JSON.stringify({ serverUrl: "http://my-custom-server:9000", model: "custom-vision-model" })
        : null,
      getAll: (key: string) => key === "images"
        ? [{ name: "test.png", arrayBuffer: async () => new ArrayBuffer(4) }]
        : [],
    };
    const mockReq = {
      headers: { get: () => "multipart/form-data" },
      formData: async () => mockFormData,
    };

    const res = await POST(mockReq as any);
    const data = await res.json();

    const job = store.getDetectionJob(data.jobId);
    expect(job?.serverUrl).toBe("http://my-custom-server:9000");
    expect(job?.model).toBe("custom-vision-model");

    store.deleteDetectionJob(data.jobId);
  });
});
