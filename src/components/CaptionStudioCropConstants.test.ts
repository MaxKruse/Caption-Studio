import { describe, it, expect } from "vitest";
import {
  CROP_RULESETS,
  getCropRuleset,
  getDetectionPrompts,
  DETECTION_CONCURRENCY,
  DETECTION_TIMEOUT_MS,
} from "./CaptionStudioCropConstants";

// ---------------------------------------------------------------------------
// CROP_RULESETS
// ---------------------------------------------------------------------------

describe("CROP_RULESETS", () => {
  it("contains 4 predefined rulesets", () => {
    expect(CROP_RULESETS).toHaveLength(4);
  });

  it("has correct ruleset IDs", () => {
    const ids = CROP_RULESETS.map((r) => r.id);
    expect(ids).toEqual([
      "crop_33_66",
      "crop_50_50",
      "crop_66_33",
      "crop_80_20",
    ]);
  });

  it("has correct portrait ratios", () => {
    const ratios = CROP_RULESETS.map((r) => r.portraitRatio);
    expect(ratios).toEqual([0.33, 0.5, 0.66, 0.8]);
  });

  it("has correct labels", () => {
    const labels = CROP_RULESETS.map((r) => r.label);
    expect(labels).toEqual(["33 / 66", "50 / 50", "66 / 33", "80 / 20"]);
  });

  it("each ruleset has a description", () => {
    for (const ruleset of CROP_RULESETS) {
      expect(ruleset.description).toBeDefined();
      expect(ruleset.description.length).toBeGreaterThan(0);
    }
  });

  it("portrait ratios are between 0 and 1", () => {
    for (const ruleset of CROP_RULESETS) {
      expect(ruleset.portraitRatio).toBeGreaterThanOrEqual(0);
      expect(ruleset.portraitRatio).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// getCropRuleset
// ---------------------------------------------------------------------------

describe("getCropRuleset", () => {
  it("returns the correct ruleset by ID", () => {
    expect(getCropRuleset("crop_33_66").id).toBe("crop_33_66");
    expect(getCropRuleset("crop_50_50").id).toBe("crop_50_50");
    expect(getCropRuleset("crop_66_33").id).toBe("crop_66_33");
    expect(getCropRuleset("crop_80_20").id).toBe("crop_80_20");
  });

  it("returns default 50/50 for nonexistent ID", () => {
    const result = getCropRuleset("nonexistent_id");
    expect(result.id).toBe("crop_50_50");
    expect(result.portraitRatio).toBe(0.5);
  });

  it("returns default 50/50 for empty string", () => {
    const result = getCropRuleset("");
    expect(result.id).toBe("crop_50_50");
  });
});

// ---------------------------------------------------------------------------
// Detection defaults
// ---------------------------------------------------------------------------

describe("DETECTION_CONCURRENCY", () => {
  it("is set to 3", () => {
    expect(DETECTION_CONCURRENCY).toBe(3);
  });
});

describe("DETECTION_TIMEOUT_MS", () => {
  it("is set to 3 minutes (180000ms)", () => {
    expect(DETECTION_TIMEOUT_MS).toBe(180000);
  });
});

// ---------------------------------------------------------------------------
// getDetectionPrompts — SFW mode
// ---------------------------------------------------------------------------

describe("getDetectionPrompts — SFW", () => {
  it("returns both systemPrompt and userPrompt", () => {
    const prompts = getDetectionPrompts("sfw");
    expect(prompts).toHaveProperty("systemPrompt");
    expect(prompts).toHaveProperty("userPrompt");
  });

  it("systemPrompt instructs to detect faces and bodies", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).toContain("object detection assistant");
    expect(systemPrompt).toContain("faces");
    expect(systemPrompt).toContain("bodies");
  });

  it("systemPrompt includes JSON format instructions", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).toContain("JSON");
    expect(systemPrompt).toContain("bbox_2d");
    expect(systemPrompt).toContain("label");
  });

  it("systemPrompt includes a JSON array example", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).toContain("bbox_2d");
    expect(systemPrompt).toContain('"label"');
    expect(systemPrompt).toContain("JSON array");
  });

  it("systemPrompt mentions 1000-normalized coordinates", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).toContain("1000");
  });

  it("systemPrompt mentions empty arrays for no detections", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).toContain("empty array");
  });

  it("SFW userPrompt instructs to detect ALL faces and bodies", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("Detect ALL faces");
    expect(userPrompt).toContain("ALL bodies");
  });

  it("SFW userPrompt says return ONLY JSON", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("ONLY");
    expect(userPrompt).toContain("JSON");
  });

  it("SFW userPrompt says no markdown fences", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("no markdown fences");
  });

  it("SFW userPrompt says no explanation text", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("no explanation text");
  });

  it("SFW userPrompt asks for JSON array output", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("JSON array");
  });

  it("SFW userPrompt does not include confidence scoring guidance", () => {
    // Confidence scoring is handled by the parser defaulting to 0.5
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).not.toContain("primary");
    expect(userPrompt).not.toContain("confidence");
  });

  it("SFW userPrompt does NOT contain complex scoring constraints", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    // Should NOT have "MUST exceed" constraints
    expect(userPrompt).not.toContain("MUST exceed");
    // Should NOT have "Never assign identical"
    expect(userPrompt).not.toContain("Never assign identical");
    // Should NOT have detailed scoring tiers
    expect(userPrompt).not.toContain("0.95");
    expect(userPrompt).not.toContain("striking expression");
  });

  it("SFW userPrompt is concise (under 300 chars)", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt.length).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// getDetectionPrompts — NSFW mode
// ---------------------------------------------------------------------------

describe("getDetectionPrompts — NSFW", () => {
  it("returns both systemPrompt and userPrompt", () => {
    const prompts = getDetectionPrompts("nsfw");
    expect(prompts).toHaveProperty("systemPrompt");
    expect(prompts).toHaveProperty("userPrompt");
  });

  it("NSFW systemPrompt is identical to SFW systemPrompt", () => {
    const { systemPrompt: sfwSystem } = getDetectionPrompts("sfw");
    const { systemPrompt: nsfwSystem } = getDetectionPrompts("nsfw");
    expect(nsfwSystem).toBe(sfwSystem);
  });

  it("NSFW userPrompt instructs to detect ALL faces and bodies", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toContain("Detect ALL faces");
    expect(userPrompt).toContain("ALL bodies");
  });

  it("NSFW userPrompt says return ONLY JSON", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toContain("ONLY");
    expect(userPrompt).toContain("JSON");
  });

  it("NSFW userPrompt asks for JSON array output", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toContain("JSON array");
  });

  it("NSFW userPrompt does not include confidence scoring guidance", () => {
    // Confidence scoring is handled by the parser defaulting to 0.5
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).not.toContain("primary");
    expect(userPrompt).not.toContain("confidence");
  });

  it("NSFW userPrompt does NOT contain complex scoring constraints", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).not.toContain("MUST exceed");
    expect(userPrompt).not.toContain("Never assign identical");
    expect(userPrompt).not.toContain("0.95");
    expect(userPrompt).not.toContain("provocative");
  });

  it("NSFW userPrompt is concise (under 300 chars)", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt.length).toBeLessThan(300);
  });

  it("NSFW userPrompt is identical to SFW userPrompt (no mode-specific scoring)", () => {
    // Confidence scoring is handled by the parser, not the prompt
    const { userPrompt: sfw } = getDetectionPrompts("sfw");
    const { userPrompt: nsfw } = getDetectionPrompts("nsfw");
    expect(sfw).toBe(nsfw);
  });
});

// ---------------------------------------------------------------------------
// getDetectionPrompts — common properties
// ---------------------------------------------------------------------------

describe("getDetectionPrompts — common", () => {
  it("systemPrompt does not contain markdown code fences", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).not.toContain("```");
  });

  it("userPrompt does not contain markdown code fences", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).not.toContain("```");
    const { userPrompt: nsfw } = getDetectionPrompts("nsfw");
    expect(nsfw).not.toContain("```");
  });

  it("systemPrompt is consistent across calls", () => {
    const { systemPrompt: a } = getDetectionPrompts("sfw");
    const { systemPrompt: b } = getDetectionPrompts("sfw");
    expect(a).toBe(b);
  });

  it("total prompt length is reasonable (under 1000 chars combined)", () => {
    const sfw = getDetectionPrompts("sfw");
    const sfwTotal = sfw.systemPrompt.length + sfw.userPrompt.length;
    expect(sfwTotal).toBeLessThan(1000);

    const nsfw = getDetectionPrompts("nsfw");
    const nsfwTotal = nsfw.systemPrompt.length + nsfw.userPrompt.length;
    expect(nsfwTotal).toBeLessThan(1000);
  });
});
