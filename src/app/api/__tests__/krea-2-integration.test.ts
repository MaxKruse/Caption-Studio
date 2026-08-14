/**
 * Integration tests for the krea-2 caption route.
 *
 * Exercises the real route handler end-to-end with a stubbed llama.cpp
 * server (globalThis.fetch): session creation, SSE event flow, slot
 * pinning (id_slot + cache flags), phase 2/3 conversation history, and
 * cached-token reporting.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import sharp from "sharp";
import { POST } from "@/app/api/caption/krea-2/route";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type SseEvent = { type: string; data: Record<string, unknown> };

const originalFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];

/** Build the SSE body llama.cpp would stream back for one phase. */
function makeSseResponse(caption: string, cachedTokens: number): Response {
  const chunks = [
    `data: {"choices":[{"delta":{"content":"${caption}"}}]}\n\n`,
    `data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":100,"completion_tokens":1,"total_tokens":101,"prompt_tokens_details":{"cached_tokens":${cachedTokens}}}}\n\n`,
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

/** Collect all SSE events from a route response until the stream closes. */
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
      if (match) {
        events.push({ type: match[1], data: JSON.parse(match[2]) });
      }
    }
  }
  return events;
}

async function makeTinyJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function postSingleImage(jpeg: Buffer): Promise<SseEvent[]> {
  const formData = new FormData();
  formData.append(
    "config",
    JSON.stringify({
      serverUrl: "http://localhost:8080",
      model: "test-model",
      userPrompt: "Describe this image.",
      characterDescription: "A red-haired woman",
    })
  );
  formData.append(
    "images",
    new File([new Uint8Array(jpeg)], "img.jpg", { type: "image/jpeg" })
  );

  const response = await POST(
    new Request("http://localhost/api/caption/krea-2", { method: "POST", body: formData })
  );
  expect(response.status).toBe(200);
  return readSseEvents(response as Response);
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
      // Phase 3 (distill) gets a different cached-token count so tests can
      // tell the phases apart.
      const callIndex = chatCalls.length;
      return makeSseResponse(`caption-${callIndex}`, callIndex * 100);
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

describe("krea-2 route - KV cache slot pinning", () => {
  it("sends exactly one chat completion request per phase (3 for one image)", async () => {
    chatCalls = [];
    const events = await postSingleImage(await makeTinyJpeg());

    expect(chatCalls.length).toBe(3);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("pins every phase to the same llama.cpp slot", async () => {
    chatCalls = [];
    await postSingleImage(await makeTinyJpeg());

    const slotIds = chatCalls.map((c) => c.id_slot);
    expect(slotIds).toEqual([0, 0, 0]);
  });

  it("enables prompt caching and chunk reuse on every request", async () => {
    chatCalls = [];
    await postSingleImage(await makeTinyJpeg());

    for (const call of chatCalls) {
      expect(call.cache_prompt).toBe(true);
      expect(call.n_cache_reuse).toBe(256);
      expect(call.stream).toBe(true);
      expect(call.stream_options).toEqual({ include_usage: true });
    }
  });

  it("phase 2 builds on the phase 1 conversation (KV cache-eligible prefix)", async () => {
    chatCalls = [];
    await postSingleImage(await makeTinyJpeg());

    const phase1 = chatCalls[0] as { messages: Array<Record<string, unknown>> };
    const phase2 = chatCalls[1] as { messages: Array<Record<string, unknown>> };

    // Phase 1 ends with the user (image + prompt) message
    expect(phase1.messages.length).toBe(2);
    // Phase 2 = phase 1 + assistant turn + refine user message
    expect(phase2.messages.length).toBe(4);
    expect(phase2.messages[0]).toEqual(phase1.messages[0]);
    expect(phase2.messages[1]).toEqual(phase1.messages[1]);
    expect(phase2.messages[2].role).toBe("assistant");
    expect(phase2.messages[3].role).toBe("user");
  });

  it("reports cached tokens in phase completion events", async () => {
    chatCalls = [];
    const events = await postSingleImage(await makeTinyJpeg());

    const captioning = events.find((e) => e.type === "image_complete");
    const refining = events.find((e) => e.type === "refine_image_complete");
    const distilling = events.find((e) => e.type === "distill_image_complete");

    expect(captioning!.data.cachedTokens).toBe(100);
    expect(refining!.data.cachedTokens).toBe(200);
    expect(distilling!.data.cachedTokens).toBe(300);
  });
});
