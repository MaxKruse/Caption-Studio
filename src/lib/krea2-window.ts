/**
 * Sliding window computation for Krea 2 re-captioning.
 * Divides N images into overlapping windows of fixed size.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default window size for re-captioning buckets. */
export const DEFAULT_WINDOW_SIZE = 8;

/** Default step between windows (overlap = windowSize - step). */
export const DEFAULT_WINDOW_STEP = 4;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute sliding window indices for re-captioning.
 *
 * Each window is an array of global image indices to process together.
 * Windows overlap: consecutive windows share (windowSize - step) indices.
 *
 * @param totalImages - Total number of images
 * @param windowSize - Number of images per window (default 8)
 * @param step - Step between consecutive window starts (default 4)
 * @returns Array of windows, each window is an array of image indices
 *
 * @example
 *   computeSlidingWindows(12) // size=8, step=4
 *   → [[0,1,2,3,4,5,6,7], [4,5,6,7,8,9,10,11]]
 *
 *   computeSlidingWindows(20)
 *   → [[0..7], [4..11], [8..15], [12..19]]
 */
export function computeSlidingWindows(
  totalImages: number,
  windowSize: number = DEFAULT_WINDOW_SIZE,
  step: number = DEFAULT_WINDOW_STEP
): number[][] {
  const windows: number[][] = [];

  if (totalImages <= 0) return windows;

  for (let start = 0; start < totalImages; start += step) {
    const end = Math.min(start + windowSize, totalImages);
    const indices: number[] = [];
    for (let i = start; i < end; i++) {
      indices.push(i);
    }
    windows.push(indices);

    // If we've covered all images, stop
    if (end >= totalImages) break;
  }

  return windows;
}
