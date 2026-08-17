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
 * Default max dimension for images sent to the vision API.
 *
 * 1536px keeps the vision token count within llama.cpp's default
 * --image-max-tokens (8192) for common 12B vision models, so the server
 * does not truncate the image after we already paid for the transfer and
 * prefill. Higher values are possible via the per-request override in
 * prepareForApi (or by raising --image-max-tokens on the server).
 */
export const API_MAX_DIMENSION = 1536;

/**
 * Ensures the image data is in an OpenAI-compatible format
 * AND resizes it if the biggest dimension exceeds the API limit.
 * If the file is already PNG or JPEG and within size limits, returns as-is.
 * Otherwise, resizes and converts to JPEG.
 *
 * `maxDimension` overrides the default (API_MAX_DIMENSION) for requests
 * that need more detail, e.g. when the server runs a higher
 * --image-max-tokens.
 */
export async function prepareForApi(
  filename: string,
  imageBuffer: Buffer,
  maxDimension: number = API_MAX_DIMENSION
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Single metadata parse: resizing through resizeIfNeeded would
  // re-decode the buffer header a second time.
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const biggest = Math.max(width, height);

  if (biggest <= maxDimension && !needsConversion(filename)) {
    const ext = getExtension(filename);
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";
    return { buffer: imageBuffer, mimeType };
  }

  if (biggest <= maxDimension) {
    // Right size, wrong format - just convert
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
 * Validates image dimensions before loading into Sharp to avoid decompression bombs.
 * Throws if width or height exceeds limits.
 */
export async function validateImageDimensions(
  imageBuffer: Buffer,
  maxWidth: number,
  maxHeight: number
): Promise<void> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width > maxWidth) {
    throw new Error(`Image width ${width} exceeds max width ${maxWidth}`);
  }
  if (height > maxHeight) {
    throw new Error(`Image height ${height} exceeds max height ${maxHeight}`);
  }
}
