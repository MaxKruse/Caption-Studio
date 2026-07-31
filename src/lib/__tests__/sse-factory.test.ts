/**
 * Tests for the SSE stream factory pattern used in all caption routes.
 * Tests the createSseStream() helper that returns [stream, sendEvent, closeStream].
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Inline the current implementation (same pattern in all 4 route files)
// ---------------------------------------------------------------------------

function createSseStream(): [
  ReadableStream<string>,
  (type: string, data: unknown) => void,
  () => void,
] {
  let controller: ReadableStreamDefaultController<string> | undefined;

  const sendEvent = (type: string, data: unknown) => {
    if (controller) {
      const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(line);
    }
  };

  const closeStream = () => {
    if (controller) {
      try {
        controller.close();
      } catch {
        // Already closed - idempotent no-op
      }
    }
  };

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  return [stream, sendEvent, closeStream];
}

// ---------------------------------------------------------------------------
// Helper: read all chunks from a stream
// ---------------------------------------------------------------------------

async function readStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSseStream", () => {
  it("returns a tuple of [stream, sendEvent, closeStream]", () => {
    const [stream, sendEvent, closeStream] = createSseStream();
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(typeof sendEvent).toBe("function");
    expect(typeof closeStream).toBe("function");
  });

  it("sendEvent enqueues correctly formatted SSE data", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    sendEvent("session", { sessionId: "abc123" });
    sendEvent("done", { allComplete: true });
    closeStream();

    const content = await readStream(stream);
    expect(content).toContain("event: session");
    expect(content).toContain('data: {"sessionId":"abc123"}');
    expect(content).toContain("event: done");
    expect(content).toContain('data: {"allComplete":true}');
  });

  it("closeStream closes the controller", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    sendEvent("test", { value: 1 });
    closeStream();

    // Should not throw - stream is properly closed
    const content = await readStream(stream);
    expect(content).toContain('data: {"value":1}');
  });

  it("sendEvent is a no-op before stream starts (controller undefined)", () => {
    const [, sendEvent, closeStream] = createSseStream();

    // This should not throw even though controller may not be initialized yet
    sendEvent("early", { value: 1 });

    // Clean up
    closeStream();
  });

  it("handles multiple events in sequence", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    for (let i = 0; i < 5; i++) {
      sendEvent("token", { index: i, content: `token ${i}` });
    }
    closeStream();

    const content = await readStream(stream);
    for (let i = 0; i < 5; i++) {
      expect(content).toContain(`"index":${i}`);
      expect(content).toContain(`"content":"token ${i}"`);
    }
  });

  it("handles complex nested data objects", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    const complexData = {
      index: 0,
      name: "photo.jpg",
      status: "completed",
      caption: "A sunset",
      reasoningContent: "I analyzed the image",
      metadata: {
        width: 1920,
        height: 1080,
        format: "jpeg",
      },
    };

    sendEvent("image_complete", complexData);
    closeStream();

    const content = await readStream(stream);
    expect(content).toContain('"index":0');
    expect(content).toContain('"name":"photo.jpg"');
    expect(content).toContain('"width":1920');
  });

  it("formats SSE with correct double-newline separators", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    sendEvent("event1", { a: 1 });
    sendEvent("event2", { b: 2 });
    closeStream();

    const content = await readStream(stream);
    // Each event should end with \n\n
    const parts = content.split("\n\n");
    expect(parts.length).toBe(3); // 2 events + empty string after last \n\n
  });

  it("closeStream is idempotent (no error on double close)", () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    sendEvent("test", { value: 1 });
    closeStream();
    closeStream(); // Should not throw

    // Clean up the stream
    stream.cancel();
  });

  it("handles string data values", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    sendEvent("text", "plain string");
    closeStream();

    const content = await readStream(stream);
    expect(content).toContain('data: "plain string"');
  });

  it("handles null data values", async () => {
    const [stream, sendEvent, closeStream] = createSseStream();

    sendEvent("null_event", null);
    closeStream();

    const content = await readStream(stream);
    expect(content).toContain("data: null");
  });
});
