/**
 * Tests for streamResponse: SSE parsing, delta-only token events,
 * and cached-token extraction from the final usage chunk.
 */

import { describe, it, expect } from "bun:test";
import { streamResponse } from "@/lib/caption-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function collectEvents(): {
  events: Array<{ type: string; data: Record<string, unknown> }>;
  sendEvent: (type: string, data: unknown) => void;
} {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const sendEvent = (type: string, data: unknown) => {
    events.push({ type, data: data as Record<string, unknown> });
  };
  return { events, sendEvent };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("streamResponse", () => {
  it("accumulates caption and reasoning content", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const { sendEvent } = collectEvents();

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("Hello");
    expect(result!.reasoningContent).toBe("think");
  });

  it("sends one token event per delta with only the delta content (no full payload)", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const { events, sendEvent } = collectEvents();

    await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    const tokenEvents = events.filter((e) => e.type === "token");
    expect(tokenEvents.length).toBe(2);
    for (const event of tokenEvents) {
      expect(event.data.content).toBeTypeOf("string");
      expect("full" in event.data).toBe(false);
    }
    expect(tokenEvents[0].data.content).toBe("Hel");
    expect(tokenEvents[1].data.content).toBe("lo");
  });

  it("reports cached tokens from usage.prompt_tokens_details in the final chunk", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5000,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":4812}}}\n\n',
      "data: [DONE]\n\n",
    ]);
    const { sendEvent } = collectEvents();

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result!.cachedTokens).toBe(4812);
  });

  it("falls back to timings.cache_n when usage is absent", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"timings":{"cache_n":123,"prompt_n":37}}\n\n',
      "data: [DONE]\n\n",
    ]);
    const { sendEvent } = collectEvents();

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result!.cachedTokens).toBe(123);
  });

  it("reports 0 cached tokens when neither usage nor timings are present", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const { sendEvent } = collectEvents();

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result!.cachedTokens).toBe(0);
  });

  it("returns null and cancels the reader when aborted mid-stream", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(stream);

    const controller = new AbortController();
    const { sendEvent } = collectEvents();
    const pending = streamResponse(response, "captioning", 0, sendEvent, controller.signal);
    controller.abort();

    const result = await pending;
    expect(result).toBeNull();
    expect(cancelled).toBe(true);
  });
});
