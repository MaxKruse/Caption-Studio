/**
 * Tests for the default system prompt builders (krea2-system-prompt.ts,
 * anima-prompt.ts).
 * Covers the line-of-sight (gaze direction) instruction that both
 * captioning modes must include in every caption.
 */

import { describe, it, expect } from "bun:test";
import { buildKrea2SystemPrompt } from "@/lib/krea2-system-prompt";
import { buildAnimaSystemPrompt } from "@/lib/anima-prompt";

// ---------------------------------------------------------------------------
// buildKrea2SystemPrompt - line of sight
// ---------------------------------------------------------------------------

describe("buildKrea2SystemPrompt line of sight", () => {
  it("includes a dedicated Line of Sight section", () => {
    const result = buildKrea2SystemPrompt();
    expect(result).toContain("## Line of Sight");
  });

  it("requires gaze to be anchored to the camera", () => {
    const result = buildKrea2SystemPrompt();
    expect(result).toContain("anchored to the camera");
  });

  it("uses camera-relative phrasing for direct eye contact", () => {
    const result = buildKrea2SystemPrompt();
    expect(result).toContain("looking directly at the camera");
  });

  it("forbids viewer-relative gaze descriptions", () => {
    const result = buildKrea2SystemPrompt();
    expect(result).toContain("Never describe gaze relative to the viewer");
  });
});

// ---------------------------------------------------------------------------
// buildAnimaSystemPrompt - line of sight
// ---------------------------------------------------------------------------

describe("buildAnimaSystemPrompt line of sight", () => {
  it("includes a dedicated Line of Sight section", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("## Line of Sight");
  });

  it("uses the booru phrase for direct eye contact", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("looking at the viewer");
  });

  it("requires averted gaze direction to be named", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("Averted gaze");
  });
});

// ---------------------------------------------------------------------------
// buildAnimaSystemPrompt - text in the image
// ---------------------------------------------------------------------------

describe("buildAnimaSystemPrompt text in the image", () => {
  it("includes a dedicated Text in the Image section", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("## Text in the Image");
  });

  it("requires verbatim transcription (wording, language, capitalization)", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("transcribe it VERBATIM");
    expect(result).toContain("exact wording, original language, original capitalization");
  });

  it("requires the position of each piece of text", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("State where each piece of text sits in the image");
  });

  it("forbids guessing, completing, or translating illegible text", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("Do not guess, complete, or translate");
  });
});

// ---------------------------------------------------------------------------
// buildAnimaSystemPrompt - tags as grounding
// ---------------------------------------------------------------------------

describe("buildAnimaSystemPrompt tags as grounding", () => {
  it("positions the tags as grounding, not a source to echo", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("The tags are GROUNDING only");
    expect(result).toContain("Never rephrase, restate, or echo the tag list");
  });

  it("requires describing the image as seen", () => {
    const result = buildAnimaSystemPrompt();
    expect(result).toContain("Describe the image as you actually see it");
  });
});
