/**
 * Tests for caption helper utilities.
 */

import { describe, it, expect } from "bun:test";
import { readFileBuffer, sleep, chatComplete, readChatCompletion } from "@/lib/caption-helpers";

// ---------------------------------------------------------------------------
// chatComplete tests
// ---------------------------------------------------------------------------

describe("chatComplete", () => {
  const realFetch = globalThis.fetch;

  it("sends the slot-pinned chat request and returns the response", async () => {
    let seenBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seenBody = JSON.parse(init?.body as string) as Record<string, unknown>;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const response = await chatComplete("http://localhost:8080", {
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        slotId: 2,
        timeoutMs: 1000,
      });
      expect(response.status).toBe(200);
      expect(seenBody!.id_slot).toBe(2);
      expect(seenBody!.cache_prompt).toBe(true);
      expect(seenBody!.stream).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("throws API <status>: <body> for non-retryable (4xx) errors", async () => {
    globalThis.fetch = (async () =>
      new Response("bad request body", { status: 400 })) as unknown as typeof fetch;

    try {
      await expect(
        chatComplete("http://localhost:8080", {
          model: "test-model",
          messages: [],
          slotId: 0,
          timeoutMs: 1000,
        })
      ).rejects.toThrow("API 400: bad request body");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("throws after exhausting retries on repeated 5xx", async () => {
    globalThis.fetch = (async () =>
      new Response("server exploded", { status: 500 })) as unknown as typeof fetch;

    try {
      await expect(
        chatComplete("http://localhost:8080", {
          model: "test-model",
          messages: [],
          slotId: 0,
          timeoutMs: 1000,
          maxRetries: 0,
        })
      ).rejects.toThrow(/HTTP 500/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("retries transient 5xx responses by default", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts++;
      if (attempts < 3) return new Response("busy", { status: 503 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const response = await chatComplete("http://localhost:8080", {
        model: "test-model",
        messages: [],
        slotId: 0,
        timeoutMs: 1000,
      });
      expect(response.status).toBe(200);
      expect(attempts).toBe(3);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("chatComplete body override", () => {
  const realFetch = globalThis.fetch;

  it("sends the provided body verbatim instead of the streaming default", async () => {
    let seenBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seenBody = JSON.parse(init?.body as string) as Record<string, unknown>;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const body = {
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
        max_tokens: 8192,
      };
      const response = await chatComplete("http://localhost:8080", {
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        slotId: 0,
        timeoutMs: 1000,
        body,
      });
      expect(response.status).toBe(200);
      expect(seenBody).toEqual(body);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("readChatCompletion", () => {
  it("extracts caption, reasoning, and KV cache stats from a non-streaming response", async () => {
    const response = new Response(
      JSON.stringify({
        choices: [
          { message: { content: "  caption text ", reasoning_content: " thought " } },
        ],
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 50,
          total_tokens: 1250,
          prompt_tokens_details: { cached_tokens: 900 },
        },
      }),
      { status: 200 }
    );

    const result = await readChatCompletion(response);
    expect(result).not.toBeNull();
    expect(result!.caption).toBe("caption text");
    expect(result!.reasoningContent).toBe("thought");
    expect(result!.cachedTokens).toBe(900);
    expect(result!.promptTokens).toBe(1200);
  });

  it("falls back to timings.cache_n when prompt_tokens_details is absent", async () => {
    const response = new Response(
      JSON.stringify({
        choices: [{ message: { content: "c" } }],
        usage: { prompt_tokens: 100 },
        timings: { cache_n: 42 },
      }),
      { status: 200 }
    );

    const result = await readChatCompletion(response);
    expect(result).not.toBeNull();
    expect(result!.cachedTokens).toBe(42);
    expect(result!.reasoningContent).toBe("");
  });

  it("returns zeroed stats and empty caption for a bare message", async () => {
    const response = new Response(
      JSON.stringify({ choices: [{ message: {} }], usage: {} }),
      { status: 200 }
    );

    const result = await readChatCompletion(response);
    expect(result).not.toBeNull();
    expect(result!.caption).toBe("");
    expect(result!.cachedTokens).toBe(0);
    expect(result!.promptTokens).toBe(0);
  });

  it("returns null when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const response = new Response(JSON.stringify({ choices: [] }), { status: 200 });

    const result = await readChatCompletion(response, controller.signal);
    expect(result).toBeNull();
  });

  it("throws on a non-JSON response body", async () => {
    const response = new Response("<html>oops</html>", { status: 200 });

    await expect(readChatCompletion(response)).rejects.toThrow("Invalid JSON");
  });
});

// ---------------------------------------------------------------------------
// sleep tests
// ---------------------------------------------------------------------------

describe("sleep", () => {
  it("resolves after approximately the requested delay", async () => {
    const start = Date.now();
    await sleep(80);
    expect(Date.now() - start).toBeGreaterThanOrEqual(70);
  });

  it("resolves immediately for a zero delay", async () => {
    const start = Date.now();
    await sleep(0);
    expect(Date.now() - start).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// readFileBuffer tests
// ---------------------------------------------------------------------------

describe("readFileBuffer", () => {
  it("returns correct buffer content for a text file", async () => {
    const content = "Hello, World!";
    const file = new File([content], "test.txt", { type: "text/plain" });
    const buffer = await readFileBuffer(file);
    expect(buffer.toString()).toBe(content);
  });

  it("returns correct buffer content for binary data", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });
    const buffer = await readFileBuffer(file);
    expect(buffer.length).toBe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      expect(buffer[i]).toBe(bytes[i]);
    }
  });

  it("handles empty file", async () => {
    const file = new File([""], "empty.txt", { type: "text/plain" });
    const buffer = await readFileBuffer(file);
    expect(buffer.length).toBe(0);
  });

  it("handles different file types", async () => {
    const content = "PNG data here";
    const file = new File([content], "test.png", { type: "image/png" });
    const buffer = await readFileBuffer(file);
    expect(buffer.toString()).toBe(content);
  });
});
