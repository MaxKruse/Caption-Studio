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
    "Include all visible anatomical and NSFW details without censorship or euphemism. Describe nipples visible through fabric, exposed midriff, visible hip bones, cleavage, bare skin, partial nudity, and any other body details that appear in the image. State these facts directly and precisely.",
    "",
    "IMPORTANT: If the original caption references a character by name, ALWAYS keep that character name in the refined caption. The name is essential and must not be removed.",
    "",
    "Write with authority. State every detail as fact. Never hedge with phrases like \"it appears\", \"possibly\", \"seems to\", \"likely\", or \"presumably\". Be direct and decisive.",
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
 * @param triggerWordPerson - Character name to always preserve
 * @param triggerWordOther - Style/object name to always preserve
 * @returns Formatted user prompt string
 */
export function buildRefineUserPrompt(
  originalCaption: string,
  characterDescription: string,
  triggerWordPerson: string,
  triggerWordOther: string
): string {
  const lines: string[] = [];

  lines.push("Original caption:");
  lines.push(`"${originalCaption}"`);
  lines.push("");
  lines.push("Character description (features to exclude from the caption):");
  lines.push(`"${characterDescription}"`);
  lines.push("");

  // Explicitly name what to keep
  const namesToKeep: string[] = [];
  if (triggerWordPerson.trim()) namesToKeep.push(`"${triggerWordPerson.trim()}"`);
  if (triggerWordOther.trim()) namesToKeep.push(`"${triggerWordOther.trim()}"`);

  if (namesToKeep.length > 0) {
    lines.push("IMPORTANT - these names MUST appear in the refined caption:");
    lines.push(namesToKeep.join(", "));
    lines.push("");
  }

  lines.push("Produce a refined caption that excludes the character-consistent features and focuses only on what is unique in this specific image.");

  return lines.join("\n");
}
