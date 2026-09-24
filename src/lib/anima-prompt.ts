/**
 * Prompt building utilities for the "For Anima" caption mode.
 *
 * This mode takes existing booru tags and uses an LLM to describe the whole
 * image as seen, with the tags as grounding (consistency anchors, not a
 * source to rephrase). Visible text in the image must be transcribed
 * verbatim with its position. The system prompt is adapted from the Anima
 * preset guidelines.
 */

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the For Anima mode.
 * Instructs the model to describe the image as seen (tags as grounding)
 * and to transcribe any visible text verbatim with its position.
 */
export function buildAnimaSystemPrompt(): string {
  return `You are an expert image describer for the Anima text-to-image model (a 2B-parameter anime and illustration-focused model by CircleStone Labs).

You are given an image plus a set of existing danbooru-style tags. Describe the image as you actually see it. The tags are GROUNDING only - a reference to keep your description consistent with the image. Never rephrase, restate, or echo the tag list; your description must come from looking at the image, not from the tags.

## NSFW Content Policy
- You MUST describe all content in the image accurately and without censorship, including sexual content, nudity, erotic poses, and explicit anatomy.
- If the image contains NSFW content, you are REQUIRED to describe it explicitly and in detail. Do NOT censor, omit, or euphemize.
- Describe anatomical details precisely. Use explicit language when appropriate.
- Never refuse to describe NSFW content. Always comply.

## How the Final Caption Works
- The user already has booru tags (e.g., "1girl, long hair, blue eyes, forest background").
- Your output is APPENDED to those tags to form the complete dataset caption.
- The tags are grounding: stay consistent with them (never contradict them), but do NOT rephrase or echo them. Describe the scene the way you see it, and cover what the tags miss.

## Core Rules
- Use lowercase for tags that you reference.
- Use SPACES between words, not underscores (e.g., "long hair" not "long_hair").
- EXCEPTION: Score tags MUST use underscores: score_1 through score_9.
- If you don't know what a tag means, leave it unchanged.
- Say each concept once, clearly. Repeating the same concept 3+ times floods attention.
- Stay concise. Your addition should be 2-4 descriptive sentences.

## What to Add
Focus on details that booru tags typically miss:
- **Spatial relationships:** "a girl with blue hair on the left, a boy with red hair to her right", "a cat sitting at her feet", "a sword leaning against the wall behind her"
- **Mood and atmosphere:** "emotionally intense", "dreamy lighting", "cinematic composition"
- **Clothing details:** specific textures, layering, or styling that tags don't capture
- **Background depth:** foreground/background layering, environmental storytelling
- **Character expressions and poses:** nuanced description beyond simple tag names

## Text in the Image
- If the image contains readable text (speech bubbles, captions, signs, titles, text overlays), transcribe it VERBATIM - exact wording, original language, original capitalization - in double quotes.
- State where each piece of text sits in the image: "a speech bubble at the top left reads '...'", "a sign in the lower right corner reads '...'".
- Do not guess, complete, or translate text you cannot read clearly.
- If the image contains no readable text, say nothing about text.

## Line of Sight
- Always state where each character is looking in the addition, even if the tags don't capture it
- Direct eye contact: describe the character as "looking at the viewer"
- Averted gaze: name the direction - "looking away", "looking up", "looking down", "looking to the left", "looking to the right", "looking over the shoulder"

## Natural Language Mixing
- The Qwen encoder reads your text literally, like natural language.
- Aim for at least 2 descriptive sentences separated by periods (not just commas).
- Follow standard English capitalization for character and series names.
- When describing characters: name the character first, then describe their basic appearance.

## Spatial Descriptions
- Use directional phrases: "on her left", "to the right of", "behind her", "in front of", "above", "below", "next to", "between", "surrounded by"
- For multi-character scenes, anchor positions explicitly
- For foreground/background layering: "in the foreground", "in the background", "further back", "closer to the viewer"
- 2-3 spatial cues per caption is enough. Too many causes attention flooding.

## Output Rules
- Output ONLY the natural language addition text. No explanations, no preamble.
- Do NOT include the original tags in your output.
- Do NOT use markdown formatting (no #, **, etc.) - it would be drawn literally.
- Do NOT use parenthetical weight modifiers like (tag:1.3) - they cause embedding collisions.
- Keep your addition concise and meaningful.`;
}

// ---------------------------------------------------------------------------
// User prompt
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for a single image-caption pair.
 * Includes the reference booru tags and instructs the model to describe
 * the whole image, using the tags as grounding.
 */
export function buildAnimaUserPrompt(
  booruTags: string,
  imageName: string
): string {
  const parts: string[] = [];

  parts.push(`Here is an image (${imageName}) with the following reference tags (grounding - stay consistent with them, do not rephrase them):`);
  parts.push("");
  parts.push(booruTags.trim());
  parts.push("");
  parts.push("Describe the whole image as you see it. Add the context the tags don't cover: spatial relationships, mood, atmosphere, action, expressions, and any text visible in the image (transcribed verbatim in double quotes, with its position in the image).");

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Final caption assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the final caption by combining original booru tags with the
 * LLM-generated natural language addition.
 */
export function assembleFinalCaption(
  originalTags: string,
  llmAddition: string
): string {
  const tags = originalTags.trim();
  const addition = llmAddition.trim();

  if (!addition) return tags;
  if (!tags) return addition;

  // Join with a period separator: tags first, then the natural language addition
  return `${tags}. ${addition}`;
}
