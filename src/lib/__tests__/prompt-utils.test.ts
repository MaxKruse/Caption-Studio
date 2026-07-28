/**
 * Tests for prompt building utilities (prompt-utils.ts).
 * Tests buildUserPrompt() and buildTriggerContext().
 */

import { describe, it, expect } from "bun:test";
import { buildUserPrompt, buildTriggerContext } from "@/lib/prompt-utils";

// ---------------------------------------------------------------------------
// buildTriggerContext tests
// ---------------------------------------------------------------------------

describe("buildTriggerContext", () => {
  it("returns empty string when both trigger words are empty", () => {
    expect(buildTriggerContext("", "")).toBe("");
    expect(buildTriggerContext("   ", "")).toBe("");
    expect(buildTriggerContext("", "   ")).toBe("");
  });

  it("returns person sentence when only person trigger word provided", () => {
    const result = buildTriggerContext("Alice", "");
    expect(result).toBe("The Character in question is called 'Alice'.");
  });

  it("returns other sentence when only other trigger word provided", () => {
    const result = buildTriggerContext("", "SketchStyle");
    expect(result).toBe("The thing being captioned here is called 'SketchStyle'. If this is not a recognizable object or subject, it refers to an artistic style.");
  });

  it("returns both sentences when both trigger words provided", () => {
    const result = buildTriggerContext("Alice", "SketchStyle");
    expect(result).toContain("The Character in question is called 'Alice'.");
    expect(result).toContain("The thing being captioned here is called 'SketchStyle'.");
  });

  it("trims whitespace from trigger words", () => {
    const result = buildTriggerContext("  Alice  ", "  SketchStyle  ");
    expect(result).toBe("The Character in question is called 'Alice'. The thing being captioned here is called 'SketchStyle'. If this is not a recognizable object or subject, it refers to an artistic style.");
  });
});

// ---------------------------------------------------------------------------
// buildUserPrompt tests
// ---------------------------------------------------------------------------

describe("buildUserPrompt", () => {
  it("returns trimmed user prompt when no trigger words", () => {
    const result = buildUserPrompt("  Describe this image  ", "", "");
    expect(result).toBe("Describe this image");
  });

  it("replaces {trigger} placeholder with combined trigger words", () => {
    const result = buildUserPrompt(
      "Caption in the style of {trigger}",
      "Alice",
      "SketchStyle"
    );
    expect(result).toContain("Caption in the style of Alice SketchStyle");
  });

  it("replaces {trigger} with only person when other is empty", () => {
    const result = buildUserPrompt(
      "Style: {trigger}",
      "Alice",
      ""
    );
    expect(result).toContain("Style: Alice");
  });

  it("appends trigger context sentences to the prompt", () => {
    const result = buildUserPrompt("Describe this", "Alice", "");
    expect(result).toBe("Describe this The Character in question is called 'Alice'.");
  });

  it("handles empty user prompt with trigger words", () => {
    const result = buildUserPrompt("", "Alice", "");
    expect(result).toBe("The Character in question is called 'Alice'.");
  });

  it("handles empty user prompt with whitespace only", () => {
    const result = buildUserPrompt("   ", "Alice", "");
    expect(result).toBe("The Character in question is called 'Alice'.");
  });

  it("combines {trigger} replacement and context sentences", () => {
    const result = buildUserPrompt(
      "Caption featuring {trigger}",
      "Alice",
      "SketchStyle"
    );
    expect(result).toContain("Caption featuring Alice SketchStyle");
    expect(result).toContain("The Character in question is called 'Alice'.");
    expect(result).toContain("The thing being captioned here is called 'SketchStyle'.");
  });

  it("does not add {trigger} replacement when placeholder not present", () => {
    const result = buildUserPrompt("Just a prompt", "Alice", "");
    expect(result).not.toContain("{trigger}");
    expect(result).toBe("Just a prompt The Character in question is called 'Alice'.");
  });

  it("handles multiple {trigger} placeholders", () => {
    const result = buildUserPrompt(
      "{trigger} appears in {trigger} scenes",
      "Alice",
      ""
    );
    expect(result).toContain("Alice appears in Alice scenes");
    expect(result).toContain("The Character in question is called 'Alice'.");
  });

  it("skips {trigger} replacement when combined trigger is empty", () => {
    const result = buildUserPrompt("Style: {trigger}", "", "");
    expect(result).toBe("Style: {trigger}");
  });
});
