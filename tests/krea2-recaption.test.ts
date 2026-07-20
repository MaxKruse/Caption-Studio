/**
 * Tests for Krea 2 re-captioning response parser.
 */

import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Inline implementation (matches the one in the route)
// ---------------------------------------------------------------------------

interface RecaptionResult {
  index: number;
  caption: string;
}

function parseRecaptionResponse(raw: string): RecaptionResult[] {
  let cleaned = raw.trim();

  // Strip markdown code block fences if present
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item: unknown) =>
          item != null &&
          typeof item === "object" &&
          "index" in item &&
          "caption" in item
      ) as RecaptionResult[];
    }
  } catch {
    // Not valid JSON - try line-by-line extraction
  }

  // Fallback: try to find JSON array in the text
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item: unknown) =>
            item != null &&
            typeof item === "object" &&
            "index" in item &&
            "caption" in item
        ) as RecaptionResult[];
      }
    } catch {
      // Still not valid
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseRecaptionResponse", () => {
  test("parses clean JSON array", () => {
    const input = `[{"index": 0, "caption": "Woman standing by ocean"}, {"index": 1, "caption": "Woman sitting on bench"}]`;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "Woman standing by ocean" },
      { index: 1, caption: "Woman sitting on bench" },
    ]);
  });

  test("parses JSON in markdown code block with json language", () => {
    const input = "```json\n[{\"index\": 0, \"caption\": \"Refined caption\"}]\n```";
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "Refined caption" },
    ]);
  });

  test("parses JSON in markdown code block without language", () => {
    const input = "```\n[{\"index\": 2, \"caption\": \"Another caption\"}]\n```";
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 2, caption: "Another caption" },
    ]);
  });

  test("parses JSON array embedded in prose text", () => {
    const input = `Here are the refined captions:

[{"index": 0, "caption": "Unique pose"}, {"index": 4, "caption": "Different background"}]

Let me know if you need anything else.`;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "Unique pose" },
      { index: 4, caption: "Different background" },
    ]);
  });

  test("filters out entries missing required fields", () => {
    const input = `[{"index": 0, "caption": "Valid"}, {"caption": "No index"}, {"index": 1}, {"index": 2, "caption": "Also valid"}]`;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "Valid" },
      { index: 2, caption: "Also valid" },
    ]);
  });

  test("returns empty array for empty string", () => {
    expect(parseRecaptionResponse("")).toEqual([]);
  });

  test("returns empty array for non-JSON text", () => {
    expect(parseRecaptionResponse("I don't know what to say")).toEqual([]);
  });

  test("returns empty array for JSON object (not array)", () => {
    const input = `{"result": "something"}`;
    expect(parseRecaptionResponse(input)).toEqual([]);
  });

  test("handles whitespace and newlines in JSON", () => {
    const input = `
      [
        {
          "index": 0,
          "caption": "  Trimmed caption  "
        }
      ]
    `;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "  Trimmed caption  " },
    ]);
  });

  test("handles single entry", () => {
    const input = `[{"index": 7, "caption": "Solo refined caption"}]`;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 7, caption: "Solo refined caption" },
    ]);
  });

  test("handles 8 entries (full bucket)", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      JSON.stringify({ index: i, caption: `Caption ${i}` })
    ).join(", ");
    const input = `[${entries}]`;
    const result = parseRecaptionResponse(input);
    expect(result.length).toBe(8);
    expect(result[0]).toEqual({ index: 0, caption: "Caption 0" });
    expect(result[7]).toEqual({ index: 7, caption: "Caption 7" });
  });

  test("handles null entries in array", () => {
    const input = `[null, {"index": 0, "caption": "Valid"}, null, "string", 42]`;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "Valid" },
    ]);
  });

  test("handles markdown code block with prose before and after", () => {
    const input = `I've analyzed the images and here are my refined captions:

\`\`\`json
[
  {"index": 0, "caption": "Woman in dynamic pose against sunset"},
  {"index": 1, "caption": "Woman in relaxed pose by the lake"}
]
\`\`\`

These captions focus on the unique aspects of each image.`;
    const result = parseRecaptionResponse(input);
    expect(result).toEqual([
      { index: 0, caption: "Woman in dynamic pose against sunset" },
      { index: 1, caption: "Woman in relaxed pose by the lake" },
    ]);
  });
});
