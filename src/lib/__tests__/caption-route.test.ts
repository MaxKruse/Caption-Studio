/**
 * Tests for the shared caption route preamble and abort handler.
 *
 * parseCaptionRequest() is the multipart + JSON config + Zod + image
 * extraction block that the caption and detection routes share.
 * handleSessionAbort() is the DELETE handler both caption routes used
 * to duplicate.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { z } from "zod";
import { parseCaptionRequest, handleSessionAbort } from "@/lib/caption-route";
import { registerSession, clearAll } from "@/lib/session-registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const testSchema = z.object({
  serverUrl: z.string().url(),
  model: z.string().min(1),
  extra: z.string().optional().default(""),
});

function makeRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/api/caption/test", {
    method: "POST",
    body: formData,
  });
}

function makeJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/caption/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  formData.append("config", JSON.stringify({ serverUrl: "http://localhost:8080", model: "m" }));
  formData.append("images", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) formData.set(key, value);
  }
  return formData;
}

// ---------------------------------------------------------------------------
// parseCaptionRequest tests
// ---------------------------------------------------------------------------

describe("parseCaptionRequest", () => {
  it("rejects non-multipart bodies", async () => {
    const result = await parseCaptionRequest(makeJsonRequest({}), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect((await result.response.json()).error).toContain("multipart");
    }
  });

  it("rejects a missing config field", async () => {
    const formData = new FormData();
    formData.append("images", new File([new Uint8Array([1])], "a.jpg"));
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect((await result.response.json()).error).toBe("Missing config");
    }
  });

  it("rejects invalid config JSON", async () => {
    const formData = validFormData({ config: "{not json" });
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((await result.response.json()).error).toBe("Invalid config JSON");
    }
  });

  it("rejects schema violations with flattened details", async () => {
    const formData = validFormData({ config: JSON.stringify({ serverUrl: "http://localhost:8080" }) });
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = (await result.response.json()) as { error: string; details: unknown };
      expect(body.error).toBe("Invalid config");
      expect(JSON.stringify(body.details)).toContain("model");
    }
  });

  it("rejects a request without images", async () => {
    const formData = new FormData();
    formData.append("config", JSON.stringify({ serverUrl: "http://localhost:8080", model: "m" }));
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((await result.response.json()).error).toBe("No images provided");
    }
  });

  it("returns config, files, and names for a valid request", async () => {
    const formData = validFormData();
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.model).toBe("m");
      expect(result.config.extra).toBe("");
      expect(result.imageFiles.length).toBe(1);
      expect(result.imageNames).toEqual(["a.jpg"]);
    }
  });

  it("uses client-provided imageNames when present", async () => {
    const formData = validFormData({ imageNames: JSON.stringify(["custom.jpg"]) });
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imageNames).toEqual(["custom.jpg"]);
    }
  });

  it("rejects malformed imageNames JSON with a 400", async () => {
    const formData = validFormData({ imageNames: "{broken" });
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect((await result.response.json()).error).toBe("Invalid imageNames JSON");
    }
  });

  it("rejects non-array imageNames with a 400", async () => {
    const formData = validFormData({ imageNames: JSON.stringify({ a: 1 }) });
    const result = await parseCaptionRequest(makeRequest(formData), testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((await result.response.json()).error).toBe("Invalid imageNames JSON");
    }
  });

  it("extracts extra file fields when requested", async () => {
    const formData = validFormData();
    formData.append("captions", new File(["1girl, solo"], "a.txt", { type: "text/plain" }));
    formData.append("captions", new File(["2boys"], "b.txt", { type: "text/plain" }));

    const result = await parseCaptionRequest(makeRequest(formData), testSchema, ["captions"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extraFiles.captions.length).toBe(2);
      expect(result.extraFiles.captions[0].name).toBe("a.txt");
    }
  });

  it("returns empty extra file arrays for absent fields", async () => {
    const result = await parseCaptionRequest(
      makeRequest(validFormData()),
      testSchema,
      ["captions"]
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extraFiles.captions).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// handleSessionAbort tests
// ---------------------------------------------------------------------------

describe("handleSessionAbort", () => {
  beforeEach(() => clearAll());
  afterEach(() => clearAll());

  function abortRequest(sessionId: string | null): NextRequest {
    const url = sessionId
      ? `http://localhost/api/caption/test?sessionId=${sessionId}`
      : "http://localhost/api/caption/test";
    return new NextRequest(url, { method: "DELETE" });
  }

  it("returns 400 when sessionId is missing", () => {
    const response = handleSessionAbort(abortRequest(null));
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown session", () => {
    const response = handleSessionAbort(abortRequest("nope"));
    expect(response.status).toBe(404);
  });

  it("aborts a known session and returns ok", async () => {
    const controller = new AbortController();
    registerSession("s1", controller);

    const response = handleSessionAbort(abortRequest("s1"));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });
});
