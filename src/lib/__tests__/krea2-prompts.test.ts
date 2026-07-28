/**
 * Tests for Krea 2 prompt builders (krea2-prompts.ts).
 * Tests buildRefineUserPrompt() and buildDistillUserPrompt().
 */

import { describe, it, expect } from "bun:test";
import { buildRefineUserPrompt, buildDistillUserPrompt } from "@/lib/krea2-prompts";

// ---------------------------------------------------------------------------
// buildRefineUserPrompt tests
// ---------------------------------------------------------------------------

describe("buildRefineUserPrompt", () => {
  it("includes the original caption reference", () => {
    const result = buildRefineUserPrompt("A woman sitting on a bench", "A red-haired woman", "", "");
    expect(result).toContain("Refine the caption above");
  });

  it("includes the character description as features to exclude", () => {
    const result = buildRefineUserPrompt(
      "A woman sitting on a bench",
      "Red hair, green eyes, tall",
      "",
      ""
    );
    expect(result).toContain("Character description (features to exclude)");
    expect(result).toContain('"Red hair, green eyes, tall"');
  });

  it("includes focus instructions", () => {
    const result = buildRefineUserPrompt("caption", "desc", "", "");
    expect(result).toContain("Focus on: pose, expression, action, background, setting, lighting, camera angle, accessories, props");
  });

  it("includes NSFW/anatomical detail instruction", () => {
    const result = buildRefineUserPrompt("caption", "desc", "", "");
    expect(result).toContain("Include all visible anatomical and NSFW details without censorship or euphemism");
  });

  it("includes authority instruction", () => {
    const result = buildRefineUserPrompt("caption", "desc", "", "");
    expect(result).toContain("Write with authority");
    expect(result).toContain("Never hedge with phrases like");
  });

  it("includes person trigger word in MUST keep list", () => {
    const result = buildRefineUserPrompt("caption", "desc", "Alice", "");
    expect(result).toContain('MUST appear in the refined caption');
    expect(result).toContain('"Alice"');
  });

  it("includes other trigger word in MUST keep list", () => {
    const result = buildRefineUserPrompt("caption", "desc", "", "SketchStyle");
    expect(result).toContain('"SketchStyle"');
  });

  it("includes both trigger words in MUST keep list", () => {
    const result = buildRefineUserPrompt("caption", "desc", "Alice", "SketchStyle");
    expect(result).toContain('"Alice"');
    expect(result).toContain('"SketchStyle"');
  });

  it("omits MUST keep section when no trigger words", () => {
    const result = buildRefineUserPrompt("caption", "desc", "", "");
    expect(result).not.toContain("MUST appear in the refined caption");
  });

  it("omits MUST keep section when trigger words are whitespace only", () => {
    const result = buildRefineUserPrompt("caption", "desc", "   ", "  ");
    expect(result).not.toContain("MUST appear in the refined caption");
  });

  it("includes single paragraph output instruction", () => {
    const result = buildRefineUserPrompt("caption", "desc", "", "");
    expect(result).toContain("Output only the refined caption as a single paragraph of natural prose");
    expect(result).toContain("No explanations, labels, or markdown");
  });
});

// ---------------------------------------------------------------------------
// buildDistillUserPrompt tests
// ---------------------------------------------------------------------------

describe("buildDistillUserPrompt", () => {
  it("includes distillation instruction", () => {
    const result = buildDistillUserPrompt("A long detailed caption", "", "");
    expect(result).toContain("Distill the caption above into a concise krea2-optimized prompt");
  });

  it("includes preservation rules", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Keep every subject, action, color, clothing detail, spatial relationship, background element, and lighting condition");
  });

  it("includes elimination rules", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Eliminate repetitive phrasing and verbose explanations");
  });

  it("includes merging rules", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Merge adjacent descriptors of the same element");
  });

  it("includes prose format instruction", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Write flowing natural language prose (not keyword lists)");
  });

  it("includes word count target", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Target 60-150 words");
    expect(result).toContain("ONE cohesive paragraph");
  });

  it("includes authority instruction", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Write with authority");
  });

  it("includes no abstract quality tokens rule", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain('Do not add abstract quality tokens like "masterpiece", "best quality", or "8k"');
  });

  it("includes person trigger word in MUST keep list", () => {
    const result = buildDistillUserPrompt("caption", "Alice", "");
    expect(result).toContain('MUST appear in the distilled prompt');
    expect(result).toContain('"Alice"');
  });

  it("includes other trigger word in MUST keep list", () => {
    const result = buildDistillUserPrompt("caption", "", "SketchStyle");
    expect(result).toContain('"SketchStyle"');
  });

  it("includes both trigger words in MUST keep list", () => {
    const result = buildDistillUserPrompt("caption", "Alice", "SketchStyle");
    expect(result).toContain('"Alice"');
    expect(result).toContain('"SketchStyle"');
  });

  it("omits MUST keep section when no trigger words", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).not.toContain("MUST appear in the distilled prompt");
  });

  it("includes plain text output instruction", () => {
    const result = buildDistillUserPrompt("caption", "", "");
    expect(result).toContain("Output ONLY the distilled prompt as a single paragraph of plain text");
    expect(result).toContain("No explanations, labels, or markdown");
  });
});
