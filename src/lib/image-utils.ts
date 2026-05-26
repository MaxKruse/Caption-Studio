/**
 * Image format utilities - ensures images sent to OpenAI are PNG or JPEG.
 * OpenAI's vision API only accepts these two formats via data URLs.
 */

import sharp from "sharp";

import { getExtension } from "./string-utils";

export { getExtension };

// Extensions that OpenAI accepts without conversion
const OPENAI_ACCEPTED = new Set(["png", "jpg", "jpeg"]);

/**
 * Checks if an image needs to be converted to JPEG for OpenAI compatibility.
 */
export function needsConversion(filename: string): boolean {
  return !OPENAI_ACCEPTED.has(getExtension(filename));
}

/**
 * Converts an image buffer to JPEG format.
 * Preserves original resolution and uses high quality (90/100).
 * Returns { buffer, mimeType } for use in data URLs.
 */
export async function convertToJpeg(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const jpegBuffer = await sharp(imageBuffer)
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    buffer: jpegBuffer,
    mimeType: "image/jpeg",
  };
}

/**
 * Max dimension for images sent to the OpenAI vision API.
 * (2048 + 1024 = 3072) — covers most vision model limits.
 */
export const API_MAX_DIMENSION = 3072;

/**
 * Resizes an image buffer so its biggest dimension does not exceed `maxDimension`.
 * Returns the original buffer if already within limits.
 * Uses JPEG output (quality 90) to ensure OpenAI compatibility.
 */
export async function resizeIfNeeded(
  imageBuffer: Buffer,
  maxDimension: number
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const biggest = Math.max(width, height);

  if (biggest <= maxDimension) {
    // Already small enough — still convert to JPEG for safe OpenAI delivery
    return convertToJpeg(imageBuffer);
  }

  const resized = await sharp(imageBuffer)
    .resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer: resized, mimeType: "image/jpeg" };
}

/**
 * Ensures the image data is in an OpenAI-compatible format
 * AND resizes it if the biggest dimension exceeds the API limit.
 * If the file is already PNG or JPEG and within size limits, returns as-is.
 * Otherwise, resizes and converts to JPEG.
 */
export async function prepareForApi(
  filename: string,
  imageBuffer: Buffer
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const biggest = Math.max(width, height);

  if (biggest <= API_MAX_DIMENSION && !needsConversion(filename)) {
    const ext = getExtension(filename);
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";
    return { buffer: imageBuffer, mimeType };
  }

  return resizeIfNeeded(imageBuffer, API_MAX_DIMENSION);
}

// ---------------------------------------------------------------------------
// Crop utilities
// ---------------------------------------------------------------------------

/**
 * Crop rectangle in 1000-normalized coordinates (same scale as OpenAI bbox_2d).
 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Detection utilities
// ---------------------------------------------------------------------------

/**
 * Max dimension for images sent to the vision API for detection.
 * Detection (bounding boxes) doesn't need full resolution — 1024px is plenty.
 * This reduces bandwidth and API cost significantly.
 */
export const DETECTION_MAX_DIMENSION = 1024;

/**
 * Prepares an image for detection — scales down to DETECTION_MAX_DIMENSION
 * and converts to JPEG. Coordinates returned by the API (1000-normalized)
 * are resolution-independent, so they apply correctly to the original image.
 */
export async function prepareForDetection(
  imageBuffer: Buffer
): Promise<{ buffer: Buffer; mimeType: string }> {
  const resized = await sharp(imageBuffer)
    .resize(DETECTION_MAX_DIMENSION, DETECTION_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { buffer: resized, mimeType: "image/jpeg" };
}
