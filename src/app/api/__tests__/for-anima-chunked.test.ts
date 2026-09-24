/**
 * Integration tests for the for-anima route's chunked upload protocol.
 *
 * Large batches (700+ images) upload in chunks of ~25 so the SSE stream
 * opens and workers start after the first small chunk instead of after
 * the whole multi-GB body arrives. Chunk 0 opens the stream; subsequent
 * chunks POST to the same route and get a JSON ack.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/caption/for-anima/route";
import { deleteSession } from "@/lib/temp-files";
import {
  collectSseEvents,
  readFirstEvent,
  makeChatSseResponse,
  makeTinyJpeg,
  findEvent,
} from "@/lib/__tests__/test-helpers";

/** Fixed session ids double as temp dirs - remove them so re-runs don't collide. */
function cleanupSession(sessionId: string) {
  void deleteSession(sessionId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/v1/models")) {
      return new Response(
        JSON.stringify({ data: [{ id: "test-model", status: { args: ["--parallel", "2"] } }] }),
        { status: 200 }
      );
    }

    if (url.endsWith("/v1/chat/completions")) {
      chatCalls.push(JSON.parse(init?.body as string));
      return makeChatSseResponse("an addition");
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let jpeg: Buffer;

function chunkRequest(
  chunkIndex: number,
  names: string[],
  captionTexts: string[]
): Promise<Response> {
  const sessionId = "11111111-2222-4333-8444-555555555555";
  const formData = new FormData();
  formData.append(
    "config",
    JSON.stringify({
      serverUrl: "http://localhost:8080",
      model: "test-model",
      sessionId,
      expectedImageCount: 3,
      chunkIndex,
      chunkSize: 2,
    })
  );
  formData.append("imageNames", JSON.stringify(names));
  for (let i = 0; i < names.length; i++) {
    formData.append(
      "images",
      new File([new Uint8Array(jpeg)], names[i], { type: "image/jpeg" })
    );
    if (captionTexts[i]) {
      formData.append(
        "captions",
        new Blob([captionTexts[i]], { type: "text/plain" }),
        names[i].replace(/\.\w+$/, ".txt")
      );
    }
  }
  return POST(
    new NextRequest("http://localhost/api/caption/for-anima", {
      method: "POST",
      body: formData,
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("for-anima route - chunked upload", () => {
  it("chunk 0 opens the SSE stream; continuation chunks complete the session", async () => {
    chatCalls = [];
    jpeg = await makeTinyJpeg();

    // Chunk 0: images 0-1 -> SSE stream
    const start = await chunkRequest(0, ["a.jpg", "b.jpg"], ["1girl", "1boy"]);
    expect(start.status).toBe(200);

    const firstEvent = await readFirstEvent(start.body as ReadableStream<Uint8Array>);
    expect(firstEvent?.type).toBe("session");
    expect((firstEvent?.data as { sessionId: string }).sessionId).toBe(
      "11111111-2222-4333-8444-555555555555"
    );

    // Chunk 1: image 2 -> JSON ack
    const ack = await chunkRequest(1, ["c.jpg"], ["2girls"]);
    expect(ack.status).toBe(200);
    const ackBody = (await ack.json()) as { ok: boolean; accepted: number; rejected: number };
    expect(ackBody.ok).toBe(true);
    expect(ackBody.accepted).toBe(1);
    expect(ackBody.rejected).toBe(0);

    // The stream completes all three images with global indices 0-2
    const events = await collectSseEvents(start as Response);
    const starts = events.filter((e) => e.type === "image_start");
    expect(starts.map((e) => (e.data as { index: number }).index).sort()).toEqual([0, 1, 2]);
    const completes = events
      .filter((e) => e.type === "image_complete")
      .map((e) => e.data as { index: number; status: string; caption?: string });
    expect(completes.length).toBe(3);
    expect(completes.every((c) => c.status === "completed")).toBe(true);
    // Final caption = booru tags + LLM addition
    const captionC = completes.find((c) => c.index === 2)?.caption ?? "";
    expect(captionC).toContain("2girls");
    expect(captionC).toContain("an addition");
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(chatCalls.length).toBe(3);
    cleanupSession("11111111-2222-4333-8444-555555555555");
  });

  it("continuation for an unknown session returns 404", async () => {
    chatCalls = [];
    jpeg = await makeTinyJpeg();
    const response = await chunkRequest(1, ["x.jpg"], []);
    expect(response.status).toBe(404);
  });

  it("chunk 0 with only invalid images returns 400 and cleans up the session", async () => {
    chatCalls = [];
    jpeg = await makeTinyJpeg();
    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({
        serverUrl: "http://localhost:8080",
        model: "test-model",
        sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        expectedImageCount: 1,
        chunkIndex: 0,
        chunkSize: 2,
      })
    );
    formData.append("imageNames", JSON.stringify(["not-an-image.jpg"]));
    formData.append(
      "images",
      new File([new TextEncoder().encode("definitely not an image")], "not-an-image.jpg")
    );
    const response = await POST(
      new NextRequest("http://localhost/api/caption/for-anima", {
        method: "POST",
        body: formData,
      })
    );
    expect(response.status).toBe(400);
  });

  it("late continuation after the session finished returns 404", async () => {
    chatCalls = [];
    jpeg = await makeTinyJpeg();

    // Complete session: expected 2, both in chunk 0 (chunkSize 2)
    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({
        serverUrl: "http://localhost:8080",
        model: "test-model",
        sessionId: "99999999-8888-4777-8666-555555555555",
        expectedImageCount: 2,
        chunkIndex: 0,
        chunkSize: 2,
      })
    );
    formData.append("imageNames", JSON.stringify(["a.jpg", "b.jpg"]));
    formData.append("images", new File([new Uint8Array(jpeg)], "a.jpg", { type: "image/jpeg" }));
    formData.append("images", new File([new Uint8Array(jpeg)], "b.jpg", { type: "image/jpeg" }));
    const start = await POST(
      new NextRequest("http://localhost/api/caption/for-anima", {
        method: "POST",
        body: formData,
      })
    );
    expect(start.status).toBe(200);
    await collectSseEvents(start as Response); // let the session finish + un-register
    cleanupSession("99999999-8888-4777-8666-555555555555");

    // A chunk "beyond" the expected count can no longer find the session
    const late = await chunkRequest(1, ["c.jpg"], []);
    expect(late.status).toBe(404);
  });

  it("single-shot requests keep working without chunk fields", async () => {
    chatCalls = [];
    jpeg = await makeTinyJpeg();
    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({ serverUrl: "http://localhost:8080", model: "test-model" })
    );
    formData.append("images", new File([new Uint8Array(jpeg)], "solo.jpg", { type: "image/jpeg" }));
    const response = await POST(
      new NextRequest("http://localhost/api/caption/for-anima", {
        method: "POST",
        body: formData,
      })
    );
    expect(response.status).toBe(200);
    const events = await collectSseEvents(response as Response);
    expect(findEvent(events, "image_complete")?.status).toBe("completed");
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("a rejected image in a continuation chunk reports its reason and the stream still ends with done", async () => {
    chatCalls = [];
    jpeg = await makeTinyJpeg();
    const sessionId = "33333333-4444-4555-8666-777777777777";

    const makeChunk = (chunkIndex: number, names: string[], files: File[]) => {
      const formData = new FormData();
      formData.append(
        "config",
        JSON.stringify({
          serverUrl: "http://localhost:8080",
          model: "test-model",
          sessionId,
          expectedImageCount: 4,
          chunkIndex,
          chunkSize: 2,
        })
      );
      formData.append("imageNames", JSON.stringify(names));
      files.forEach((f) => formData.append("images", f));
      names.forEach((n) =>
        formData.append(
          "captions",
          new Blob(["1girl"], { type: "text/plain" }),
          n.replace(/\.\w+$/, ".txt")
        )
      );
      return POST(
        new NextRequest("http://localhost/api/caption/for-anima", {
          method: "POST",
          body: formData,
        })
      );
    };

    // Chunk 0: two valid images (global 0-1) -> SSE stream
    const start = await makeChunk(
      0,
      ["a.jpg", "b.jpg"],
      [
        new File([new Uint8Array(jpeg)], "a.jpg", { type: "image/jpeg" }),
        new File([new Uint8Array(jpeg)], "b.jpg", { type: "image/jpeg" }),
      ]
    );
    expect(start.status).toBe(200);

    // Chunk 1: one valid (global 2) + one invalid (global 3). Without
    // rejection accounting the stream would idle-timeout with a false
    // "Upload incomplete" error.
    const ack = await makeChunk(
      1,
      ["c.jpg", "bad.jpg"],
      [
        new File([new Uint8Array(jpeg)], "c.jpg", { type: "image/jpeg" }),
        new File([new TextEncoder().encode("definitely not an image")], "bad.jpg"),
      ]
    );
    expect(ack.status).toBe(200);
    const ackBody = (await ack.json()) as { ok: boolean; accepted: number; rejected: number };
    expect(ackBody).toEqual({ ok: true, accepted: 1, rejected: 1 });

    const events = await collectSseEvents(start as Response);

    // Rejected image: per-image failed event carrying the real reason
    const failed = events
      .filter((e) => e.type === "image_complete")
      .map((e) => e.data as { index: number; name: string; status: string; error?: string })
      .filter((d) => d.status === "failed");
    expect(failed).toEqual([
      expect.objectContaining({
        index: 3,
        name: "bad.jpg",
        error: expect.stringContaining("unsupported image format"),
      }),
    ]);

    // A warning summarizing the rejection(s)
    expect(events.some((e) => e.type === "warning")).toBe(true);

    // Valid images completed with global indices 0-2
    const completed = events
      .filter((e) => e.type === "image_complete")
      .map((e) => e.data as { index: number; status: string })
      .filter((d) => d.status === "completed")
      .map((d) => d.index)
      .sort();
    expect(completed).toEqual([0, 1, 2]);

    // Clean completion: no idle-timeout error
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(chatCalls.length).toBe(3);
    cleanupSession(sessionId);
  });
});
