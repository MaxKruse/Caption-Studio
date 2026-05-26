import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// parseDetectionResponse — bounding box JSON parsing
// ---------------------------------------------------------------------------

describe("parseDetectionResponse", () => {
  let parse: (content: string) => {
    faceBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string }>;
    bodyBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string }>;
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
        { bbox_2d: [100, 200, 400, 500], label: "face" },
      ],
      bodies: [
        { bbox_2d: [50, 100, 950, 900], label: "body" },
      ],
    });

    const result = parse(json);

    expect(result.faceBoxes).toHaveLength(1);
    expect(result.faceBoxes[0].bbox_2d).toEqual([100, 200, 400, 500]);
    expect(result.faceBoxes[0].label).toBe("face");

    expect(result.bodyBoxes).toHaveLength(1);
    expect(result.bodyBoxes[0].bbox_2d).toEqual([50, 100, 950, 900]);
    expect(result.bodyBoxes[0].label).toBe("body");
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
});
