/**
 * Integration tests for the for-anima caption route.
 *
 * Real route handler + stubbed llama.cpp server: Zod config validation,
 * slot pinning, and cached-token reporting.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { NextRequest } from "next/server";
import { POST, API_TIMEOUT_MS } from "@/app/api/caption/for-anima/route";
import {
  collectSseEvents,
  readFirstEvent,
  makeChatSseResponse,
  makeTinyJpeg,
  findEvent,
} from "@/lib/__tests__/test-helpers";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];
let modelDelayMs = 0;

async function postImages(jpeg: Buffer, config: Record<string, unknown>): Promise<Response> {
  const formData = new FormData();
  formData.append("config", JSON.stringify(config));
  formData.append("images", new File([new Uint8Array(jpeg)], "img.jpg", { type: "image/jpeg" }));
  return POST(
    new NextRequest("http://localhost/api/caption/for-anima", {
      method: "POST",
      body: formData,
    })
  );
}

beforeAll(() => {
  chatCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/v1/models")) {
      if (modelDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, modelDelayMs));
      }
      return new Response(
        JSON.stringify({ data: [{ id: "test-model", status: { args: ["--parallel", "4"] } }] }),
        { status: 200 }
      );
    }

    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(init?.body as string);
      chatCalls.push(body);
      return makeChatSseResponse("an addition", {
        promptTokens: 800,
        cachedTokens: 750,
      });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("for-anima route - per-image timeout", () => {
  it("is bounded to 5 minutes (short enhancement output)", () => {
    expect(API_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});

describe("for-anima route - config validation", () => {
  it("rejects config without a model", async () => {
    const jpeg = await makeTinyJpeg();
    const response = await postImages(jpeg, { serverUrl: "http://localhost:8080" });
    expect(response.status).toBe(400);
  });

  it("rejects config with an invalid serverUrl", async () => {
    const jpeg = await makeTinyJpeg();
    const response = await postImages(jpeg, {
      serverUrl: "not-a-url",
      model: "test-model",
    });
    expect(response.status).toBe(400);
  });

  it("rejects config with an empty model", async () => {
    const jpeg = await makeTinyJpeg();
    const response = await postImages(jpeg, {
      serverUrl: "http://localhost:8080",
      model: "",
    });
    expect(response.status).toBe(400);
  });
});

describe("for-anima route - streaming", () => {
  it("sends the session event before model discovery completes", async () => {
    chatCalls = [];
    modelDelayMs = 500;
    try {
      const jpeg = await makeTinyJpeg();
      const start = Date.now();
      const response = await postImages(jpeg, {
        serverUrl: "http://localhost:8080",
        model: "test-model",
      });
      expect(response.status).toBe(200);

      const firstEvent = await readFirstEvent(
        response.body as ReadableStream<Uint8Array>
      );
      const elapsed = Date.now() - start;
      // Drain the rest of the stream so the session finishes before the
      // next test resets the stub state.
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(firstEvent!.type).toBe("session");
      expect(elapsed).toBeLessThan(250);
    } finally {
      modelDelayMs = 0;
    }
  });
});

describe("for-anima route - KV cache slot pinning", () => {
  it("pins the request to the worker's slot with cache flags", async () => {
    chatCalls = [];
    const jpeg = await makeTinyJpeg();
    const response = await postImages(jpeg, {
      serverUrl: "http://localhost:8080",
      model: "test-model",
    });
    expect(response.status).toBe(200);
    const events = await collectSseEvents(response as Response);

    expect(chatCalls.length).toBe(1);
    expect(chatCalls[0].id_slot).toBe(0);
    expect(chatCalls[0].cache_prompt).toBe(true);
    expect(chatCalls[0].n_cache_reuse).toBe(256);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("reports cached tokens in image_complete", async () => {
    chatCalls = [];
    const jpeg = await makeTinyJpeg();
    const response = await postImages(jpeg, {
      serverUrl: "http://localhost:8080",
      model: "test-model",
    });
    const events = await collectSseEvents(response as Response);

    const complete = findEvent(events, "image_complete");
    expect(complete?.status).toBe("completed");
    expect(complete?.cachedTokens).toBe(750);
  });
});
