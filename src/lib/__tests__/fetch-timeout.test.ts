import { describe, it, expect } from "bun:test";
import { fetchWithTimeout } from "@/lib/caption-helpers";

/** Replace global.fetch with a stub (Bun's fetch type carries extra methods). */
function stubFetch(stub: (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>): void {
  global.fetch = stub as unknown as typeof fetch;
}

describe("fetchWithTimeout", () => {
  it("aborts after timeout", async () => {
    const originalFetch = global.fetch;
    // Mock fetch that respects AbortSignal
    stubFetch((url, init) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        signal?.addEventListener("abort", onAbort);
        // Simulate long-running request
        setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve(new Response("ok"));
        }, 1000);
      });
    });
    try {
      await expect(fetchWithTimeout("http://example.com", {}, 50)).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("aborts on external signal", async () => {
    const controller = new AbortController();
    const originalFetch = global.fetch;
    stubFetch((url, init) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        signal?.addEventListener("abort", onAbort);
        setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve(new Response("ok"));
        }, 1000);
      });
    });
    try {
      const promise = fetchWithTimeout("http://example.com", {}, 5000, controller.signal);
      controller.abort();
      await expect(promise).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("succeeds when response is fast", async () => {
    const originalFetch = global.fetch;
    stubFetch(async () => new Response("ok"));
    try {
      const res = await fetchWithTimeout("http://example.com", {}, 1000);
      expect(res.status).toBe(200);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
