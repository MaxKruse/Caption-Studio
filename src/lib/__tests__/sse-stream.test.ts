/**
 * Tests for SSE stream parsing logic.
 * Tests the streamResponse() pattern used across all caption route files.
 * Uses a mock ReadableStream to simulate API responses.
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Inline the current implementations for testing
// ---------------------------------------------------------------------------

/**
 * Stream an API response and emit SSE token events.
 * Returns the full caption and reasoning content on completion.
 * (Copied from krea-2/route.ts - identical logic in simple/ and multi-step/)
 */
async function streamResponse(
  response: Response,
  phase: string,
  index: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<{ caption: string; reasoningContent: string } | null> {
  let caption = "";
  let reasoningContent = "";
  const body = response.body;
  if (!body) throw new Error("No response body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  while (true) {
    if (abortSignal.aborted) {
      reader.cancel();
      return null;
    }

    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (abortSignal.aborted) {
        reader.cancel();
        return null;
      }

      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") continue;

      try {
        const chunk = JSON.parse(dataStr);
        const delta = chunk?.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          sendEvent("token", {
            type: "reasoning",
            phase,
            index,
            content: delta.reasoning_content,
            full: reasoningContent,
          });
        }
        if (delta?.content) {
          caption += delta.content;
          sendEvent("token", {
            type: "caption",
            phase,
            index,
            content: delta.content,
            full: caption,
          });
        }
      } catch {
        // skip malformed
      }
    }
  }

  return { caption: caption.trim(), reasoningContent: reasoningContent.trim() };
}

// ---------------------------------------------------------------------------
// Helper: build a mock Response with SSE data
// ---------------------------------------------------------------------------

function buildSseResponse(chunks: Array<{ reasoning_content?: string; content?: string }>): Response {
  const encoder = new TextEncoder();
  const lines: string[] = [];

  for (const chunk of chunks) {
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: chunk }] })}`);
  }
  lines.push("data: [DONE]");
  lines.push(""); // trailing newline

  const data = encoder.encode(lines.join("\n"));

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  return new Response(stream);
}

function buildSseResponseInChunks(chunks: Array<{ reasoning_content?: string; content?: string }>, splitEvery: number = 1): Response {
  const encoder = new TextEncoder();
  const allLines: string[] = [];

  for (const chunk of chunks) {
    allLines.push(`data: ${JSON.stringify({ choices: [{ delta: chunk }] })}`);
  }
  allLines.push("data: [DONE]");
  allLines.push("");

  const fullText = allLines.join("\n");
  const fullData = encoder.encode(fullText);

  // Split into multiple chunks
  const byteChunks: Uint8Array[] = [];
  for (let i = 0; i < fullData.length; i += splitEvery) {
    byteChunks.push(fullData.slice(i, i + splitEvery));
  }

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of byteChunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("streamResponse", () => {
  it("accumulates delta.content tokens correctly", async () => {
    const events: unknown[] = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const response = buildSseResponse([
      { content: "A " },
      { content: "beautiful " },
      { content: "sunset." },
    ]);

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("A beautiful sunset.");
    expect(result!.reasoningContent).toBe("");
    expect(events.length).toBe(3);
  });

  it("accumulates delta.reasoning_content tokens correctly", async () => {
    const events: unknown[] = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const response = buildSseResponse([
      { reasoning_content: "Let me " },
      { reasoning_content: "think " },
      { reasoning_content: "about this." },
    ]);

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("");
    expect(result!.reasoningContent).toBe("Let me think about this.");
    expect(events.length).toBe(3);
  });

  it("handles mixed reasoning_content and content in same stream", async () => {
    const events: unknown[] = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const response = buildSseResponse([
      { reasoning_content: "Analyzing... " },
      { reasoning_content: "I see a " },
      { content: "cat " },
      { content: "on a " },
      { reasoning_content: "definitely a cat. " },
      { content: "mat." },
    ]);

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("cat on a mat.");
    expect(result!.reasoningContent).toBe("Analyzing... I see a definitely a cat.");
    expect(events.length).toBe(6);
  });

  it("handles [DONE] sentinel correctly", async () => {
    const events: unknown[] = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const response = buildSseResponse([
      { content: "Hello." },
    ]);

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("Hello.");
    // [DONE] should not produce an event
    const doneEvents = events.filter((e) => JSON.stringify(e).includes("[DONE]"));
    expect(doneEvents.length).toBe(0);
  });

  it("skips malformed JSON lines", async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      [
        "data: {\"choices\":[{\"delta\":{\"content\":\"Valid\"}}]}",
        "data: this is not valid json",
        "data: {\"choices\":[{\"delta\":{\"content\":\" Also valid\"}}]}",
        "data: [DONE]",
        "",
      ].join("\n")
    );

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const response = new Response(stream);
    const events: unknown[] = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("Valid Also valid");
  });

  it("returns null on abort signal", async () => {
    const abortController = new AbortController();
    abortController.abort(); // abort before starting

    const response = buildSseResponse([
      { content: "This should not be processed." },
    ]);

    const result = await streamResponse(response, "captioning", 0, () => {}, abortController.signal);
    expect(result).toBeNull();
  });

  it("returns trimmed caption and reasoningContent", async () => {
    const response = buildSseResponse([
      { reasoning_content: "  thinking  " },
      { content: "  caption text  " },
    ]);

    const result = await streamResponse(response, "captioning", 0, () => {}, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("caption text");
    expect(result!.reasoningContent).toBe("thinking");
  });

  it("handles data split across multiple read() calls", async () => {
    // Split at byte level to test buffer handling
    const response = buildSseResponseInChunks(
      [
        { content: "Split " },
        { content: "across " },
        { content: "chunks." },
      ],
      10 // split every 10 bytes
    );

    const result = await streamResponse(response, "captioning", 0, () => {}, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("Split across chunks.");
  });

  it("emits correct phase and index in events", async () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const response = buildSseResponse([
      { content: "Test" },
    ]);

    await streamResponse(response, "refining", 3, sendEvent, new AbortController().signal);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("token");
    expect((events[0].data as any).phase).toBe("refining");
    expect((events[0].data as any).index).toBe(3);
  });

  it("handles empty stream (no content chunks)", async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode("data: [DONE]\n\n");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const response = new Response(stream);
    const events: unknown[] = [];
    const sendEvent = (type: string, data: unknown) => events.push({ type, data });

    const result = await streamResponse(response, "captioning", 0, sendEvent, new AbortController().signal);

    expect(result).not.toBeNull();
    expect(result!.caption).toBe("");
    expect(result!.reasoningContent).toBe("");
    expect(events.length).toBe(0);
  });
});
