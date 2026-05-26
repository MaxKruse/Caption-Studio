// ---------------------------------------------------------------------------
// Crop feature types
// ---------------------------------------------------------------------------

/** App workflow step. */
export type WorkflowStep = "configure" | "upload" | "detect" | "crop" | "caption" | "done";

/**
 * A crop ruleset defines the portrait/body split ratio for a batch of images.
 * E.g., "80/20" means 80% portrait (face-focused) and 20% body (full pose).
 */
export interface CropRuleset {
  id: string;
  label: string;
  portraitRatio: number; // 0-1, fraction of images that should be portrait crops
  description: string;
}

/**
 * A bounding box returned by the vision API (1000-normalized coordinates).
 * Matches OpenAI's bounding_box_2d format.
 */
export interface BoundingBox {
  bbox_2d: [number, number, number, number]; // [x_min, y_min, x_max, y_max] in 1000-normalized coords
  label: string;
}

/**
 * Result of running face/body detection on a single image.
 */
export interface DetectionResult {
  imageIndex: number;
  imageName: string;
  faceBoxes: BoundingBox[];
  bodyBoxes: BoundingBox[];
  error?: string;
}

/**
 * Type of crop assigned to an image.
 */
export type CropType = "face" | "body";

/**
 * Crop rectangle in 1000-normalized coordinates (same as OpenAI bounding boxes).
 */
export type CropRect = { x: number; y: number; width: number; height: number };

/**
 * Single crop configuration for one image.
 * Each image gets exactly ONE crop type and ONE crop rectangle.
 * Coordinates are 1000-normalized (same as OpenAI bounding boxes).
 */
export interface ImageCrop {
  imageIndex: number;
  imageName: string;
  /** Crop type assigned to this image. */
  cropType: CropType;
  /** Crop rectangle (1000-normalized). */
  cropRect: CropRect;
  /** Whether this crop was auto-detected (true) or manually adjusted (false). */
  autoDetected: boolean;
}

/**
 * Complete crop state for the crop editor workflow.
 */
export interface CropState {
  /** Selected ruleset configuration. */
  ruleset: CropRuleset | null;
  /** Detection results from the vision API (one per image). */
  detections: DetectionResult[];
  /** Crop assignments for each image. */
  crops: ImageCrop[];
  /** Whether detection is currently running. */
  isDetecting: boolean;
  /** Error message if detection failed. */
  detectionError: string | null;
}

// ---------------------------------------------------------------------------
// Hook options and return types
// ---------------------------------------------------------------------------

export interface UseCropDetectionOptions {
  /** Number of uploaded images. */
  imageCount: number;
  /** Image names (for detection results). */
  imageNames: string[];
  /** Server URL for the vision API. */
  serverUrl: string;
  /** Model ID for detection (should support bounding boxes). */
  selectedModel: string;
  /** Show toast notification. */
  showToast: (message: string) => void;
}

/** Detection progress from SSE stream. */
export interface DetectionProgress {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  skipped?: number;
  done?: boolean;
}

/** Per-image detection status from SSE stream. */
export type DetectionImageStatus = {
  status: "queued" | "processing" | "completed" | "failed" | "skipped";
  error?: string;
  faceBoxes?: BoundingBox[];
  bodyBoxes?: BoundingBox[];
  retryCount?: number;
};

/** SSE handlers returned by the hook for attaching to an EventSource. */
export interface DetectionSSEHandlers {
  onMessage: (event: MessageEvent) => void;
  onDone: () => void;
  onError: () => void;
}

/** Ruleset validation result. */
export interface RulesetValidation {
  valid: boolean;
  faceCount: number;
  bodyCount: number;
  expectedFaceRange: [number, number]; // [min, max] acceptable face count
  expectedBodyRange: [number, number]; // [min, max] acceptable body count
}

export interface UseCropDetectionReturn {
  /** Current crop state. */
  state: CropState;
  /** Current detection progress (from SSE). */
  detectionProgress: DetectionProgress;
  /** Per-image detection statuses from SSE (name -> status). */
  detectionStatuses: Record<string, DetectionImageStatus>;
  /** List of image names that were skipped due to failed detection. */
  skippedImages: string[];
  /** Selected image index for editing. */
  selectedImageIndex: number;
  /** Set the selected image index. */
  setSelectedImageIndex: (index: number) => void;
  /** Set the active ruleset. */
  setRuleset: (ruleset: CropRuleset) => void;
  /** Set detection results from API response. */
  setDetectionResults: (results: DetectionResult[]) => void;
  /** Change crop type for a single image (toggles face/body). */
  setCropType: (imageIndex: number, cropType: CropType) => void;
  /** Update crop rectangle for a specific image. */
  updateCropRect: (imageIndex: number, rect: Partial<CropRect>) => void;
  /** Reset a single image's crop back to auto-detected defaults. */
  resetCrop: (imageIndex: number) => void;
  /** Apply auto-assignment based on current ruleset and detections. */
  autoAssignCrops: () => void;
  /** Reset all crop state. */
  reset: () => void;
  /** Get final crop data to pass to the caption job. */
  getFinalCrops: () => ImageCrop[];
  /** Whether there are any crops configured. */
  hasCrops: boolean;
  /** Validate current crop counts against ruleset. */
  validateRuleset: () => RulesetValidation;
  /** Whether ruleset validation passes. */
  rulesetValid: boolean;
  /** SSE handlers to attach to an EventSource for detection progress. */
  getSSEHandlers: () => DetectionSSEHandlers;
}
