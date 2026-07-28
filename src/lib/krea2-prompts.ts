/**
 * Prompt builders for Krea 2 pipeline (multi-turn conversation).
 *
 * Phase 1 (captioning): uses user-provided system + user prompts.
 * Phase 2 (refinement): user prompt that references Phase 1 caption + character description.
 * Phase 3 (distillation): user prompt that references Phase 2 caption.
 *
 * All phases share the same conversation context (single system prompt +
 * accumulating message history). The user prompt builders return text
 * that is appended as a new `user` message to the conversation.
 */

// ---------------------------------------------------------------------------
// Phase 2: Per-image refinement user prompt
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for a single image refinement.
 * Appended as a new user message to the existing conversation (which
 * already contains the image and Phase 1 caption).
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

  lines.push("Refine the caption above. Remove features that are consistent with this character description, keeping only what is unique to this specific image:");
  lines.push("");
  lines.push("Character description (features to exclude):");
  lines.push(`"${characterDescription}"`);
  lines.push("");
  lines.push("Focus on: pose, expression, action, background, setting, lighting, camera angle, accessories, props, and any other distinctive elements unique to this image.");
  lines.push("");
  lines.push("Include all visible anatomical and NSFW details without censorship or euphemism. State these facts directly and precisely.");
  lines.push("");
  lines.push("Write with authority. State every detail as fact. Never hedge with phrases like \"it appears\", \"possibly\", \"seems to\", \"likely\", or \"presumably\".");

  // Explicitly name what to keep
  const namesToKeep: string[] = [];
  if (triggerWordPerson.trim()) namesToKeep.push(`"${triggerWordPerson.trim()}"`);
  if (triggerWordOther.trim()) namesToKeep.push(`"${triggerWordOther.trim()}"`);

  if (namesToKeep.length > 0) {
    lines.push("");
    lines.push("IMPORTANT - these names MUST appear in the refined caption:");
    lines.push(namesToKeep.join(", "));
  }

  lines.push("");
  lines.push("Output only the refined caption as a single paragraph of natural prose. No explanations, labels, or markdown.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Phase 3: Krea 2 prompt distillation user prompt
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for distilling a refined caption into a
 * concise krea2-optimized prompt.
 * Appended as a new user message to the existing conversation.
 *
 * This is the inverse of the krea2-t2i expansion preset: instead of
 * taking a simple prompt and expanding it with style, lighting, and
 * composition details, we distill a verbose caption down to a tight,
 * accurate prompt that a text-to-image model can parse cleanly.
 *
 * @param refinedCaption - Caption from Phase 2 (refined, character-consistent features removed)
 * @param triggerWordPerson - Character name to always preserve
 * @param triggerWordOther - Style/object name to always preserve
 * @returns Formatted user prompt string
 */
export function buildDistillUserPrompt(
  refinedCaption: string,
  triggerWordPerson: string,
  triggerWordOther: string
): string {
  const lines: string[] = [];

  lines.push("Distill the caption above into a concise krea2-optimized prompt. Preserve all essential visual information but remove redundancy, verbose phrasing, and hedging language.");
  lines.push("");
  lines.push("Rules:");
  lines.push("1. Keep every subject, action, color, clothing detail, spatial relationship, background element, and lighting condition. Do not drop details that affect the visual output.");
  lines.push("2. Eliminate repetitive phrasing and verbose explanations. State each detail once, directly.");
  lines.push("3. Merge adjacent descriptors of the same element.");
  lines.push("4. Write flowing natural language prose (not keyword lists). Group subjects with their attributes.");
  lines.push("5. Target 60-150 words in ONE cohesive paragraph.");
  lines.push("6. Write with authority. State every detail as fact.");
  lines.push("7. Do not add abstract quality tokens like \"masterpiece\", \"best quality\", or \"8k\".");

  // Explicitly name what to keep
  const namesToKeep: string[] = [];
  if (triggerWordPerson.trim()) namesToKeep.push(`"${triggerWordPerson.trim()}"`);
  if (triggerWordOther.trim()) namesToKeep.push(`"${triggerWordOther.trim()}"`);

  if (namesToKeep.length > 0) {
    lines.push("");
    lines.push("IMPORTANT - these names MUST appear in the distilled prompt:");
    lines.push(namesToKeep.join(", "));
  }

  lines.push("");
  lines.push("Output ONLY the distilled prompt as a single paragraph of plain text. No explanations, labels, or markdown.");

  return lines.join("\n");
}
