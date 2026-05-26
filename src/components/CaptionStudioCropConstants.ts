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

/** Default detection prompt — asks for both face and body bounding boxes. */
export const DETECTION_SYSTEM_PROMPT = `You are an object detection assistant. Detect all faces and bodies (full-body poses) in the image and return bounding boxes in JSON format. Respond in English only.`;

export const DETECTION_USER_PROMPT = `Detect ALL faces and ALL bodies (full-body poses) in this image. Return two JSON arrays.

Format:
\`\`\`json
{
  "faces": [
    {"bbox_2d": [x_min, y_min, x_max, y_max], "label": "face"}
  ],
  "bodies": [
    {"bbox_2d": [x_min, y_min, x_max, y_max], "label": "body"}
  ]
}
\`\`\`

Coordinates are normalized to 1000 (x_min, y_min, x_max, y_max).
Return ONLY the JSON object. If none detected for a category, return an empty array for that category.
Respond in English only.`;
