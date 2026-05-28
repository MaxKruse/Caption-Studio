// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const TOAST_DURATION = 4000;

// ---------------------------------------------------------------------------
// Image count guidance for character captioning (LoRA training)
// ---------------------------------------------------------------------------

/** Sweet spot range for character dataset images. */
export const IMAGE_COUNT_SWEET_SPOT_MIN = 10;
export const IMAGE_COUNT_SWEET_SPOT_MAX = 20;

/** Warning threshold — shown when user exceeds this count. */
export const IMAGE_COUNT_WARNING_THRESHOLD = 25;

/** Recommended portrait vs full-body ratio (80% portrait / 20% body). */
export const PORTRAIT_RATIO_PERCENT = 80;
