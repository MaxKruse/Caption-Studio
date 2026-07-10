// ---------------------------------------------------------------------------
// Detection prompt builder
// ---------------------------------------------------------------------------

/** Max concurrent detection requests. */
export const DETECTION_CONCURRENCY = 3;

/**
 * Build detection prompts tailored to the content mode and model family.
 *
 * Gemma models natively return `box_2d` with `[y_min, x_min, y_max, x_max]` (y-first).
 * Qwen models natively return `bbox_2d` with `[x_min, y_min, x_max, y_max]` (x-first).
 */
export function getDetectionPrompts(
  contentMode: "sfw" | "nsfw",
  model: string
): { systemPrompt: string; userPrompt: string } {
  const isGemma = model.toLowerCase().includes("gemma");

  if (isGemma) {
    const systemPrompt = `You are an object detection assistant. Detect all faces and bodies (full-body poses) in the image and return bounding boxes as a JSON array.

## Output Format
Return a JSON array. Each entry has:
- box_2d: [y_min, x_min, y_max, x_max] — integers normalized to 1000 (y is vertical, x is horizontal, origin at top-left)
- label: "face" or "body" (use "face" for faces/headshots, "body" for full-body poses)

If you detect nothing, return an empty array [].

## Example
[
  {"box_2d": [150, 100, 450, 400], "label": "face"},
  {"box_2d": [300, 200, 600, 500], "label": "body"}
]`;
    const userPrompt =
      contentMode === "sfw" ? getSfwUserPrompt() : getNsfwUserPrompt();
    return { systemPrompt, userPrompt };
  }

  const systemPrompt = `You are an object detection assistant. Detect all faces and bodies (full-body poses) in the image and return bounding boxes as a JSON array.

## Output Format
Return a JSON array. Each entry has:
- bbox_2d: [x_min, y_min, x_max, y_max] — integers normalized to 1000 (x is horizontal, y is vertical, origin at top-left)
- label: "face" or "body" (use "face" for faces/headshots, "body" for full-body poses)

If you detect nothing, return an empty array [].

## Example
[
  {"bbox_2d": [100, 150, 400, 450], "label": "face"},
  {"bbox_2d": [200, 300, 500, 600], "label": "body"}
]`;

  const userPrompt =
    contentMode === "sfw" ? getSfwUserPrompt() : getNsfwUserPrompt();

  return { systemPrompt, userPrompt };
}

function getSfwUserPrompt(): string {
  return `Detect ALL faces and ALL bodies (full-body poses) in this image.
Return ONLY the JSON array — no markdown fences, no explanation text.`;
}

function getNsfwUserPrompt(): string {
  return `Detect ALL faces and ALL bodies (full-body poses) in this image.
Return ONLY the JSON array — no markdown fences, no explanation text.`;
}
