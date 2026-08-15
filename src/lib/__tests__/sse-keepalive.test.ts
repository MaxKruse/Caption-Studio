/**
 * Tests for the SSE keepalive heartbeat in createSseStream().
 *
 * Long captioning streams can go silent for minutes (image prefill, phase
 * transitions) while no tokens are produced. Runtimes and proxies drop
 * idle connections (e.g. BUN_CONFIG_HTTP_IDLE_TIMEOUT=30), killing the
 * stream mid-batch. A periodic SSE comment line keeps the connection
 * alive without producing any event the client has to handle.
 */

import { describe, it, expect, spyOn } from "bun:test";
import { createSseStream } from "@/lib/sse";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSseStream keepalive", () => {
  it("emits an SSE comment when the stream is idle", async () => {
    const [stream, , closeStream] = createSseStream({ keepaliveMs: 25 });

    // No events sent - wait for a few keepalive cycles
    await sleep(90);
    closeStream();

    const content = await readStream(stream);
    expect(content).toContain(": keepalive");
  });

  it("keeps real events parseable alongside keepalive comments", async () => {
    const [stream, sendEvent, closeStream] = createSseStream({ keepaliveMs: 20 });

    await sleep(45);
    sendEvent("done", { allComplete: true });
    closeStream();

    const content = await readStream(stream);
    // Keepalive lines are comments (": ...") - never carry event: or data:
    for (const line of content.split("\n")) {
      if (line.startsWith(":")) {
        expect(line).toBe(": keepalive");
      }
    }
    expect(content).toContain("event: done");
    expect(content).toContain('data: {"allComplete":true}');
  });

  it("clears the keepalive interval on closeStream", async () => {
    const originalClearInterval = globalThis.clearInterval;
    const spy = spyOn(globalThis, "clearInterval");
    spy.mockImplementation(originalClearInterval);

    const [stream, , closeStream] = createSseStream({ keepaliveMs: 25 });
    closeStream();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    await stream.cancel();
  });

  it("does not run keepalive when disabled with keepaliveMs=0", async () => {
    const [stream, , closeStream] = createSseStream({ keepaliveMs: 0 });

    await sleep(80);
    closeStream();

    const content = await readStream(stream);
    expect(content).not.toContain(": keepalive");
  });
});
