/**
 * Client-side accumulation of delta-only SSE token events.
 *
 * Server token events carry just the new content (no full caption),
 * so the client must append each delta to the per-image partial state.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-image partial output state while a phase is streaming. */
export interface PartialState {
  partialCaption?: string;
  partialReasoning?: string;
}

/** A token event payload from the caption SSE stream. */
export interface TokenEvent {
  type: "caption" | "reasoning";
  content: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Append a token delta to the matching partial field.
 * Generic over the host object so extra fields (name, status, ...)
 * are preserved. Returns a new state object (React friendly).
 */
export function applyTokenDelta<T extends PartialState>(state: T, token: TokenEvent): T {
  if (token.type === "caption") {
    return { ...state, partialCaption: (state.partialCaption ?? "") + token.content };
  }
  return { ...state, partialReasoning: (state.partialReasoning ?? "") + token.content };
}
