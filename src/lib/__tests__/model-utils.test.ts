/**
 * Tests for getModelParallel -- --parallel discovery from /v1/models.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getModelParallel } from "@/lib/model-utils";

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
      ])), { status: 200 })) as typeof fetch;

    const result = await getModelParallel("http://localhost:8080", "qwen");
    expect(result).toBe(4);
  });

  it("returns undefined when the model is not in the list", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(modelsBody([
        { id: "other", status: { args: ["--parallel", "4"] } },
      ])), { status: 200 })) as typeof fetch;

    const result = await getModelParallel("http://localhost:8080", "qwen");
    expect(result).toBeUndefined();
  });

  it("returns undefined when --parallel is missing or unparsable", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(modelsBody([
        { id: "no-arg", status: { args: [] } },
        { id: "bad-arg", status: { args: ["--parallel", "abc"] } },
        { id: "zero-arg", status: { args: ["--parallel", "0"] } },
      ])), { status: 200 })) as typeof fetch;

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
