/**
 * Client-side image utilities — runs in the browser only.
 * Used to resize uploaded images before storing/sending them.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max dimension for images stored in memory and sent to the server. */
export const CLIENT_MAX_DIMENSION = 1440;

/** Max dimension for gallery thumbnail previews (keeps memory low). */
export const THUMBNAIL_MAX_DIMENSION = 480;

/** JPEG quality for resized images (0–1). */
const RESIZE_QUALITY = 0.92;

/** JPEG quality for small gallery thumbnails. */
const THUMBNAIL_QUALITY = 0.7;

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

/**
 * Resizes an image data URL so its biggest dimension does not exceed
 * `maxDimension`. Uses canvas for lossy JPEG encoding.
 * Returns a new data URL (JPEG).
 *
 * Yields to the main thread before the expensive `toDataURL` call so the
 * browser can paint between frames — prevents UI freezes when processing
 * many large images concurrently.
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

      // Yield to the main thread before the expensive toDataURL call
      queueMicrotask(() => {
        try {
          const resizedUrl = canvas.toDataURL("image/jpeg", RESIZE_QUALITY);
          resolve(resizedUrl);
        } catch (err) {
          reject(err);
        }
      });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

/**
 * Creates a small thumbnail data URL for gallery display.
 * Much smaller than the full preview to keep memory usage low.
 */
export function createThumbnail(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const { width, height } = img;
      const biggest = Math.max(width, height);

      // Small images — just use the object URL directly (no resize needed)
      if (biggest <= THUMBNAIL_MAX_DIMENSION) {
        // Convert to a data URL for consistency
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        queueMicrotask(() => {
          try {
            resolve(canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY));
          } catch (err) {
            reject(err);
          }
        });
        return;
      }

      const scale = THUMBNAIL_MAX_DIMENSION / biggest;
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
      URL.revokeObjectURL(url);

      // Yield to main thread before expensive toDataURL
      queueMicrotask(() => {
        try {
          resolve(canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY));
        } catch (err) {
          reject(err);
        }
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}
