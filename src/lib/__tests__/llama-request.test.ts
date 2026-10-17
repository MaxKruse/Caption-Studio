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
import { buildChatRequest, buildMossChatRequest } from "@/lib/llama-request";

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

describe("buildMossChatRequest", () => {
  it("uses the MOSS-Image guide request format (non-streaming)", () => {
    const body = buildMossChatRequest({
      model: "qwen3.5-27b",
      messages: sampleMessages(),
      slotId: 0,
      maxTokens: 16384,
      enableThinking: true,
    });

    expect(body.stream).toBe(false);
    expect(body.n).toBe(1);
    expect(body.max_tokens).toBe(16384);
    expect(body.temperature).toBe(1);
    expect(body.top_p).toBe(0.95);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
  });

  it("reflects the enableThinking setting and maxTokens", () => {
    const body = buildMossChatRequest({
      model: "qwen3.5-27b",
      messages: sampleMessages(),
      slotId: 0,
      maxTokens: 8192,
      enableThinking: false,
    });

    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.max_tokens).toBe(8192);
  });

  it("keeps the slot-pinning fields for KV cache reuse", () => {
    const messages = sampleMessages();
    const body = buildMossChatRequest({
      model: "qwen3.5-27b",
      messages,
      slotId: 2,
      maxTokens: 16384,
      enableThinking: true,
    });

    expect(body.model).toBe("qwen3.5-27b");
    expect(body.messages).toBe(messages);
    expect(body.id_slot).toBe(2);
    expect(body.cache_prompt).toBe(true);
    expect(body.n_cache_reuse).toBe(256);
  });
});
