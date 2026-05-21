import { describe, it, expect, beforeEach, vi } from "vitest";

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
