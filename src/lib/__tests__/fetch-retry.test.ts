import { describe, it, expect } from "bun:test";
import { fetchWithRetry } from "@/lib/caption-helpers";

describe("fetch retry helper", () => {
  it("succeeds on first attempt", async () => {
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    try {
      const res = await fetchWithRetry("http://example.com", {}, 1000);
      expect(res.status).toBe(200);
      expect(calls).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("retries on 429 and eventually succeeds", async () => {
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      calls++;
      if (calls < 3) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    try {
      const res = await fetchWithRetry("http://example.com", {}, 1000, undefined, 3);
      expect(res.status).toBe(200);
      expect(calls).toBe(3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("fails after max retries on 500", async () => {
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      calls++;
      return new Response("Error", { status: 500 });
    };
    try {
      await expect(fetchWithRetry("http://example.com", {}, 1000, undefined, 2)).rejects.toThrow();
      expect(calls).toBe(3); // initial + 2 retries
    } finally {
      global.fetch = originalFetch;
    }
  });
});
