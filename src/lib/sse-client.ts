/**
 * Shared SSE client helpers for browser-side stream consumption.
 *
 * Both mode components consume caption SSE streams with identical
 * boilerplate: read chunks, buffer them, split on "\n\n", match
 * "event: X\ndata: {...}" blocks, and JSON.parse the payload.
 * Keepalive comments (": keepalive", see sse.ts) are silently
 * ignored, as are malformed blocks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SseEvent {
  type: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE block ("event: X\ndata: {...}").
 * Returns null for keepalive comments, missing event lines, or
 * malformed JSON payloads.
 */
export function parseSseBlock(block: string): SseEvent | null {
  const eventMatch = block.match(/^event: (\w+)\s*\ndata: ([\s\S]+)$/);
  if (!eventMatch) return null;

  try {
    const data: unknown = JSON.parse(eventMatch[2]);
    return { type: eventMatch[1], data };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stream consumption
// ---------------------------------------------------------------------------

/**
 * Consume an SSE ReadableStream, invoking onEvent for every parsed
 * event. Resolves when the stream ends. Malformed blocks and
 * keepalive comments are skipped without affecting consumption.
 */
export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }
  }
}
