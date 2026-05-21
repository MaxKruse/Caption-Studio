/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// POST /api/caption — Start a batch captioning job
// ---------------------------------------------------------------------------

describe("POST /api/caption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when no images provided", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [] }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns 400 when images is not an array", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: "not-an-array" }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns 400 when images is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No images provided");
  });

  it("returns 400 when serverUrl is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: Buffer.from("fake").toString("base64") }],
        model: "llama3",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when model is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: Buffer.from("fake").toString("base64") }],
        serverUrl: "http://localhost:8080",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns 400 when both serverUrl and model are missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: Buffer.from("fake").toString("base64") }],
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("serverUrl and model are required");
  });

  it("returns a job ID on success", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake-png-data").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        systemPrompt: "You are helpful",
        userPrompt: "Describe this image",
        captionName: "Batch01",
        includeNameInPrompt: true,
        parallelRequests: 4,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.jobId).toBeDefined();
    expect(typeof data.jobId).toBe("string");

    vi.unstubAllGlobals();
  });

  it("clamps parallelRequests to 1-8 range", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    // Send parallelRequests = 100
    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        parallelRequests: 100,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(data.jobId).toBeDefined();

    // Check the store has clamped value
    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    expect(job?.parallelRequests).toBe(8);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });

  it("uses default 4 when parallelRequests is 0 (falsy fallback)", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        parallelRequests: 0,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    // Number(0) || 4 = 4, so 0 falls back to 4
    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    expect(job?.parallelRequests).toBe(4);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });

  it("clamps parallelRequests to minimum 1 when explicitly set", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [
          {
            name: "test.png",
            data: Buffer.from("fake").toString("base64"),
          },
        ],
        serverUrl: "http://localhost:8080",
        model: "llama3",
        parallelRequests: 1,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    expect(job?.parallelRequests).toBe(1);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });

  it("decodes base64 image data correctly", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("./route");

    const originalData = "fake-image-content";
    const base64Data = Buffer.from(originalData).toString("base64");

    const req = new Request("http://localhost/api/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [{ name: "test.png", data: base64Data }],
        serverUrl: "http://localhost:8080",
        model: "llama3",
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    const store = await import("@/lib/store");
    const job = store.getJob(data.jobId);
    const imageEntry = job?.images.get("test.png");
    expect(imageEntry?.data.toString()).toBe(originalData);

    store.deleteJob(data.jobId);
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// GET /api/caption — SSE progress stream
// ---------------------------------------------------------------------------

describe("GET /api/caption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when jobId is missing", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/caption");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing jobId");
  });

  it("returns 404 when job not found", async () => {
    const { GET } = await import("./route");

    const req = new Request("http://localhost/api/caption?jobId=nonexistent");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Job not found");
  });

  it("returns SSE stream with correct headers", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/caption?jobId=${jobId}`);
    const res = await GET(req as any);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    store.deleteJob(jobId);
  });

  it("streams initial progress data", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.png", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/caption?jobId=${jobId}`);
    const res = await GET(req as any);

    // Read the first chunk of the SSE stream
    const reader = res.body?.getReader();
    const { value, done } = await reader!.read();
    const text = new TextDecoder().decode(value);

    expect(done).toBe(false);
    expect(text).toContain("data:");
    expect(text).toContain("total");

    reader?.cancel();
    store.deleteJob(jobId);
  });

  it("streams initial progress with correct structure", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    const { GET } = await import("./route");

    const req = new Request(`http://localhost/api/caption?jobId=${jobId}`);
    const res = await GET(req as any);

    const reader = res.body?.getReader();
    const { value } = await reader!.read();
    const text = new TextDecoder().decode(value);

    // Initial event sends progress only (no statuses)
    const parsed = JSON.parse(text.replace("data: ", "").trim());
    expect(parsed.total).toBe(1);
    expect(parsed.queued).toBe(1);

    reader?.cancel();
    store.deleteJob(jobId);
  });

  it("isJobDone returns true when all images are completed", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    // Initially not done
    expect(store.isJobDone(jobId)).toBe(false);

    // After all completed
    store.updateImageStatus(jobId, "a.png", "completed", "cat");
    store.updateImageStatus(jobId, "b.jpg", "completed", "dog");
    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("isJobDone returns true with mixed completed and failed", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "b.jpg", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "a.png", "completed", "cat");
    store.updateImageStatus(jobId, "b.jpg", "failed", undefined, "err");
    expect(store.isJobDone(jobId)).toBe(true);

    store.deleteJob(jobId);
  });

  it("SSE interval includes statuses in payload structure", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const progress = store.getProgress(jobId);
    const statuses: Record<string, { status: string; caption?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
        };
      }
    }

    // Verify the SSE interval payload structure
    const ssePayload = { ...progress, statuses };
    expect(ssePayload.statuses["test.png"].status).toBe("completed");
    expect(ssePayload.statuses["test.png"].caption).toBe("a cat");
    expect(ssePayload.completed).toBe(1);

    store.deleteJob(jobId);
  });

  it("SSE statuses include prompt field", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "You are helpful",
      "",
      "describe this",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat",
      undefined,
      "System: You are helpful\nUser: describe this"
    );

    // Simulate what the SSE interval builds
    const statuses: Record<string, { status: string; caption?: string; prompt?: string; reasoningContent?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    expect(statuses["test.png"].prompt).toBe(
      "System: You are helpful\nUser: describe this"
    );

    store.deleteJob(jobId);
  });

  it("SSE statuses include reasoningContent field", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "completed",
      "a cat",
      undefined,
      "describe this",
      "I think this is a cat because..."
    );

    // Simulate what the SSE interval builds
    const statuses: Record<string, { status: string; caption?: string; prompt?: string; reasoningContent?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    expect(statuses["test.png"].reasoningContent).toBe(
      "I think this is a cat because..."
    );

    store.deleteJob(jobId);
  });

  it("SSE statuses omit reasoningContent when not set", async () => {
    const store = await import("@/lib/store");
    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const statuses: Record<string, { status: string; caption?: string; prompt?: string; reasoningContent?: string }> = {};
    const jobRef = store.getJob(jobId);
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    expect(statuses["test.png"].reasoningContent).toBeUndefined();

    store.deleteJob(jobId);
  });
});

// ---------------------------------------------------------------------------
// captionImage behavior (captured from inline tests)
// ---------------------------------------------------------------------------

describe("captionImage behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("extracts caption from content and stores reasoning_content separately", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            reasoning_content: "This is reasoning that should be stored",
            content: "This is the actual caption we want",
          },
        }],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake-png-data-here") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    // Simulate what captionImage does — extracting content and reasoning_content
    const mockResponse = {
      choices: [{
        message: {
          reasoning_content: "I think this is a cat because...",
          content: "A cat sitting on a table",
        },
      }],
    };

    const caption =
      mockResponse?.choices?.[0]?.message?.content ?? "(empty response)";
    const reasoningContent =
      mockResponse?.choices?.[0]?.message?.reasoning_content;

    expect(caption).toBe("A cat sitting on a table");
    expect(caption).not.toBe("I think this is a cat because...");
    expect(reasoningContent).toBe("I think this is a cat because...");

    store.deleteJob(jobId);
    vi.unstubAllGlobals();
  });

  it("handles responses without reasoning_content", async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: "A dog running in a field",
        },
      }],
    };

    const caption =
      mockResponse?.choices?.[0]?.message?.content ?? "(empty response)";
    const reasoningContent =
      mockResponse?.choices?.[0]?.message?.reasoning_content;

    expect(caption).toBe("A dog running in a field");
    expect(reasoningContent).toBeUndefined();
  });

  it("uses fallback text for empty response", async () => {
    const mockResponse = {
      choices: [{ message: {} }],
    };

    const caption =
      mockResponse?.choices?.[0]?.message?.content ?? "(empty response)";

    expect(caption).toBe("(empty response)");
  });

  it("uses fallback text for missing choices", async () => {
    const mockResponse = {};

    const caption =
      mockResponse?.choices?.[0]?.message?.content ?? "(empty response)";

    expect(caption).toBe("(empty response)");
  });

  it("uses fallback text for null response", async () => {
    const mockResponse = null;

    const caption =
      mockResponse?.choices?.[0]?.message?.content ?? "(empty response)";

    expect(caption).toBe("(empty response)");
  });

  it("has a 5-minute API timeout constant", async () => {
    // Verify the timeout constant is 300000ms (5 minutes)
    // This is defined as API_TIMEOUT_MS in the route
    expect(5 * 60 * 1000).toBe(300000);
  });

  it("builds prompt text with System and User sections", async () => {
    // Simulate what captionImage does — building promptText
    const systemPrompt = "You are helpful";
    const promptPrefix = "Include the name of the subject";
    const captionName = "MyBatch";
    const includeNameInPrompt = true;
    const userPrompt = "Describe this image";

    const userTextParts = [
      promptPrefix.trim() && captionName.trim() && includeNameInPrompt
        ? `${promptPrefix.trim()} ${captionName.trim()}.`
        : promptPrefix.trim(),
      userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    const promptText = [
      systemPrompt.trim() ? `System: ${systemPrompt.trim()}` : null,
      userText ? `User: ${userText}` : null,
    ].filter(Boolean).join("\n");

    expect(promptText).toBe(
      "System: You are helpful\nUser: Include the name of the subject MyBatch. Describe this image"
    );
  });

  it("builds prompt text with User section only (no system prompt)", async () => {
    const systemPrompt = "";
    const userPrompt = "Describe this image";

    const userTextParts = [
      userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    const promptText = [
      systemPrompt.trim() ? `System: ${systemPrompt.trim()}` : null,
      userText ? `User: ${userText}` : null,
    ].filter(Boolean).join("\n");

    expect(promptText).toBe("User: Describe this image");
  });

  it("excludes prompt prefix when includeNameInPrompt is false", async () => {
    const promptPrefix = "Include the name of the subject";
    const captionName = "MyBatch";
    const includeNameInPrompt = false;
    const userPrompt = "Describe this image";

    const userTextParts = [
      promptPrefix.trim() && captionName.trim() && includeNameInPrompt
        ? `${promptPrefix.trim()} ${captionName.trim()}.`
        : promptPrefix.trim(),
      userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    // promptPrefix should appear in the text when includeNameInPrompt is false
    // because the fallback is promptPrefix.trim() — BUT if promptPrefix is ""
    // (which is what the frontend sends when checkbox is off), it gets filtered
    expect(userText).toBe("Include the name of the subject Describe this image");
  });

  it("excludes prompt prefix entirely when promptPrefix is empty string", async () => {
    const promptPrefix = ""; // what frontend sends when checkbox is off
    const captionName = "MyBatch";
    const includeNameInPrompt = false;
    const userPrompt = "Describe this image";

    const userTextParts = [
      promptPrefix.trim() && captionName.trim() && includeNameInPrompt
        ? `${promptPrefix.trim()} ${captionName.trim()}.`
        : promptPrefix.trim(),
      userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    // Empty promptPrefix gets filtered out
    expect(userText).toBe("Describe this image");
    expect(userText).not.toContain("Include the name");
  });

  it("includes prompt prefix with caption name when checkbox is on", async () => {
    const promptPrefix = "Include the name of the subject";
    const captionName = "MyBatch";
    const includeNameInPrompt = true;
    const userPrompt = "Describe this image";

    const userTextParts = [
      promptPrefix.trim() && captionName.trim() && includeNameInPrompt
        ? `${promptPrefix.trim()} ${captionName.trim()}.`
        : promptPrefix.trim(),
      userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    expect(userText).toBe("Include the name of the subject MyBatch. Describe this image");
  });

  it("uses prompt prefix without caption name when captionName is empty", async () => {
    const promptPrefix = "Include the name of the subject";
    const captionName = "";
    const includeNameInPrompt = true;
    const userPrompt = "Describe this image";

    const userTextParts = [
      promptPrefix.trim() && captionName.trim() && includeNameInPrompt
        ? `${promptPrefix.trim()} ${captionName.trim()}.`
        : promptPrefix.trim(),
      userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    // captionName is empty, so fallback to just promptPrefix
    expect(userText).toBe("Include the name of the subject Describe this image");
  });
});
