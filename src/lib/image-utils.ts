/**
 * Image format utilities - ensures images sent to OpenAI are PNG or JPEG.
 * OpenAI's vision API only accepts these two formats via data URLs.
 */

import sharp from "sharp";

// Extensions that OpenAI accepts without conversion
const OPENAI_ACCEPTED = new Set(["png", "jpg", "jpeg"]);

/**
 * Returns the file extension (lowercase, no dot) from a filename.
 */
export function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

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
 * Ensures the image data is in an OpenAI-compatible format.
 * If the file is already PNG or JPEG, returns the original buffer and MIME type.
 * Otherwise, converts to JPEG.
 */
export async function ensureOpenaiCompatible(
  filename: string,
  imageBuffer: Buffer
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!needsConversion(filename)) {
    const ext = getExtension(filename);
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";
    return { buffer: imageBuffer, mimeType };
  }

  return convertToJpeg(imageBuffer);
}
