/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// GET /api/models — Model listing proxy
// ---------------------------------------------------------------------------

describe("GET /api/models", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when serverUrl is missing", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/models");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing serverUrl query parameter");
  });

  it("returns 400 when serverUrl is empty string", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/models?serverUrl=");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
  });

  it("proxies to the remote server and returns vision models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "llava:13b",
            owned_by: "organization",
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
          {
            id: "llama3:70b",
            owned_by: "organization",
            architecture: {
              input_modalities: ["text"],
            },
          },
          {
            id: "bakllava",
            owned_by: "organization",
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.models)).toBe(true);
    // Should only return vision models (text + image)
    expect(data.models.length).toBe(2);
    expect(data.models[0].id).toBe("llava:13b");
    expect(data.models[1].id).toBe("bakllava");

    vi.unstubAllGlobals();
  });

  it("filters out text-only models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "llama3:70b",
            architecture: {
              input_modalities: ["text"],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.models.length).toBe(0);

    vi.unstubAllGlobals();
  });

  it("filters out image-only models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "clip-vit",
            architecture: {
              input_modalities: ["image"],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.models.length).toBe(0);

    vi.unstubAllGlobals();
  });

  it("filters out models without architecture field", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "old-model",
            // no architecture field
          },
          {
            id: "llava:13b",
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.models.length).toBe(1);
    expect(data.models[0].id).toBe("llava:13b");

    vi.unstubAllGlobals();
  });

  it("normalizes URL by stripping trailing slashes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "llava:13b",
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080///"
    );
    const res = await GET(req as any);
    await res.json();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/models",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      })
    );

    vi.unstubAllGlobals();
  });

  it("normalizes URL by stripping /v1 suffix", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "llava:13b",
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080/v1"
    );
    const res = await GET(req as any);
    await res.json();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/models",
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("returns server status code when server response is not OK", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Server responded with 500");

    vi.unstubAllGlobals();
  });

  it("returns 502 when server returns unexpected format", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: ["llama3"],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Unexpected response format from server");

    vi.unstubAllGlobals();
  });

  it("returns 502 when server response is null", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Unexpected response format from server");

    vi.unstubAllGlobals();
  });

  it("returns 502 on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      new Error("Connection refused")
    );

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain("Failed to connect to server");

    vi.unstubAllGlobals();
  });

  it("returns 502 on timeout", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Timeout"));

    vi.stubGlobal("fetch", mockFetch);

    const { GET } = await import("./route");

    const req = new Request(
      "http://localhost/api/models?serverUrl=http://localhost:8080"
    );
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain("Failed to connect to server");

    vi.unstubAllGlobals();
  });
});
