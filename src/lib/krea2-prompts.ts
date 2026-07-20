/**
 * Prompt builders for Krea 2 re-captioning phase.
 * Constructs system and user prompts for the LLM that refines captions
 * by removing character-consistent features and highlighting unique aspects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An image-caption pair for re-captioning input. */
export interface ImageCaptionPair {
  /** Global index of the image in the original set. */
  index: number;
  /** Display name of the image file. */
  name: string;
  /** Original caption generated in phase 1. */
  caption: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the re-captioning LLM call.
 * Instructs the model to remove consistent features and focus on unique aspects.
 */
export function buildRecaptionSystemPrompt(): string {
  return `You are a caption refinement assistant. Your task is to re-caption images by removing descriptions of features that are consistent across all images (because they belong to the same character/subject), and instead focusing on what makes each image unique.

Guidelines:
- Features that are the same across images (e.g., hair color, eye color, body type, clothing style) should be excluded from the captions since they are implied by the character description.
- Focus on what is DIFFERENT or UNIQUE in each image: pose, expression, background, lighting, accessories, actions, camera angle, etc.
- Each caption should be concise and highlight the distinctive aspects of that specific image.
- If an image has nothing particularly unique, describe the overall scene briefly.`;
}

// ---------------------------------------------------------------------------
// User prompt
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for a single re-captioning bucket.
 * Includes the character description and all image+caption pairs in the bucket.
 *
 * @param characterDescription - Natural language description of the character
 * @param pairs - Image-caption pairs to refine
 * @returns Formatted user prompt string
 */
export function buildRecaptionUserPrompt(
  characterDescription: string,
  pairs: ImageCaptionPair[]
): string {
  const lines: string[] = [];

  lines.push("Here is a description of the character/subject across all images:");
  lines.push(characterDescription);
  lines.push("");
  lines.push(
    `Below are ${pairs.length} image-caption pairs. For each image, provide a refined caption that excludes features consistent with the character description and focuses on what is unique in that specific image.`
  );
  lines.push("");

  for (const pair of pairs) {
    lines.push(`--- Image [${pair.index}] (${pair.name}) ---`);
    lines.push(`Original caption: ${pair.caption}`);
    lines.push("");
  }

  lines.push(
    "Return your refined captions as a JSON array with this structure:"
  );
  lines.push(`[{"index": 0, "caption": "refined caption for image 0"}, ...]`);
  lines.push(
    "Only include images whose captions you are refining. Each entry must have an 'index' matching the image index and a 'caption' string."
  );

  return lines.join("\n");
}
