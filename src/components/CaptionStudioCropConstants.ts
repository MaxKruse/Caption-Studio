// ---------------------------------------------------------------------------
// Crop rulesets - predefined portrait/body split ratios
// ---------------------------------------------------------------------------

import type { CropRuleset } from "./CaptionStudioCropTypes";

/**
 * Available crop rulesets for batch image cropping.
 * Each ruleset defines what percentage of images should be portrait (face) vs body (pose) crops.
 */
export const CROP_RULESETS: CropRuleset[] = [
  {
    id: "crop_33_66",
    label: "33 / 66",
    portraitRatio: 0.33,
    description: "1/3 portrait, 2/3 body — diverse poses with some face shots",
  },
  {
    id: "crop_50_50",
    label: "50 / 50",
    portraitRatio: 0.5,
    description: "Equal split between portrait and body shots",
  },
  {
    id: "crop_66_33",
    label: "66 / 33",
    portraitRatio: 0.66,
    description: "2/3 portrait, 1/3 body — face-focused with some variety",
  },
  {
    id: "crop_80_20",
    label: "80 / 20",
    portraitRatio: 0.8,
    description: "Mostly portrait (face) with a few body shots",
  },
];

/** Get a crop ruleset by ID. */
export function getCropRuleset(id: string): CropRuleset {
  return CROP_RULESETS.find((r) => r.id === id) ?? CROP_RULESETS[1]; // default 50/50
}

// ---------------------------------------------------------------------------
// Detection defaults
// ---------------------------------------------------------------------------

/** Max concurrent detection requests. */
export const DETECTION_CONCURRENCY = 3;

/** Timeout per detection request (3 minutes). */
export const DETECTION_TIMEOUT_MS = 3 * 60 * 1000;

// ---------------------------------------------------------------------------
// Detection prompt builder
// ---------------------------------------------------------------------------

/**
 * Build detection prompts tailored to the content mode.
 *
 * Uses a flat JSON array with `bbox_2d [x_min, y_min, x_max, y_max]` and `label`
 * (x-first, 0–1000 normalized). This is the universal format understood by
 * Qwen, OpenAI, and most vision models. Gemma also follows this format when
 * explicitly prompted for it.
 *
 * The parser handles both `bbox_2d` (x-first) and `box_2d` (y-first, Gemma native)
 * as well as the legacy `{faces, bodies}` object format for backward compatibility.
 */
export function getDetectionPrompts(contentMode: "sfw" | "nsfw") {
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
