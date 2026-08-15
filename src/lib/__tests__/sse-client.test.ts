/**
 * Tests for the shared SSE client helpers (sse-client.ts).
 *
 * Both mode components consume caption SSE streams with the same
 * boilerplate: read chunks, buffer, split on \n\n, match
 * "event: X\ndata: {...}" blocks, JSON.parse, skip the rest.
 * These helpers centralize that logic. Keepalive comments
 * (": keepalive", see sse.ts) must be silently ignored.
 */

import { describe, it, expect } from "bun:test";
import { parseSseBlock, consumeSseStream } from "@/lib/sse-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ReadableStream that yields the given chunks in order. */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// parseSseBlock
// ---------------------------------------------------------------------------

describe("parseSseBlock", () => {
  it("parses a valid event block", () => {
    const block = 'event: image_complete\ndata: {"index":0,"status":"completed"}';
    const parsed = parseSseBlock(block);
    expect(parsed).toEqual({
      type: "image_complete",
      data: { index: 0, status: "completed" },
    });
  });

  it("allows trailing whitespace after the data line", () => {
    const block = 'event: done\ndata: {"allComplete":true}  \n';
    const parsed = parseSseBlock(block);
    expect(parsed?.type).toBe("done");
  });

  it("returns null for keepalive comment blocks", () => {
    expect(parseSseBlock(": keepalive")).toBeNull();
  });

  it("returns null for malformed JSON payloads", () => {
    expect(parseSseBlock("event: token\ndata: {not json")).toBeNull();
  });

  it("returns null for blocks without an event: line", () => {
    expect(parseSseBlock('data: {"x":1}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// consumeSseStream
// ---------------------------------------------------------------------------

describe("consumeSseStream", () => {
  it("emits every event in order and resolves on stream end", async () => {
    const stream = chunkedStream([
      'event: session\ndata: {"sessionId":"abc"}\n\nevent: done\ndata: {"allComplete":true}\n\n',
    ]);

    const events: string[] = [];
    await consumeSseStream(stream, (e) => events.push(e.type));

    expect(events).toEqual(["session", "done"]);
  });

  it("handles a block split across multiple read() calls", async () => {
    const stream = chunkedStream(["event: tok", 'en\ndata: {"a":', "1}\n\n"]);

    const events: unknown[] = [];
    await consumeSseStream(stream, (e) => events.push(e));

    expect(events).toEqual([
      { type: "token", data: { a: 1 } },
    ]);
  });

  it("handles multiple blocks in a single chunk", async () => {
    const stream = chunkedStream([
      'event: a\ndata: {"i":0}\n\nevent: b\ndata: {"i":1}\n\nevent: c\ndata: {"i":2}\n\n',
    ]);

    const events: string[] = [];
    await consumeSseStream(stream, (e) => events.push(e.type));

    expect(events).toEqual(["a", "b", "c"]);
  });

  it("silently skips keepalive comments interleaved with events", async () => {
    const stream = chunkedStream([
      ": keepalive\n\nevent: x\ndata: {}\n\n: keepalive\n\n",
    ]);

    const events: string[] = [];
    await consumeSseStream(stream, (e) => events.push(e.type));

    expect(events).toEqual(["x"]);
  });

  it("skips malformed blocks without stopping consumption", async () => {
    const stream = chunkedStream([
      "event: broken\ndata: {oops}\n\nevent: ok\ndata: {\"fine\":true}\n\n",
    ]);

    const events: unknown[] = [];
    await consumeSseStream(stream, (e) => events.push(e));

    expect(events).toEqual([{ type: "ok", data: { fine: true } }]);
  });
});
