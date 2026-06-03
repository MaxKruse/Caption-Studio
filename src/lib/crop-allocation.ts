import type { BoundingBox } from "@/components/CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Padding constants
// ---------------------------------------------------------------------------

/** Extra padding for face crops — LLMs return tight face boxes. */
export const FACE_CROP_PADDING = 0.25;
/** No extra padding for body crops — LLM body boxes are already well-sized. */
export const BODY_CROP_PADDING = 0;

// ---------------------------------------------------------------------------
// Bounding box quality
// ---------------------------------------------------------------------------

/**
 * Compute a quality score for bounding boxes (0-1 range).
 * Uses the highest confidence score — reflects visual importance
 * (SFW: face importance, NSFW: body importance), not just box size.
 */
export function computeBoxQuality(boxes: BoundingBox[]): number {
  if (boxes.length === 0) return 0;
  return Math.max(...boxes.map((bb) => bb.confidence));
}

// ---------------------------------------------------------------------------
// Crop rectangle builders
// ---------------------------------------------------------------------------

/**
 * Build a crop rectangle from a bounding box with padding.
 */
export function buildCropRectFromBox(
  box: BoundingBox,
  paddingFactor: number
): { x: number; y: number; width: number; height: number } {
  const bx = box.bbox_2d[0];
  const by = box.bbox_2d[1];
  const bw = box.bbox_2d[2] - bx;
  const bh = box.bbox_2d[3] - by;

  const paddingW = bw * paddingFactor;
  const paddingH = bh * paddingFactor;

  let cropX = bx - paddingW;
  let cropY = by - paddingH;
  let cropWidth = bw + paddingW * 2;
  let cropHeight = bh + paddingH * 2;

  if (cropX < 0) { cropWidth += cropX; cropX = 0; }
  if (cropY < 0) { cropHeight += cropY; cropY = 0; }
  if (cropX + cropWidth > 1000) cropWidth = 1000 - cropX;
  if (cropY + cropHeight > 1000) cropHeight = 1000 - cropY;

  return { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
}

/**
 * Build a crop rectangle from the best bounding box of a given category.
 */
export function buildCropRectFromBestBox(
  boxes: BoundingBox[],
  paddingFactor: number
): { x: number; y: number; width: number; height: number } | null {
  if (boxes.length === 0) return null;

  const largest = boxes.reduce((max, bb) => {
    const area = (bb.bbox_2d[2] - bb.bbox_2d[0]) * (bb.bbox_2d[3] - bb.bbox_2d[1]);
    const maxArea = (max.bbox_2d[2] - max.bbox_2d[0]) * (max.bbox_2d[3] - max.bbox_2d[1]);
    return area > maxArea ? bb : max;
  });

  return buildCropRectFromBox(largest, paddingFactor);
}

/**
 * Build a default full-image crop (when no detection available).
 */
export function buildDefaultCrop(): { x: number; y: number; width: number; height: number } {
  const margin = 20;
  return { x: margin, y: margin, width: 1000 - margin * 2, height: 1000 - margin * 2 };
}

// ---------------------------------------------------------------------------
// Crop type allocation
// ---------------------------------------------------------------------------

/**
 * Allocate crop types to images based on detection quality and ruleset ratio.
 * Sorts images by (faceQuality - bodyQuality) descending; top N get "face", rest get "body".
 */
export function allocateCropTypes(
  detections: Array<{ faceBoxes: BoundingBox[]; bodyBoxes: BoundingBox[] }>,
  portraitRatio: number
): ("face" | "body")[] {
  const total = detections.length;
  const portraitCount = Math.round(total * portraitRatio);

  const scored = detections.map((d) => {
    const faceQuality = computeBoxQuality(d.faceBoxes);
    const bodyQuality = computeBoxQuality(d.bodyBoxes);
    // Round to 2 decimals to avoid floating-point sort instability
    // (confidence scores are given to 2 decimal places)
    const preference = Math.round((faceQuality - bodyQuality) * 100) / 100;
    return { faceQuality, bodyQuality, preference };
  });

  // Build indexed array for stable sort
  const indexed = scored.map((s, i) => ({ index: i, ...s }));
  indexed.sort((a, b) => b.preference - a.preference);

  const result = new Array<"face" | "body">(total);
  indexed.forEach((item, rank) => {
    result[item.index] = rank < portraitCount ? "face" : "body";
  });

  return result;
}
