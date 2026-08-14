/**
 * Integration tests for the detection route.
 *
 * Real route handlers + stubbed llama.cpp server: job creation, slot
 * pinning of the (non-streaming) detection requests, and SSE progress.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/detect/route";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];

function makeDetectionResponse(): Response {
  return Response.json({
    choices: [
      {
        message: {
          content:
            '{"faces": [{"box_2d": [100, 100, 400, 400], "label": "face", "confidence": 0.9}], "bodies": []}',
        },
      },
    ],
  });
}

/** Poll the SSE job stream until the done flag appears (max ~5s). */
async function readJobEvents(jobId: string): Promise<Array<Record<string, unknown>>> {
  const response = await GET(
    new NextRequest(`http://localhost/api/detect?jobId=${jobId}`)
  );
  expect(response.status).toBe(200);

  const events: Array<Record<string, unknown>> = [];
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const match = block.match(/^data: ([\s\S]+)$/);
      if (match) {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        events.push(data);
        if (data.done) return events;
      }
    }
  }
  return events;
}

async function makeTinyJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 200, b: 30 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

beforeAll(() => {
  chatCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/v1/models")) {
      return new Response(
        JSON.stringify({ data: [{ id: "test-model", status: { args: ["--parallel", "4"] } }] }),
        { status: 200 }
      );
    }

    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(init?.body as string);
      chatCalls.push(body);
      return makeDetectionResponse();
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detect route - KV cache slot pinning", () => {
  it("creates a job and pins detection requests to worker slots", async () => {
    chatCalls = [];
    const jpeg = await makeTinyJpeg();

    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({ serverUrl: "http://localhost:8080", model: "test-model" })
    );
    formData.append("images", new File([new Uint8Array(jpeg)], "img.jpg", { type: "image/jpeg" }));

    const response = await POST(
      new NextRequest("http://localhost/api/detect", { method: "POST", body: formData })
    );
    expect(response.status).toBe(200);
    const { jobId } = (await response.json()) as { jobId: string };

    const events = await readJobEvents(jobId);
    expect(events.some((e) => e.done === true)).toBe(true);

    expect(chatCalls.length).toBe(1);
    expect(chatCalls[0].id_slot).toBe(0);
    expect(chatCalls[0].cache_prompt).toBe(true);
    expect(chatCalls[0].n_cache_reuse).toBe(256);
    expect(chatCalls[0].stream).toBe(false);
  });

  it("pins different workers to different slots for parallel images", async () => {
    chatCalls = [];
    const jpeg = await makeTinyJpeg();

    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({ serverUrl: "http://localhost:8080", model: "test-model" })
    );
    for (let i = 0; i < 4; i++) {
      formData.append(
        "images",
        new File([new Uint8Array(jpeg)], `img${i}.jpg`, { type: "image/jpeg" })
      );
    }

    const response = await POST(
      new NextRequest("http://localhost/api/detect", { method: "POST", body: formData })
    );
    const { jobId } = (await response.json()) as { jobId: string };
    await readJobEvents(jobId);

    expect(chatCalls.length).toBe(4);
    const slotIds = new Set(chatCalls.map((c) => c.id_slot));
    expect(slotIds.size).toBe(4);
    for (const slot of [0, 1, 2, 3]) {
      expect(slotIds.has(slot)).toBe(true);
    }
  });
});
