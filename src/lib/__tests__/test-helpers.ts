/**
 * Shared test doubles for route integration tests.
 *
 * SSE parsing reuses the production client helpers (sse-client.ts) so
 * tests validate the exact wire format the browser consumes. Chat
 * completion responses mimic the streaming shape llama.cpp returns.
 */

import sharp from "sharp";
import { consumeSseStream, type SseEvent } from "@/lib/sse-client";

export type { SseEvent };

// ---------------------------------------------------------------------------
// SSE collection
// ---------------------------------------------------------------------------

/**
 * Read all SSE events from a route response until the stream closes.
 */
export async function collectSseEvents(response: Response): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  if (!response.body) return events;
  await consumeSseStream(response.body, (event) => events.push(event));
  return events;
}

/**
 * Read only the first SSE event from a response body.
 * Used by timing tests that must not wait for the full stream.
 * Releases the reader lock so the caller can drain the rest.
 */
export async function readFirstEvent(
  body: ReadableStream<Uint8Array>
): Promise<SseEvent | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseBlock(block);
        if (event) return event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Find the first event of a given type and return its payload as a
 * record (undefined when no event of that type was seen).
 */
export function findEvent(
  events: SseEvent[],
  type: string
): Record<string, unknown> | undefined {
  const event = events.find((e) => e.type === type);
  return event ? (event.data as Record<string, unknown>) : undefined;
}

/** Parse a single "event: X\ndata: {...}" block (test-local, strict). */
function parseBlock(block: string): SseEvent | null {
  const match = block.match(/^event: (\w+)\s*\ndata: ([\s\S]+)$/);
  if (!match) return null;
  try {
    return { type: match[1], data: JSON.parse(match[2]) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// llama.cpp response stubs
// ---------------------------------------------------------------------------

export interface ChatSseResponseOptions {
  /** prompt_tokens reported in the final usage chunk (default 100). */
  promptTokens?: number;
  /** cached_tokens reported in the final usage chunk (default 0). */
  cachedTokens?: number;
}

/**
 * Build a streaming chat-completion Response shaped like llama.cpp's
 * output: one content delta, then a usage chunk, then the [DONE] sentinel.
 */
export function makeChatSseResponse(
  caption: string,
  options: ChatSseResponseOptions = {}
): Response {
  const { promptTokens = 100, cachedTokens = 0 } = options;
  const chunks = [
    `data: {"choices":[{"delta":{"content":"${caption}"}}]}\n\n`,
    `data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":${promptTokens},"completion_tokens":1,"total_tokens":${promptTokens + 1},"prompt_tokens_details":{"cached_tokens":${cachedTokens}}}}\n\n`,
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

// ---------------------------------------------------------------------------
// Image fixtures
// ---------------------------------------------------------------------------

export interface TinyJpegOptions {
  width?: number;
  height?: number;
  /** { r, g, b } background color (default red). */
  color?: { r: number; g: number; b: number };
}

/** Create a small JPEG buffer with sharp (default 16x16 red). */
export async function makeTinyJpeg(
  options: TinyJpegOptions = {}
): Promise<Buffer> {
  const { width = 16, height = 16, color = { r: 200, g: 100, b: 50 } } = options;
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}
