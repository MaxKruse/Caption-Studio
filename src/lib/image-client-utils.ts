/**
 * Client-side image utilities — runs in the browser only.
 * Used to resize uploaded images before storing/sending them.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max dimension for images stored in memory and sent to the server. */
export const CLIENT_MAX_DIMENSION = 1440;

/** JPEG quality for resized images (0–1). */
const RESIZE_QUALITY = 0.92;

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

/**
 * Resizes an image data URL so its biggest dimension does not exceed
 * `maxDimension`. Uses canvas for lossy JPEG encoding.
 * Returns a new data URL (JPEG).
 */
export function resizeImage(
  dataUrl: string,
  maxDimension: number = CLIENT_MAX_DIMENSION
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const biggest = Math.max(width, height);

      // Already within limits
      if (biggest <= maxDimension) {
        resolve(dataUrl);
        return;
      }

      const scale = maxDimension / biggest;
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      try {
        const resizedUrl = canvas.toDataURL("image/jpeg", RESIZE_QUALITY);
        resolve(resizedUrl);
      } finally {
        // Clean up
        URL.revokeObjectURL(img.src);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}
