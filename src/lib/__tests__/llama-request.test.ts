/**
 * Tests for llama.cpp chat request builder.
 *
 * The builder adds llama.cpp-specific fields that enable KV cache reuse:
 * - id_slot: pins the request to a worker slot so multi-turn conversations
 *   (krea2 phases) and same-worker image batches reuse cached prompt KV.
 * - cache_prompt: keep the slot's prompt KV between requests (llama.cpp
 *   default is on, set explicitly so a server with --no-cache-prompt is
 *   overridden per request).
 * - n_cache_reuse: allow chunk-wise KV reuse via shifting (server default
 *   is 0 = disabled), so shared prompt text around differing images is
 *   not re-prefilled.
 */

import { describe, it, expect } from "bun:test";
import { buildChatRequest } from "@/lib/llama-request";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sampleMessages(): Array<Record<string, unknown>> {
  return [
    { role: "system", content: "You are a captioner." },
    { role: "user", content: "Describe this image." },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildChatRequest", () => {
  it("includes model and messages", () => {
    const messages = sampleMessages();
    const body = buildChatRequest({
      model: "gemma-3-12b-it",
      messages,
      slotId: 0,
    });

    expect(body.model).toBe("gemma-3-12b-it");
    expect(body.messages).toBe(messages);
  });

  it("enables streaming with usage for token SSE forwarding", () => {
    const body = buildChatRequest({
      model: "gemma",
      messages: sampleMessages(),
      slotId: 0,
    });

    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("pins the request to the given llama.cpp slot", () => {
    const body = buildChatRequest({
      model: "gemma",
      messages: sampleMessages(),
      slotId: 3,
    });

    expect(body.id_slot).toBe(3);
  });

  it("enables prompt caching on the slot", () => {
    const body = buildChatRequest({
      model: "gemma",
      messages: sampleMessages(),
      slotId: 0,
    });

    expect(body.cache_prompt).toBe(true);
  });

  it("enables chunk-wise cache reuse so shared prefixes survive image changes", () => {
    const body = buildChatRequest({
      model: "gemma",
      messages: sampleMessages(),
      slotId: 0,
    });

    expect(body.n_cache_reuse).toBe(256);
  });
});
