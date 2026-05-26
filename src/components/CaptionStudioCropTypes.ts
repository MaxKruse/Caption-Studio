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
 * "portrait" = face-focused crop (uses face bounding box)
 * "body" = full-body/pose crop (uses body bounding box or full image)
 */
export type CropType = "portrait" | "body";

/**
 * Crop rectangle in 1000-normalized coordinates (same as OpenAI bounding boxes).
 */
export type CropRect = { x: number; y: number; width: number; height: number };

/**
 * Crop configuration for a single image.
 * Every image has BOTH a face crop and a body crop.
 * Coordinates are 1000-normalized (same as OpenAI bounding boxes).
 */
export interface ImageCrop {
  imageIndex: number;
  imageName: string;
  /** Face/portrait crop rectangle. If no face detected, defaults to full image. */
  faceCrop: CropRect;
  /** Body/full-body crop rectangle. If no body detected, defaults to full image. */
  bodyCrop: CropRect;
  /** Whether the face crop was auto-detected (true) or manually adjusted (false). */
  faceAutoDetected: boolean;
  /** Whether the body crop was auto-detected (true) or manually adjusted (false). */
  bodyAutoDetected: boolean;
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
  done?: boolean;
}

/** SSE handlers returned by the hook for attaching to an EventSource. */
export interface DetectionSSEHandlers {
  onMessage: (event: MessageEvent) => void;
  onDone: () => void;
  onError: () => void;
}

export interface UseCropDetectionReturn {
  /** Current crop state. */
  state: CropState;
  /** Current detection progress (from SSE). */
  detectionProgress: DetectionProgress;
  /** Selected image index for editing. */
  selectedImageIndex: number;
  /** Set the selected image index. */
  setSelectedImageIndex: (index: number) => void;
  /** Set the active ruleset. */
  setRuleset: (ruleset: CropRuleset) => void;
  /** Set detection results from API response. */
  setDetectionResults: (results: DetectionResult[]) => void;
  /** Update crop for a specific image (face or body crop). */
  updateCrop: (imageIndex: number, cropTarget: "face" | "body", rect: Partial<CropRect>) => void;
  /** Apply auto-assignment based on current ruleset and detections. */
  autoAssignCrops: () => void;
  /** Reset all crop state. */
  reset: () => void;
  /** Get final crop data to pass to the caption job. */
  getFinalCrops: () => ImageCrop[];
  /** Whether there are any crops configured. */
  hasCrops: boolean;
  /** SSE handlers to attach to an EventSource for detection progress. */
  getSSEHandlers: () => DetectionSSEHandlers;
}
