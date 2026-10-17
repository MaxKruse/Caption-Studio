/**
 * Tests for the MOSS-Image caption prompt builder and output parser.
 *
 * The prompt is the exact recaptioning prompt from the MOSS-Image user
 * guide (post-training section): it asks the VLM for a JSON object with
 * long/medium/short captions, watermark boxes, and borders. The parser
 * normalizes the model output (markdown fences, surrounding prose) and
 * validates the structure.
 */

import { describe, it, expect } from "bun:test";
import {
  MOSS_CAPTION_PROMPT,
  buildMossCaptionPrompt,
  parseMossCaption,
} from "@/lib/moss-prompt";

describe("MOSS_CAPTION_PROMPT", () => {
  it("is the recaptioner prompt with the JSON schema", () => {
    expect(MOSS_CAPTION_PROMPT).toContain("You are an image recaptioner.");
    expect(MOSS_CAPTION_PROMPT).toContain('"long"');
    expect(MOSS_CAPTION_PROMPT).toContain('"medium"');
    expect(MOSS_CAPTION_PROMPT).toContain('"short"');
    expect(MOSS_CAPTION_PROMPT).toContain('"watermark"');
    expect(MOSS_CAPTION_PROMPT).toContain('"borders"');
    expect(MOSS_CAPTION_PROMPT).toContain("{{reference}}");
  });

  it("carries the guide's rules for visible text and watermarks", () => {
    expect(MOSS_CAPTION_PROMPT).toContain(
      "Preserve visible text exactly, excluding watermarks."
    );
    expect(MOSS_CAPTION_PROMPT).toContain(
      "Return only the JSON object, without Markdown or explanations."
    );
  });
});

describe("buildMossCaptionPrompt", () => {
  it("substitutes the reference caption verbatim", () => {
    const prompt = buildMossCaptionPrompt("1girl, blue hair, forest");
    expect(prompt).not.toContain("{{reference}}");
    expect(prompt.trim().endsWith("1girl, blue hair, forest")).toBe(true);
  });

  it("trims the reference caption", () => {
    const prompt = buildMossCaptionPrompt("  some tags  ");
    expect(prompt.trim().endsWith("some tags")).toBe(true);
  });

  it("uses (none) for an empty reference", () => {
    const prompt = buildMossCaptionPrompt("");
    expect(prompt.trim().endsWith("(none)")).toBe(true);
  });

  it("uses (none) for a whitespace-only reference", () => {
    const prompt = buildMossCaptionPrompt("   \n  ");
    expect(prompt.trim().endsWith("(none)")).toBe(true);
  });
});

describe("parseMossCaption", () => {
  const validJson = JSON.stringify({
    caption: {
      long: "a detailed description",
      medium: "a paragraph",
      short: "a sentence",
    },
    watermark: [{ box_2d: [10, 20, 30, 40], label: "site.com" }],
    borders: ["none"],
  });

  it("parses a valid JSON object", () => {
    const result = parseMossCaption(validJson);
    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.caption.long).toBe("a detailed description");
    expect(result.parsed!.watermark).toHaveLength(1);
    expect(result.parsed!.borders).toEqual(["none"]);
  });

  it("returns pretty-printed normalized JSON when valid", () => {
    const result = parseMossCaption(validJson);
    expect(result.normalized).toBe(JSON.stringify(JSON.parse(validJson), null, 2));
  });

  it("accepts empty watermark array and empty borders besides none", () => {
    const result = parseMossCaption(
      JSON.stringify({
        caption: { long: "l", medium: "m", short: "s" },
        watermark: [],
        borders: ["left", "down"],
      })
    );
    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.watermark).toEqual([]);
  });

  it("strips markdown code fences", () => {
    const result = parseMossCaption("```json\n" + validJson + "\n```");
    expect(result.parsed).not.toBeNull();
    expect(result.normalized).toBe(JSON.stringify(JSON.parse(validJson), null, 2));
  });

  it("strips surrounding prose", () => {
    const result = parseMossCaption(
      "Here is the caption object:\n" + validJson + "\nHope that helps!"
    );
    expect(result.parsed).not.toBeNull();
  });

  it("rejects missing caption fields", () => {
    const result = parseMossCaption(
      JSON.stringify({
        caption: { long: "l", short: "s" },
        watermark: [],
        borders: ["none"],
      })
    );
    expect(result.parsed).toBeNull();
    expect(result.normalized).toBe(JSON.stringify({
      caption: { long: "l", short: "s" },
      watermark: [],
      borders: ["none"],
    }));
  });

  it("rejects empty caption fields", () => {
    const result = parseMossCaption(
      JSON.stringify({
        caption: { long: "", medium: "m", short: "s" },
        watermark: [],
        borders: ["none"],
      })
    );
    expect(result.parsed).toBeNull();
  });

  it("rejects a watermark entry with the wrong box_2d shape", () => {
    const result = parseMossCaption(
      JSON.stringify({
        caption: { long: "l", medium: "m", short: "s" },
        watermark: [{ box_2d: [1, 2], label: "x" }],
        borders: ["none"],
      })
    );
    expect(result.parsed).toBeNull();
  });

  it("rejects a non-array borders field", () => {
    const result = parseMossCaption(
      JSON.stringify({
        caption: { long: "l", medium: "m", short: "s" },
        watermark: [],
        borders: "none",
      })
    );
    expect(result.parsed).toBeNull();
  });

  it("returns trimmed raw text when no JSON object is present", () => {
    const result = parseMossCaption("  just some prose, no json \n");
    expect(result.parsed).toBeNull();
    expect(result.normalized).toBe("just some prose, no json");
  });

  it("returns trimmed raw text for malformed JSON", () => {
    const result = parseMossCaption("{ not valid json }");
    expect(result.parsed).toBeNull();
    expect(result.normalized).toBe("{ not valid json }");
  });
});
