/**
 * llama.cpp chat completion request builder.
 *
 * Builds the JSON body for POST /v1/chat/completions with the
 * llama.cpp-specific fields that make KV cache reuse deterministic:
 *
 * - `id_slot`: pins the request to a specific server slot. The KV cache is
 *   per-slot, so pinning a worker to a slot guarantees that follow-up
 *   requests (krea2 phases 2/3, or the next image in a for-anima batch)
 *   land on the slot holding the cached prompt.
 * - `cache_prompt`: keep the slot's prompt KV between requests so the next
 *   request on that slot can skip re-prefilling the shared prefix.
 * - `n_cache_reuse`: allow reusing KV chunks via shifting (server default
 *   is 0 = off), so prompt text shared around differing images (system
 *   prompt, identical user prompt) is not re-prefilled.
 *
 * Older llama.cpp builds that do not know these fields ignore them, so it
 * is safe to always send them.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum token chunk size for chunk-wise KV reuse.
 * 256 matches the typical value recommended in the llama.cpp docs.
 */
export const CACHE_REUSE_TOKENS = 256;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatRequestOptions {
  /** Model id as reported by /v1/models. */
  model: string;
  /** Chat messages (system + user/assistant turns). */
  messages: Array<Record<string, unknown>>;
  /** llama.cpp slot id to pin this request to (worker index). */
  slotId: number;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a streaming chat completion request body for llama.cpp
 * with slot pinning and KV cache reuse enabled.
 */
export function buildChatRequest(options: ChatRequestOptions): Record<string, unknown> {
  return {
    model: options.model,
    messages: options.messages,
    stream: true,
    stream_options: { include_usage: true },
    id_slot: options.slotId,
    cache_prompt: true,
    n_cache_reuse: CACHE_REUSE_TOKENS,
  };
}
