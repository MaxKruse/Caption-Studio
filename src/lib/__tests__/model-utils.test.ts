/**
 * Tests for getModelParallel -- --parallel discovery from /v1/models.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getModelParallel, fetchModels, parseParallelArgs } from "@/lib/model-utils";

const realFetch = globalThis.fetch;

/** Fetch mock that only responds after 10s, honoring abort signals. */
const slowFetch = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    const t = setTimeout(() => resolve(new Response("{}", { status: 200 })), 10_000);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** Build a /v1/models response body for a given model entry list. */
function modelsBody(entries: Record<string, unknown>[]) {
  return { data: entries };
}

describe("getModelParallel", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns the --parallel value when the server responds", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(modelsBody([
        { id: "qwen", status: { args: ["--parallel", "4"] } },
      ])), { status: 200 })) as unknown as typeof fetch;

    const result = await getModelParallel("http://localhost:8080", "qwen");
    expect(result).toBe(4);
  });

  it("returns undefined when the model is not in the list", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(modelsBody([
        { id: "other", status: { args: ["--parallel", "4"] } },
      ])), { status: 200 })) as unknown as typeof fetch;

    const result = await getModelParallel("http://localhost:8080", "qwen");
    expect(result).toBeUndefined();
  });

  it("returns undefined when --parallel is missing or unparsable", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(modelsBody([
        { id: "no-arg", status: { args: [] } },
        { id: "bad-arg", status: { args: ["--parallel", "abc"] } },
        { id: "zero-arg", status: { args: ["--parallel", "0"] } },
      ])), { status: 200 })) as unknown as typeof fetch;

    for (const id of ["no-arg", "bad-arg", "zero-arg"]) {
      const result = await getModelParallel("http://localhost:8000", id);
      expect(result).toBeUndefined();
    }
  });

  it("falls back to undefined when the server is slow (default 3s timeout)", async () => {
    // Server that never responds within the timeout window
    globalThis.fetch = slowFetch as typeof fetch;

    const start = Date.now();
    const result = await getModelParallel("http://localhost:8080", "qwen");
    const elapsed = Date.now() - start;

    expect(result).toBeUndefined();
    // Must give up quickly (default timeout) instead of blocking ~15s
    expect(elapsed).toBeLessThan(5000);
  }, 20_000);

  it("honors an explicit timeoutMs override", async () => {
    globalThis.fetch = slowFetch as typeof fetch;

    const start = Date.now();
    const result = await getModelParallel("http://localhost:8080", "qwen", 500);
    const elapsed = Date.now() - start;

    expect(result).toBeUndefined();
    expect(elapsed).toBeLessThan(2000);
  }, 10_000);
});

// ---------------------------------------------------------------------------
// parseParallelArgs tests
// ---------------------------------------------------------------------------

describe("parseParallelArgs", () => {
  it("extracts the --parallel value from an args list", () => {
    expect(parseParallelArgs(["--parallel", "4"])).toBe(4);
    expect(parseParallelArgs(["--host", "0.0.0.0", "--parallel", "8"])).toBe(8);
  });

  it("returns undefined when the flag is missing or unparsable", () => {
    expect(parseParallelArgs([])).toBeUndefined();
    expect(parseParallelArgs(["--parallel"])).toBeUndefined();
    expect(parseParallelArgs(["--parallel", "abc"])).toBeUndefined();
    expect(parseParallelArgs(["--parallel", "0"])).toBeUndefined();
  });

  it("returns undefined for non-array input", () => {
    expect(parseParallelArgs(undefined)).toBeUndefined();
    expect(parseParallelArgs("--parallel 4")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchModels tests
// ---------------------------------------------------------------------------

describe("fetchModels", () => {
  it("returns the model list for a 200 response", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(modelsBody([
        { id: "a" },
        { id: "b" },
      ])), { status: 200 })) as unknown as typeof fetch;

    const result = await fetchModels("http://localhost:8080");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models.map((m) => m.id)).toEqual(["a", "b"]);
    }
  });

  it("reports non-2xx responses with status and body", async () => {
    globalThis.fetch = (async () =>
      new Response("boom", { status: 503 })) as unknown as typeof fetch;

    const result = await fetchModels("http://localhost:8080");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("http");
      expect(result.status).toBe(503);
      expect(result.error).toContain("503");
      expect(result.error).toContain("boom");
    }
  });

  it("reports malformed response shapes", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ nope: true }), { status: 200 })) as unknown as typeof fetch;

    const result = await fetchModels("http://localhost:8080");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("malformed");
      expect(result.error).toContain("Unexpected response format");
    }
  });

  it("reports network failures", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await fetchModels("http://localhost:8080");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("network");
      expect(result.error).toContain("ECONNREFUSED");
    }
  });

  it("translates localhost via DOCKER_HOST_INTERNAL", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify(modelsBody([])), { status: 200 });
    }) as unknown as typeof fetch;

    const original = process.env.DOCKER_HOST_INTERNAL;
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    try {
      await fetchModels("http://localhost:8080");
    } finally {
      if (original === undefined) delete process.env.DOCKER_HOST_INTERNAL;
      else process.env.DOCKER_HOST_INTERNAL = original;
    }
    expect(seen[0]).toBe("http://host.docker.internal:8080/v1/models");
  });
});
