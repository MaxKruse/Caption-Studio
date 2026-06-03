import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// parseDetectionResponse — bounding box JSON parsing
// ---------------------------------------------------------------------------

describe("parseDetectionResponse", () => {
  let parse: (content: string) => {
    faceBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
    bodyBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  };

  beforeEach(async () => {
    vi.resetModules();
    const route = await import("./route");
    parse = route.parseDetectionResponse;
  });

  it("returns empty arrays for empty string", () => {
    const result = parse("");
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("returns empty arrays for null-ish content", () => {
    const result = parse("   ");
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("parses plain JSON with faces and bodies", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200, 400, 500], label: "face", confidence: 0.85 },
      ],
      bodies: [
        { bbox_2d: [50, 100, 950, 900], label: "body", confidence: 0.30 },
      ],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
    expect(result.faceBoxes[0].label).toBe("face");
    expect(result.faceBoxes[0].confidence).toBe(0.85);

    expect(result.bodyBoxes).toHaveLength(1);
    expect(result.bodyBoxes[0].bbox_2d).toEqual([50, 100, 950, 900]);
    expect(result.bodyBoxes[0].label).toBe("body");
    expect(result.bodyBoxes[0].confidence).toBe(0.30);
  });

  it("parses JSON inside markdown code block with json fence", () => {
    const content = "```json\n" + JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 300, 400], label: "face" }],
      bodies: [],
    }) + "\n```";

    const result = parse(content);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.bodyBoxes).toHaveLength(0);
  });

  it("parses JSON inside markdown code block without json fence", () => {
    const content = "```\n" + JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 300, 400], label: "face" }],
      bodies: [],
    }) + "\n```";

    const result = parse(content);

    expect(result.faceBoxes).toHaveLength(1);
  });

  it("parses JSON object embedded in surrounding text", () => {
    const content = "Here are the results: " + JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 300, 400], label: "face" }],
      bodies: [],
    }) + " Let me know if you need more!";

    const result = parse(content);

    expect(result.faceBoxes).toHaveLength(1);
  });

  it("handles multiple faces", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200, 300, 400], label: "face" },
        { bbox_2d: [500, 600, 700, 800], label: "face" },
        { bbox_2d: [10, 20, 100, 200], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(3);
  });

  it("handles empty arrays for both categories", () => {
    const json = JSON.stringify({
      faces: [],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("handles missing faces key (treats as empty)", () => {
    const json = JSON.stringify({
      bodies: [{ bbox_2d: [50, 100, 950, 900], label: "body" }],
    });

    const result = parse(json);

    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toHaveLength(1);
  });

  it("handles missing bodies key (treats as empty)", () => {
    const json = JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 300, 400], label: "face" }],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("filters out entries with invalid bbox_2d (not array)", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: "invalid", label: "face" },
        { bbox_2d: [100, 200, 300, 400], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 300, 400]);
  });

  it("filters out entries with wrong bbox_2d length", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200], label: "face" },
        { bbox_2d: [100, 200, 300, 400, 500], label: "face" },
        { bbox_2d: [100, 200, 300, 400], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
  });

  it("defaults label to 'unknown' when missing", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200, 300, 400] },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].label).toBe("unknown");
  });

  it("filters out null entries in arrays", () => {
    const json = JSON.stringify({
      faces: [
        null,
        { bbox_2d: [100, 200, 300, 400], label: "face" },
        undefined,
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
  });

  it("returns empty arrays for unparseable content", () => {
    const result = parse("this is not json at all");

    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("returns empty arrays for malformed JSON", () => {
    const result = parse("{ faces: [invalid] }");

    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("handles code block with extra whitespace", () => {
    const content = "```json\n  \n" + JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 300, 400], label: "face" }],
      bodies: [],
    }) + "\n  \n```";

    const result = parse(content);

    expect(result.faceBoxes).toHaveLength(1);
  });

  it("handles floating point coordinates", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100.5, 200.7, 300.3, 400.9], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100.5, 200.7, 300.3, 400.9]);
  });

  it("defaults confidence to 0.5 when missing", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200, 300, 400], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes[0].confidence).toBe(0.5);
  });

  it("clamps confidence to 0-1 range", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200, 300, 400], label: "face", confidence: 1.5 },
        { bbox_2d: [400, 500, 600, 700], label: "face", confidence: -0.3 },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes[0].confidence).toBe(1);
    expect(result.faceBoxes[1].confidence).toBe(0);
  });

  it("defaults confidence to 0.5 for NaN", () => {
    const json = JSON.stringify({
      faces: [
        { bbox_2d: [100, 200, 300, 400], label: "face", confidence: null },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes[0].confidence).toBe(0.5);
  });

  it("handles multiple bodies", () => {
    const json = JSON.stringify({
      faces: [],
      bodies: [
        { bbox_2d: [50, 100, 950, 900], label: "body" },
        { bbox_2d: [100, 200, 500, 800], label: "body" },
      ],
    });

    const result = parse(json);

    expect(result.bodyBoxes).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Gemma format — box_2d with [ymin, xmin, ymax, xmax] (y-first)
  // -----------------------------------------------------------------------

  it("parses Gemma box_2d format and normalizes to bbox_2d [xmin, ymin, xmax, ymax]", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: [200, 100, 500, 400], label: "face", confidence: 0.9 },
      ],
      bodies: [
        { box_2d: [100, 50, 900, 950], label: "body", confidence: 0.7 },
      ],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    // Gemma [ymin=200, xmin=100, ymax=500, xmax=400] → normalized [xmin=100, ymin=200, xmax=400, ymax=500]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
    expect(result.faceBoxes[0].label).toBe("face");
    expect(result.faceBoxes[0].confidence).toBe(0.9);

    expect(result.bodyBoxes).toHaveLength(1);
    // Gemma [ymin=100, xmin=50, ymax=900, xmax=950] → normalized [xmin=50, ymin=100, xmax=950, ymax=900]
    expect(result.bodyBoxes[0].bbox_2d).toEqual([50, 100, 950, 900]);
    expect(result.bodyBoxes[0].label).toBe("body");
    expect(result.bodyBoxes[0].confidence).toBe(0.7);
  });

  it("parses Gemma format with missing confidence (defaults to 0.5)", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: [150, 100, 350, 300], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 150, 300, 350]);
    expect(result.faceBoxes[0].confidence).toBe(0.5);
  });

  it("parses Gemma format with missing label (defaults to 'unknown')", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: [150, 100, 350, 300] },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].label).toBe("unknown");
  });

  it("parses Gemma format inside markdown code block", () => {
    const content = "```json\n" + JSON.stringify({
      faces: [{ box_2d: [200, 100, 400, 300], label: "face" }],
      bodies: [],
    }) + "\n```";

    const result = parse(content);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 300, 400]);
  });

  it("parses multiple Gemma boxes", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: [100, 50, 300, 200], label: "face", confidence: 0.9 },
        { box_2d: [400, 500, 600, 700], label: "face", confidence: 0.8 },
      ],
      bodies: [
        { box_2d: [50, 100, 950, 800], label: "body", confidence: 0.6 },
      ],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(2);
    expect(result.faceBoxes[0].bbox_2d).toEqual([50, 100, 200, 300]);
    expect(result.faceBoxes[1].bbox_2d).toEqual([500, 400, 700, 600]);
    expect(result.bodyBoxes).toHaveLength(1);
    expect(result.bodyBoxes[0].bbox_2d).toEqual([100, 50, 800, 950]);
  });

  it("filters out Gemma entries with invalid box_2d", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: "invalid", label: "face" },
        { box_2d: [100, 200], label: "face" },
        { box_2d: [100, 200, 300, 400], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([200, 100, 400, 300]);
  });

  it("prefers box_2d over bbox_2d when both present (Gemma format)", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: [200, 100, 500, 400], bbox_2d: [999, 888, 777, 666], label: "face" },
      ],
      bodies: [],
    });

    const result = parse(json);

    // box_2d takes precedence — [ymin=200, xmin=100, ymax=500, xmax=400] → [100, 200, 400, 500]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
  });

  it("handles mixed Gemma and OpenAI formats in same response", () => {
    const json = JSON.stringify({
      faces: [
        { box_2d: [200, 100, 400, 300], label: "face" },
      ],
      bodies: [
        { bbox_2d: [50, 100, 950, 900], label: "body" },
      ],
    });

    const result = parse(json);

    // Face: Gemma [200, 100, 400, 300] → [100, 200, 300, 400]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 300, 400]);
    // Body: OpenAI [50, 100, 950, 900] → [50, 100, 950, 900] (unchanged)
    expect(result.bodyBoxes[0].bbox_2d).toEqual([50, 100, 950, 900]);
  });

  // -----------------------------------------------------------------------
  // Flat JSON array format (Gemma 4 native) — [{box_2d, label}, ...]
  // -----------------------------------------------------------------------

  it("parses flat JSON array with box_2d (Gemma 4 native format)", () => {
    const json = JSON.stringify([
      { box_2d: [150, 100, 450, 400], label: "face", confidence: 0.9 },
      { box_2d: [300, 200, 600, 500], label: "body", confidence: 0.7 },
    ]);

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    // box_2d [ymin=150, xmin=100, ymax=450, xmax=400] → [100, 150, 400, 450]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 150, 400, 450]);
    expect(result.faceBoxes[0].label).toBe("face");

    expect(result.bodyBoxes).toHaveLength(1);
    // box_2d [ymin=300, xmin=200, ymax=600, xmax=500] → [200, 300, 500, 600]
    expect(result.bodyBoxes[0].bbox_2d).toEqual([200, 300, 500, 600]);
    expect(result.bodyBoxes[0].label).toBe("body");
  });

  it("parses flat array with multiple faces and bodies", () => {
    const json = JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "face" },
      { box_2d: [400, 500, 600, 700], label: "face" },
      { box_2d: [50, 100, 950, 800], label: "body" },
      { box_2d: [200, 300, 800, 600], label: "person" },
    ]);

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(2);
    expect(result.faceBoxes[0].bbox_2d).toEqual([50, 100, 200, 300]);
    expect(result.faceBoxes[1].bbox_2d).toEqual([500, 400, 700, 600]);

    // "body" and "person" both classified as body
    expect(result.bodyBoxes).toHaveLength(2);
  });

  it("parses flat array inside markdown code block", () => {
    const content = "```json\n" + JSON.stringify([
      { box_2d: [150, 100, 450, 400], label: "face" },
    ]) + "\n```";

    const result = parse(content);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 150, 400, 450]);
  });

  it("parses flat array with bbox_2d (x-first) entries", () => {
    const json = JSON.stringify([
      { bbox_2d: [100, 150, 400, 450], label: "face" },
      { bbox_2d: [200, 300, 500, 600], label: "body" },
    ]);

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 150, 400, 450]);
    expect(result.bodyBoxes).toHaveLength(1);
    expect(result.bodyBoxes[0].bbox_2d).toEqual([200, 300, 500, 600]);
  });

  it("classifies 'head' label as face", () => {
    const json = JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "head" },
    ]);

    const result = parse(json);
    expect(result.faceBoxes).toHaveLength(1);
    expect(result.bodyBoxes).toHaveLength(0);
  });

  it("classifies 'person' label as body", () => {
    const json = JSON.stringify([
      { box_2d: [50, 100, 950, 800], label: "person" },
    ]);

    const result = parse(json);
    expect(result.faceBoxes).toHaveLength(0);
    expect(result.bodyBoxes).toHaveLength(1);
  });

  it("classifies 'full body' label as body", () => {
    const json = JSON.stringify([
      { box_2d: [50, 100, 950, 800], label: "full body" },
    ]);

    const result = parse(json);
    expect(result.bodyBoxes).toHaveLength(1);
  });

  it("classifies 'portrait' label as face", () => {
    const json = JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "portrait" },
    ]);

    const result = parse(json);
    expect(result.faceBoxes).toHaveLength(1);
  });

  it("excludes unknown labels from both faceBoxes and bodyBoxes", () => {
    const json = JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "cat" },
      { box_2d: [400, 500, 600, 700], label: "face" },
    ]);

    const result = parse(json);
    expect(result.faceBoxes).toHaveLength(1);
    expect(result.bodyBoxes).toHaveLength(0);
  });

  it("handles empty flat array", () => {
    const result = parse("[]");
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("handles flat array with surrounding text", () => {
    const content = "Here are the detections:\n" + JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "face" },
    ]) + "\nThat's all I found.";

    const result = parse(content);
    expect(result.faceBoxes).toHaveLength(1);
  });

  it("handles flat array with mixed box_2d and bbox_2d entries", () => {
    const json = JSON.stringify([
      { box_2d: [200, 100, 500, 400], label: "face" },
      { bbox_2d: [50, 100, 950, 900], label: "body" },
    ]);

    const result = parse(json);

    // box_2d [ymin=200, xmin=100, ymax=500, xmax=400] → [100, 200, 400, 500]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
    // bbox_2d [50, 100, 950, 900] → unchanged
    expect(result.bodyBoxes[0].bbox_2d).toEqual([50, 100, 950, 900]);
  });
});

// ---------------------------------------------------------------------------
// Regression tests — "expect to fail" tests for previously fixed bugs
// ---------------------------------------------------------------------------

describe("regression — Bug 3: Gemma 4 bounding boxes were broken (2026-06-03)", () => {
  let parse: (content: string) => {
    faceBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
    bodyBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  };

  beforeEach(async () => {
    vi.resetModules();
    const route = await import("./route");
    parse = route.parseDetectionResponse;
  });

  it("does NOT return empty arrays for Gemma 4 flat array format", () => {
    // The original bug: parser looked for parsed.faces / parsed.bodies,
    // which don't exist in Gemma 4's flat array output → always returned []
    const json = JSON.stringify([
      { box_2d: [150, 100, 450, 400], label: "face" },
      { box_2d: [300, 200, 600, 500], label: "body" },
    ]);

    const result = parse(json);

    // MUST NOT be empty — that was the bug
    expect(result.faceBoxes.length + result.bodyBoxes.length).toBeGreaterThan(0);
    expect(result.faceBoxes).toHaveLength(1);
    expect(result.bodyBoxes).toHaveLength(1);
  });

  it("does NOT return empty arrays when Gemma 4 wraps output in markdown fences", () => {
    // Gemma 4 often wraps JSON in ```json ... ``` fences
    const content = "```json\n" + JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "face" },
    ]) + "\n```";

    const result = parse(content);

    expect(result.faceBoxes.length + result.bodyBoxes.length).toBeGreaterThan(0);
    expect(result.faceBoxes).toHaveLength(1);
  });

  it("does NOT return empty arrays when Gemma 4 adds preamble text", () => {
    // Gemma 4 may add natural-language preamble before the JSON
    const content = "I detected the following objects:\n\n" + JSON.stringify([
      { box_2d: [100, 50, 300, 200], label: "face" },
    ]);

    const result = parse(content);

    expect(result.faceBoxes.length + result.bodyBoxes.length).toBeGreaterThan(0);
  });

  it("does NOT swap coordinates for bbox_2d (x-first) entries", () => {
    // OpenAI/Qwen use bbox_2d with [xmin, ymin, xmax, ymax] — must NOT be swapped
    const json = JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 400, 500], label: "face" }],
      bodies: [],
    });

    const result = parse(json);

    // [100, 200, 400, 500] must stay [100, 200, 400, 500], NOT become [200, 100, 500, 400]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
  });

  it("does swap coordinates for box_2d (y-first) entries", () => {
    // Gemma uses box_2d with [ymin, xmin, ymax, xmax] — MUST be swapped to x-first
    const json = JSON.stringify({
      faces: [{ box_2d: [200, 100, 500, 400], label: "face" }],
      bodies: [],
    });

    const result = parse(json);

    // [ymin=200, xmin=100, ymax=500, xmax=400] → [xmin=100, ymin=200, xmax=400, ymax=500]
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
  });

  it("does NOT lose detections when both box_2d and bbox_2d exist (prefers box_2d)", () => {
    // When both keys exist, box_2d (Gemma) takes precedence
    const json = JSON.stringify({
      faces: [{ box_2d: [200, 100, 500, 400], bbox_2d: [999, 888, 777, 666], label: "face" }],
      bodies: [],
    });

    const result = parse(json);

    // Must use box_2d values, not bbox_2d
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
    // Must NOT use the bogus bbox_2d values
    expect(result.faceBoxes[0].bbox_2d).not.toEqual([999, 888, 777, 666]);
  });

  it("does NOT crash on malformed JSON from model", () => {
    // Models sometimes return truncated or malformed JSON
    expect(() => parse("{ faces: [invalid] }")).not.toThrow();
    expect(() => parse("[{box_2d: }]")).not.toThrow();
    expect(() => parse("not json at all")).not.toThrow();
    expect(() => parse("")).not.toThrow();
  });

  it("does NOT produce inverted bounding boxes (xmax < xmin or ymax < ymin)", () => {
    // After coordinate swap, boxes must remain valid (max > min)
    const json = JSON.stringify([
      { box_2d: [100, 50, 400, 300], label: "face" },
    ]);

    const result = parse(json);
    const [xmin, ymin, xmax, ymax] = result.faceBoxes[0].bbox_2d;

    expect(xmax).toBeGreaterThan(xmin);
    expect(ymax).toBeGreaterThan(ymin);
  });
});

describe("regression — Bug 1: UI state timing (2026-05-28)", () => {
  // Bug 1 was a React setState timing issue in useCropDetection.
  // The parser itself is synchronous — the bug was in the hook's async state management.
  // These tests verify the parser is always synchronous and deterministic,
  // which is a prerequisite for the ref-based fix to work correctly.

  let parse: (content: string) => {
    faceBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
    bodyBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  };

  beforeEach(async () => {
    vi.resetModules();
    const route = await import("./route");
    parse = route.parseDetectionResponse;
  });

  it("is synchronous — returns result immediately without awaiting", () => {
    // The parser MUST be synchronous so the ref-based state fix works.
    // If it were async, the ref would be stale when read.
    const json = JSON.stringify({
      faces: [{ bbox_2d: [100, 200, 300, 400], label: "face" }],
      bodies: [],
    });

    // Must return a plain object, not a Promise
    const result = parse(json);
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.faceBoxes).toHaveLength(1);
  });

  it("is deterministic — same input produces identical output", () => {
    const json = JSON.stringify([
      { box_2d: [150, 100, 450, 400], label: "face" },
      { box_2d: [300, 200, 600, 500], label: "body" },
    ]);

    const a = parse(json);
    const b = parse(json);

    expect(a).toEqual(b);
  });
});
