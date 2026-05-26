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
// Detection prompt builder — context-aware confidence scoring
// ---------------------------------------------------------------------------

/**
 * Build detection prompts tailored to the content mode.
 * The confidence score reflects "visual importance" — what draws the eye first.
 * Ranges are enforced so the LLM produces varied, meaningful scores.
 */
export function getDetectionPrompts(contentMode: "sfw" | "nsfw") {
  const systemPrompt = `You are an object detection assistant. Detect all faces and bodies (full-body poses) in the image and return bounding boxes in JSON format. Respond in English only.`;

  const userPrompt = contentMode === "sfw"
    ? getSfwUserPrompt()
    : getNsfwUserPrompt();

  return { systemPrompt, userPrompt };
}

function getSfwUserPrompt(): string {
  return `Detect ALL faces and ALL bodies (full-body poses) in this image. Return two JSON arrays.

Each box must include a "confidence" field (0.0–1.0) representing VISUAL IMPORTANCE — how much attention this element draws.

### SFW Mode Confidence Ranges
**Faces (0.70–1.00):** The face is the PRIMARY focal point in SFW content.
  - 0.95–1.00: Striking expression, direct eye contact, or the clear center of attention
  - 0.80–0.94: Normal, clearly visible face
  - 0.70–0.79: Partially obscured, small in frame, or turned away

**Bodies (0.10–0.45):** The body is SECONDARY in SFW content.
  - 0.35–0.45: Notable outfit, distinctive pose, or fashion-focused shot
  - 0.20–0.34: Standard full-body shot, nothing particularly attention-grabbing
  - 0.10–0.19: Generic stance, body is just context

### CRITICAL RULES
- The highest face score MUST be at least 0.50 points higher than the highest body score
- Never give both face and body the same score
- The face of the main subject should almost always be 0.80+
- Body scores should feel noticeably lower — the body is supporting context, not the star

Format:
\`\`\`json
{
  "faces": [
    {"bbox_2d": [x_min, y_min, x_max, y_max], "label": "face", "confidence": 0.85}
  ],
  "bodies": [
    {"bbox_2d": [x_min, y_min, x_max, y_max], "label": "body", "confidence": 0.30}
  ]
}
\`\`\`

Coordinates are normalized to 1000 (x_min, y_min, x_max, y_max).
Return ONLY the JSON object. If none detected for a category, return an empty array for that category.
Respond in English only.`;
}

function getNsfwUserPrompt(): string {
  return `Detect ALL faces and ALL bodies (full-body poses) in this image. Return two JSON arrays.

Each box must include a "confidence" field (0.0–1.0) representing VISUAL IMPORTANCE — how much attention this element draws.

### NSFW Mode Confidence Ranges
**Bodies (0.70–1.00):** The body is the PRIMARY focal point in NSFW content.
  - 0.95–1.00: Provocative pose, heavy cleavage, revealing outfit, body is the undeniable center of attention
  - 0.85–0.94: Form-fitting clothing, visible curves, body-conscious pose
  - 0.70–0.84: Standard full-body shot, body is visible but not particularly provocative

**Faces (0.10–0.55):** The face is SECONDARY in NSFW content.
  - 0.45–0.55: Only if the face has a STRIKING feature — seductive expression, tongue out, heavy alluring makeup, or direct sultry eye contact
  - 0.25–0.44: Normal visible face, clearly seen but not the focal point
  - 0.10–0.24: Small in frame, partially obscured, or turned away

### CRITICAL RULES
- The highest body score MUST be at least 0.40 points higher than the highest face score
- Never give both face and body the same score
- Body scores should almost always be 0.80+ for the main subject
- Face scores should feel noticeably lower — the face is supporting context, not the star
- Even if the face is cute/attractive, it should NOT score as high as the body in NSFW mode
- A seductive expression (tongue out, biting lip) is the ONLY reason a face scores above 0.45

Format:
\`\`\`json
{
  "faces": [
    {"bbox_2d": [x_min, y_min, x_max, y_max], "label": "face", "confidence": 0.35}
  ],
  "bodies": [
    {"bbox_2d": [x_min, y_min, x_max, y_max], "label": "body", "confidence": 0.90}
  ]
}
\`\`\`

Coordinates are normalized to 1000 (x_min, y_min, x_max, y_max).
Return ONLY the JSON object. If none detected for a category, return an empty array for that category.
Respond in English only.`;
}
