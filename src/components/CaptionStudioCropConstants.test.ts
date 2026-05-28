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
    expect(systemPrompt).toContain("confidence");
  });

  it("systemPrompt includes a JSON example", () => {
    const { systemPrompt } = getDetectionPrompts("sfw");
    expect(systemPrompt).toContain('"faces"');
    expect(systemPrompt).toContain('"bodies"');
    expect(systemPrompt).toContain("bbox_2d");
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

  it("SFW userPrompt indicates faces are primary (score higher)", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("faces");
    expect(userPrompt).toContain("primary");
    expect(userPrompt).toContain("higher");
  });

  it("SFW userPrompt indicates bodies are secondary (score lower)", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toContain("bodies");
    expect(userPrompt).toContain("secondary");
    expect(userPrompt).toContain("lower");
  });

  it("SFW userPrompt includes face confidence range ~0.7-1.0", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toMatch(/0\.7.*1\.0/);
  });

  it("SFW userPrompt includes body confidence range ~0.1-0.4", () => {
    const { userPrompt } = getDetectionPrompts("sfw");
    expect(userPrompt).toMatch(/0\.1.*0\.4/);
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

  it("NSFW userPrompt indicates bodies are primary (score higher)", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toContain("bodies");
    expect(userPrompt).toContain("primary");
    expect(userPrompt).toContain("higher");
  });

  it("NSFW userPrompt indicates faces are secondary (score lower)", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toContain("faces");
    expect(userPrompt).toContain("secondary");
    expect(userPrompt).toContain("lower");
  });

  it("NSFW userPrompt includes body confidence range ~0.7-1.0", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toMatch(/0\.7.*1\.0/);
  });

  it("NSFW userPrompt includes face confidence range ~0.1-0.5", () => {
    const { userPrompt } = getDetectionPrompts("nsfw");
    expect(userPrompt).toMatch(/0\.1.*0\.5/);
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

  it("NSFW userPrompt differs from SFW userPrompt", () => {
    const { userPrompt: sfw } = getDetectionPrompts("sfw");
    const { userPrompt: nsfw } = getDetectionPrompts("nsfw");
    expect(sfw).not.toBe(nsfw);
  });

  it("NSFW userPrompt has bodies as primary vs SFW has faces as primary", () => {
    const { userPrompt: sfw } = getDetectionPrompts("sfw");
    const { userPrompt: nsfw } = getDetectionPrompts("nsfw");

    // SFW: "faces are the primary focus"
    expect(sfw).toContain("faces are the primary");
    // NSFW: "bodies are the primary focus"
    expect(nsfw).toContain("bodies are the primary");
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
