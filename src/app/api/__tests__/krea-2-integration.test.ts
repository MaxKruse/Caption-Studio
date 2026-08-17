/**
 * Integration tests for the krea-2 caption route.
 *
 * Exercises the real route handler end-to-end with a stubbed llama.cpp
 * server (globalThis.fetch): session creation, SSE event flow, slot
 * pinning (id_slot + cache flags), phase 2/3 conversation history, and
 * cached-token reporting.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/caption/krea-2/route";
import {
  collectSseEvents,
  readFirstEvent,
  makeChatSseResponse,
  makeTinyJpeg,
  findEvent,
  type SseEvent,
} from "@/lib/__tests__/test-helpers";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];
/** Number of upcoming chat calls to fail with 503 (transient error simulation). */
let failNextChatCalls = 0;
/** Artificial delay for the /v1/models endpoint (ms). */
let modelDelayMs = 0;

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
    new NextRequest("http://localhost/api/caption/krea-2", { method: "POST", body: formData })
  );
  expect(response.status).toBe(200);
  return collectSseEvents(response as Response);
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
      if (failNextChatCalls > 0) {
        failNextChatCalls--;
        return new Response(JSON.stringify({ error: "server busy" }), { status: 503 });
      }
      const body = JSON.parse(init?.body as string);
      chatCalls.push(body);
      // Phase 3 (distill) gets a different cached-token count so tests can
      // tell the phases apart.
      const callIndex = chatCalls.length;
      return makeChatSseResponse(`caption-${callIndex}`, {
        cachedTokens: callIndex * 100,
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

  it("sends the session event before model discovery completes", async () => {
    chatCalls = [];
    modelDelayMs = 500; // discovery is slower than the deadline below
    try {
      const jpeg = await makeTinyJpeg();
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
      // Time from before POST: the route must not block on model discovery
      // before streaming the first event.
      const start = Date.now();
      const response = await POST(
        new NextRequest("http://localhost/api/caption/krea-2", {
          method: "POST",
          body: formData,
        })
      );
      expect(response.status).toBe(200);

      // Read only the first SSE event and time it
      const firstEvent = await readFirstEvent(
        response.body as ReadableStream<Uint8Array>
      );
      const elapsed = Date.now() - start;
      // Drain the rest of the stream so the session finishes (and its
      // chat calls stop) before the next test resets the stub state.
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

  it("retries transient 5xx responses and completes the phase", async () => {
    chatCalls = [];
    failNextChatCalls = 2; // phase 1 gets 503 twice, then succeeds
    try {
      const events = await postSingleImage(await makeTinyJpeg());

      expect(findEvent(events, "image_complete")?.status).toBe("completed");
      expect(events.some((e) => e.type === "done")).toBe(true);
      // 2 failed attempts + 3 successful phases
      expect(chatCalls.length).toBe(3);
    } finally {
      failNextChatCalls = 0;
    }
  });

  it("reports cached tokens in phase completion events", async () => {
    chatCalls = [];
    const events = await postSingleImage(await makeTinyJpeg());

    const captioning = findEvent(events, "image_complete");
    const refining = findEvent(events, "refine_image_complete");
    const distilling = findEvent(events, "distill_image_complete");

    expect(captioning?.cachedTokens).toBe(100);
    expect(refining?.cachedTokens).toBe(200);
    expect(distilling?.cachedTokens).toBe(300);
    // The usage stub reports prompt_tokens: 100 per phase
    expect(captioning?.promptTokens).toBe(100);
  });
});
