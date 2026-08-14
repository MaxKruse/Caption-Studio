/**
 * Integration tests for the for-anima caption route.
 *
 * Real route handler + stubbed llama.cpp server: Zod config validation,
 * slot pinning, and cached-token reporting.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/caption/for-anima/route";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type SseEvent = { type: string; data: Record<string, unknown> };

const originalFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];

function makeSseResponse(caption: string, cachedTokens: number): Response {
  const chunks = [
    `data: {"choices":[{"delta":{"content":"${caption}"}}]}\n\n`,
    `data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":800,"completion_tokens":1,"total_tokens":801,"prompt_tokens_details":{"cached_tokens":${cachedTokens}}}}\n\n`,
    "data: [DONE]\n\n",
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function readSseEvents(response: Response): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const match = block.match(/^event: (\w+)\s*\ndata: ([\s\S]+)$/);
      if (match) events.push({ type: match[1], data: JSON.parse(match[2]) });
    }
  }
  return events;
}

async function makeTinyJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 90, g: 90, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

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
      return new Response(
        JSON.stringify({ data: [{ id: "test-model", status: { args: ["--parallel", "4"] } }] }),
        { status: 200 }
      );
    }

    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(init?.body as string);
      chatCalls.push(body);
      return makeSseResponse("an addition", 750);
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

describe("for-anima route - KV cache slot pinning", () => {
  it("pins the request to the worker's slot with cache flags", async () => {
    chatCalls = [];
    const jpeg = await makeTinyJpeg();
    const response = await postImages(jpeg, {
      serverUrl: "http://localhost:8080",
      model: "test-model",
    });
    expect(response.status).toBe(200);
    const events = await readSseEvents(response as Response);

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
    const events = await readSseEvents(response as Response);

    const complete = events.find((e) => e.type === "image_complete");
    expect(complete!.data.status).toBe("completed");
    expect(complete!.data.cachedTokens).toBe(750);
  });
});
