/**
 * Shared caption client contract: the per-image result type both caption
 * modes accumulate from SSE events, compact token formatting, and the
 * fire-and-forget session abort call.
 */

// ---------------------------------------------------------------------------
// Per-image result
// ---------------------------------------------------------------------------

export interface CaptionResult {
  name: string;
  imageDataUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  partialCaption?: string;
  reasoningContent?: string;
  partialReasoning?: string;
  error?: string;
  /** The final prompt used for this image, if any (shown in the viewer). */
  prompt?: string;
  /** Prompt tokens reused from the llama.cpp KV cache (all phases). */
  cachedTokens?: number;
  /** Total prompt tokens processed for this image (all phases). */
  promptTokens?: number;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a token count compactly (1234 -> "1.2k"). */
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// ---------------------------------------------------------------------------
// Session abort
// ---------------------------------------------------------------------------

/**
 * Ask the server to abort a running caption session.
 * Fire-and-forget: errors are swallowed (the client is going away anyway).
 *
 * @param apiPath Caption API path, e.g. "/api/caption/krea-2".
 */
export function stopCaptionSession(apiPath: string, sessionId: string): void {
  fetch(`${apiPath}?sessionId=${sessionId}`, { method: "DELETE" }).catch(() => {});
}
