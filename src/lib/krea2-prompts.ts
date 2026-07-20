/**
 * Prompt builders for Krea 2 re-captioning (Phase 2) refinement step.
 * Constructs system and user prompts for removing character-consistent features
 * from existing captions so the final caption contains only image-unique details.
 */

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the caption refinement LLM call.
 * Instructs the model to strip character-consistent features from a caption,
 * keeping only what is unique to the specific image.
 */
export function buildRefineSystemPrompt(): string {
  return [
    "You are a caption refinement assistant.",
    "You receive an image, its existing caption, and a character description that identifies consistent features shared across multiple images of the same subject.",
    "",
    "Your task is to produce a refined caption that removes the character-consistent features and keeps only what is unique to this specific image.",
    "",
    "The character description covers physical appearance, consistent clothing, and any other features that appear in every image.",
    "The refined caption should focus on: pose, expression, action, background, setting, lighting, camera angle, accessories, props, and any other distinctive elements unique to this image.",
    "",
    "Output only the refined caption as a single paragraph of natural prose. No explanations, labels, or markdown formatting.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// User prompt
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for a single image refinement.
 * Includes the original caption and the character description so the LLM
 * knows which features to exclude.
 *
 * @param originalCaption - Caption generated in Phase 1
 * @param characterDescription - User-provided character description
 * @returns Formatted user prompt string
 */
export function buildRefineUserPrompt(
  originalCaption: string,
  characterDescription: string
): string {
  return [
    "Original caption:",
    `"${originalCaption}"`,
    "",
    "Character description (features to exclude from the caption):",
    `"${characterDescription}"`,
    "",
    "Produce a refined caption that excludes the character-consistent features and focuses only on what is unique in this specific image.",
  ].join("\n");
}
