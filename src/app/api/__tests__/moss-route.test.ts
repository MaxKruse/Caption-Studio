/**
 * Integration test for the MOSS-Image caption route.
 *
 * Stubs the llama.cpp server with a non-streaming chat completion
 * returning the MOSS-Image JSON caption format (long/medium/short +
 * watermark boxes + borders), and exercises the full POST flow:
 * config validation, guide request format, reference substitution,
 * caption normalization, disk artifact, and abort.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/caption/moss/route";
import {
  collectSseEvents,
  readFirstEvent,
  findEvent,
  makeTinyJpeg,
  makeChatJsonResponse,
} from "@/lib/__tests__/test-helpers";
import { readCaption } from "@/lib/temp-files";

// ---------------------------------------------------------------------------
// Stub server
// ---------------------------------------------------------------------------

const VALID_MOSS_CAPTION = {
  caption: {
    long: "A portrait of a silver-haired woman in a red dress on a neon-lit street at night. The upper left reads 'NEON DREAMS' in bold white capitals.",
    medium: "A woman in a red dress on a neon-lit street at night.",
    short: "A woman in a red dress on a city street at night.",
  },
  watermark: [{ box_2d: [50, 60, 120, 400], label: "artist.dev" }],
  borders: ["none"],
};

const realFetch = globalThis.fetch;
let chatCalls: Array<Record<string, unknown>> = [];
let modelResponse: Record<string, unknown> = {
  id: "test-model",
  input_modalities: ["text", "image"],
  status: { args: ["--parallel", "4"] },
};
let chatFactory: () => Response = () => makeChatJsonResponse(VALID_MOSS_CAPTION);
// Held (unresolved) in the abort test so the in-flight chat call is
// guaranteed pending when DELETE lands - no wall-clock guessing.
let chatGate: Promise<void> = Promise.resolve();

beforeAll(() => {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/v1/chat/completions")) {
      chatCalls.push(JSON.parse(init?.body as string) as Record<string, unknown>);
      await chatGate;
      return chatFactory();
    }
    if (url.includes("/v1/models")) {
      return Response.json({ data: [modelResponse] });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postMoss(
  config: Record<string, unknown>,
  opts: { reference?: string; factory?: () => Response } = {}
): Promise<Response> {
  chatCalls = [];
  chatFactory = opts.factory ?? (() => makeChatJsonResponse(VALID_MOSS_CAPTION));
  const jpeg = await makeTinyJpeg();
  const formData = new FormData();
  formData.append("config", JSON.stringify(config));
  formData.append(
    "images",
    new File([new Uint8Array(jpeg)], "img1.jpg", { type: "image/jpeg" })
  );
  if (opts.reference !== undefined) {
    formData.append(
      "captions",
      new File([opts.reference], "img1.txt", { type: "text/plain" })
    );
  }
  return await POST(
    new NextRequest("http://localhost/api/caption/moss", { method: "POST", body: formData })
  );
}

function contentParts(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const messages = body.messages as Array<Record<string, unknown>>;
  return messages[0].content as Array<Record<string, unknown>>;
}

function sessionIdOf(event: { data: unknown }): string {
  if (typeof event.data !== "object" || event.data === null || !("sessionId" in event.data)) {
    throw new Error("session event without sessionId");
  }
  return String(event.data.sessionId);
}

function imagePartUrl(part: Record<string, unknown>): string {
  const image = part.image_url;
  if (typeof image !== "object" || image === null || !("url" in image)) {
    throw new Error("image part without url");
  }
  return String(image.url);
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe("moss route - config validation", () => {
  it("rejects a config without model with 400", async () => {
    const response = await postMoss({ serverUrl: "http://localhost:8080" });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid serverUrl with 400", async () => {
    const response = await postMoss({ serverUrl: "not a url", model: "test-model" });
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Guide request format
// ---------------------------------------------------------------------------

describe("moss route - guide request format", () => {
  it("sends the MOSS-Image guide body plus slot pinning", async () => {
    const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
    expect(response.status).toBe(200);
    const events = await collectSseEvents(response);
    expect(events[0]?.type).toBe("session");

    expect(chatCalls.length).toBe(1);
    const body = chatCalls[0];
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(false);
    expect(body.n).toBe(1);
    expect(body.max_tokens).toBe(16384);
    expect(body.temperature).toBe(1);
    expect(body.top_p).toBe(0.95);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(body.id_slot).toBe(0);
    expect(body.cache_prompt).toBe(true);
    expect(body.n_cache_reuse).toBe(256);
  });

  it("sends a single user message with the text part before the image part", async () => {
    const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
    const events = await collectSseEvents(response);
    expect(findEvent(events, "done")).toBeDefined();

    const body = chatCalls[0];
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");
    const content = contentParts(body);
    expect(content.length).toBe(2);
    expect(content[0].type).toBe("text");
    expect(String(content[0].text)).toContain("You are an image recaptioner.");
    expect(content[1].type).toBe("image_url");
    expect(imagePartUrl(content[1])).toContain("data:image/jpeg;base64,");
  });

  it("uses (none) as the reference when no caption file is provided", async () => {
    const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
    await collectSseEvents(response);

    const text = String(contentParts(chatCalls[0])[0].text);
    expect(text).not.toContain("{{reference}}");
    expect(text.trim().endsWith("(none)")).toBe(true);
  });

  it("substitutes the paired caption file as the reference", async () => {
    const response = await postMoss(
      { serverUrl: "http://localhost:8080", model: "test-model" },
      { reference: "  1girl, silver hair, neon street  " }
    );
    await collectSseEvents(response);

    const text = String(contentParts(chatCalls[0])[0].text);
    expect(text).toContain("1girl, silver hair, neon street");
    expect(text).not.toContain("(none)");
  });

  it("honors enableThinking: false", async () => {
    const response = await postMoss({
      serverUrl: "http://localhost:8080",
      model: "test-model",
      enableThinking: false,
    });
    await collectSseEvents(response);

    expect(chatCalls[0].chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("honors a maxTokens override", async () => {
    const response = await postMoss({
      serverUrl: "http://localhost:8080",
      model: "test-model",
      maxTokens: 8192,
    });
    await collectSseEvents(response);

    expect(chatCalls[0].max_tokens).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

describe("moss route - completion", () => {
  it("emits image_complete with the normalized JSON caption and KV stats", async () => {
    const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
    const events = await collectSseEvents(response);

    const complete = findEvent(events, "image_complete");
    expect(complete?.status).toBe("completed");
    expect(String(complete?.caption)).toBe(JSON.stringify(VALID_MOSS_CAPTION, null, 2));
    expect(complete?.cachedTokens).toBe(750);
    expect(complete?.promptTokens).toBe(1000);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("writes the normalized JSON caption to the session caption file", async () => {
    const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
    const events = await collectSseEvents(response);

    const first = events[0];
    expect(first?.type).toBe("session");
    const sessionId = sessionIdOf(first!);
    const complete = findEvent(events, "image_complete");

    const onDisk = await readCaption(sessionId, "img1.jpg");
    expect(onDisk).toBe(String(complete?.caption));
    expect(onDisk).toBe(JSON.stringify(VALID_MOSS_CAPTION, null, 2));
  });

  it("saves non-conforming output as trimmed raw text", async () => {
    const response = await postMoss(
      { serverUrl: "http://localhost:8080", model: "test-model" },
      { factory: () => makeChatJsonResponse("  sorry, I cannot produce JSON  ") }
    );
    const events = await collectSseEvents(response);

    const complete = findEvent(events, "image_complete");
    expect(complete?.status).toBe("completed");
    expect(String(complete?.caption)).toBe("sorry, I cannot produce JSON");
  });

  it("fails the image when the model returns an empty response", async () => {
    const response = await postMoss(
      { serverUrl: "http://localhost:8080", model: "test-model" },
      { factory: () => makeChatJsonResponse("") }
    );
    const events = await collectSseEvents(response);

    const complete = findEvent(events, "image_complete");
    expect(complete?.status).toBe("failed");
    expect(String(complete?.error)).toContain("empty");
  });

  it("falls back to concurrency 1 with a warning when --parallel is undetectable", async () => {
    modelResponse = { id: "test-model" }; // no status.args
    try {
      const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
      const events = await collectSseEvents(response);

      const warning = findEvent(events, "warning");
      expect(warning).toBeDefined();
      expect(String(warning?.message)).toContain("concurrency 1");
      expect(findEvent(events, "done")).toBeDefined();
    } finally {
      modelResponse = {
        id: "test-model",
        input_modalities: ["text", "image"],
        status: { args: ["--parallel", "4"] },
      };
    }
  });
});

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

describe("moss route - abort", () => {
  it("aborts the session on DELETE and ends the stream without done", async () => {
    const { promise: gate, resolve } = Promise.withResolvers<void>();
    chatGate = gate;
    try {
      const response = await postMoss({ serverUrl: "http://localhost:8080", model: "test-model" });
      const first = await readFirstEvent(response.body as ReadableStream<Uint8Array>);
      expect(first?.type).toBe("session");
      const sessionId = sessionIdOf(first!);

      const del = await DELETE(
        new NextRequest(`http://localhost/api/caption/moss?sessionId=${sessionId}`, {
          method: "DELETE",
        })
      );
      expect(del.status).toBe(200);
      const body = (await del.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);

      // Release the held chat call; the aborted route must still not emit done.
      resolve();
      const events = await collectSseEvents(response);
      expect(events.some((e) => e.type === "done")).toBe(false);
    } finally {
      chatGate = Promise.resolve();
    }
  });
});
