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
