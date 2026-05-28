import { useCallback, useMemo, useRef, useState } from "react";
import { CROP_RULESETS } from "../CaptionStudioCropConstants";
import type {
  BoundingBox,
  CropRuleset,
  CropState,
  DetectionImageStatus,
  DetectionProgress,
  DetectionResult,
  ImageCrop,
  RulesetValidation,
  UseCropDetectionOptions,
  UseCropDetectionReturn,
} from "../CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Default crop state factory
// ---------------------------------------------------------------------------

function createEmptyState(): CropState {
  return {
    ruleset: null,
    detections: [],
    crops: [],
    isDetecting: false,
    detectionError: null,
  };
}

// ---------------------------------------------------------------------------
// Auto-assignment logic
// ---------------------------------------------------------------------------

/** Extra padding for face crops — LLMs return tight face boxes. */
const FACE_CROP_PADDING = 0.25;
/** No extra padding for body crops — LLM body boxes are already well-sized. */
const BODY_CROP_PADDING = 0;

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
 * Compute a quality score for bounding boxes (0-1 range).
 * Uses the highest confidence score — reflects visual importance
 * (SFW: face importance, NSFW: body importance), not just box size.
 */
export function computeBoxQuality(boxes: BoundingBox[]): number {
  if (boxes.length === 0) return 0;
  return Math.max(...boxes.map((bb) => bb.confidence));
}

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

  const scored = detections.map((d, i) => {
    const faceQuality = computeBoxQuality(d.faceBoxes);
    const bodyQuality = computeBoxQuality(d.bodyBoxes);
    // Round to 2 decimals to avoid floating-point sort instability
    // (confidence scores are given to 2 decimal places)
    const preference = Math.round((faceQuality - bodyQuality) * 100) / 100;
    return { index: i, faceQuality, bodyQuality, preference };
  });

  scored.sort((a, b) => b.preference - a.preference);

  const result = new Array<"face" | "body">(total);
  scored.forEach((item, rank) => {
    result[item.index] = rank < portraitCount ? "face" : "body";
  });

  return result;
}

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
 * Build a default full-image crop (when no detection available).
 */
export function buildDefaultCrop(): { x: number; y: number; width: number; height: number } {
  const margin = 20;
  return { x: margin, y: margin, width: 1000 - margin * 2, height: 1000 - margin * 2 };
}

// ---------------------------------------------------------------------------
// Ruleset validation
// ---------------------------------------------------------------------------

function validateRuleset(
  crops: ImageCrop[],
  ruleset: CropRuleset | null
): RulesetValidation {
  if (!ruleset || crops.length === 0) {
    return {
      valid: crops.length === 0,
      faceCount: 0,
      bodyCount: 0,
      expectedFaceRange: [0, 0],
      expectedBodyRange: [0, 0],
    };
  }

  const faceCount = crops.filter((c) => c.cropType === "face").length;
  const bodyCount = crops.length - faceCount;
  const total = crops.length;

  // Calculate acceptable ranges with ±1 tolerance
  const exactFace = Math.round(total * ruleset.portraitRatio);
  const faceMin = Math.max(0, exactFace - 1);
  const faceMax = Math.min(total, exactFace + 1);
  const bodyMin = total - faceMax;
  const bodyMax = total - faceMin;

  return {
    valid: faceCount >= faceMin && faceCount <= faceMax,
    faceCount,
    bodyCount,
    expectedFaceRange: [faceMin, faceMax],
    expectedBodyRange: [bodyMin, bodyMax],
  };
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
//
// ARCHITECTURE NOTE: This hook uses mutable refs (not just useState) for its
// core state. This is intentional and solves a critical bug:
//
// When the SSE "done" handler fires, it calls setDetectionResults() and
// autoAssignCrops() (both trigger setState), then IMMEDIATELY reads
// getFinalCrops() to check if crops are valid. With pure useState, the state
// isn't updated until the next render — so getFinalCrops() returns stale data.
//
// The ref pattern ensures state is ALWAYS immediately readable:
//   1. setState updates stateRef.current synchronously
//   2. setState calls forceRender() to schedule a React re-render
//   3. Any synchronous read (getFinalCrops(), state.detections, etc.) gets
//      the latest value from the ref
//   4. React re-renders on the next microtask, updating the UI
//
// The return object uses getters so consumers always read live ref values.
//

/* eslint-disable react-hooks/refs -- Ref access during render is intentional:
   stateRef.current is read to provide immediately-updated state to consumers.
   This is safe because ref updates always create new objects (no mutation),
   and forceRender() ensures React re-renders on the next cycle. */
export function useCropDetection({
  imageNames,
}: UseCropDetectionOptions): UseCropDetectionReturn {
  const stateRef = useRef<CropState>(createEmptyState());
  const [, forceRender] = useState(0);

  const detectionProgressRef = useRef<DetectionProgress>({
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const detectionStatusesRef = useRef<Record<string, DetectionImageStatus>>({});
  const skippedImagesRef = useRef<string[]>([]);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Live state — always reflects the latest ref value
  const state = stateRef.current;

  // -----------------------------------------------------------------------
  // Set ruleset
  // -----------------------------------------------------------------------
  const setRuleset = useCallback((ruleset: (typeof CROP_RULESETS)[0]) => {
    stateRef.current = { ...stateRef.current, ruleset };
    forceRender((v) => v + 1);
  }, []);

  // -----------------------------------------------------------------------
  // Low-confidence detection warning
  // -----------------------------------------------------------------------
  const CONFIDENCE_WARNING_THRESHOLD = 0.60;

  function buildLowConfidenceWarning(
    results: DetectionResult[]
  ): string | null {
    const validResults = results.filter((r) => !r.error);
    if (validResults.length === 0) return null;

    const categories: Array<{ name: string; avgConfidence: number; count: number }> = [];

    // Compute average face confidence
    const faceConfidences = validResults.flatMap((r) => r.faceBoxes.map((b) => b.confidence));
    if (faceConfidences.length > 0) {
      const avg = faceConfidences.reduce((sum, c) => sum + c, 0) / faceConfidences.length;
      categories.push({ name: "face", avgConfidence: avg, count: faceConfidences.length });
    }

    // Compute average body confidence
    const bodyConfidences = validResults.flatMap((r) => r.bodyBoxes.map((b) => b.confidence));
    if (bodyConfidences.length > 0) {
      const avg = bodyConfidences.reduce((sum, c) => sum + c, 0) / bodyConfidences.length;
      categories.push({ name: "body", avgConfidence: avg, count: bodyConfidences.length });
    }

    const lowConfidence = categories.filter((c) => c.avgConfidence < CONFIDENCE_WARNING_THRESHOLD);
    if (lowConfidence.length === 0) return null;

    const parts = lowConfidence.map((c) =>
      `${c.name} (avg ${(c.avgConfidence * 100).toFixed(0)}% across ${c.count} detection(s))`
    );
    return `Low detection confidence for: ${parts.join(", ")}. The body/face crop split will still be respected, but consider using images with clearer ${lowConfidence.map((c) => c.name).join("/")} visibility for better results.`;
  }

  // -----------------------------------------------------------------------
  // Set detection results
  // -----------------------------------------------------------------------
  const setDetectionResults = useCallback((results: DetectionResult[]) => {
    // Track skipped images
    const skipped = results
      .filter((r) => r.error && (r.error.includes("permanently") || r.error.includes("skipped")))
      .map((r) => r.imageName);
    skippedImagesRef.current = skipped;

    // Check for low confidence scores
    const lowConfWarning = buildLowConfidenceWarning(results);

    const hasErrors = results.some((r) => r.error);
    const hasSkipped = skipped.length > 0;
    let detectionError: string | null = null;

    if (hasSkipped) {
      detectionError = `${skipped.length} image(s) failed detection — set their crop boxes manually: ${skipped.join(", ")}`;
    } else if (hasErrors) {
      detectionError = `${results.filter((r) => r.error).length} image(s) had detection issues`;
    }

    // Prepend low-confidence warning if present
    if (lowConfWarning) {
      detectionError = lowConfWarning + (detectionError ? `\n${detectionError}` : "");
    }

    // Update ref directly — immediately readable
    stateRef.current = {
      ...stateRef.current,
      isDetecting: false,
      detections: results,
      detectionError,
    };
    forceRender((v) => v + 1);
  }, []);

  // -----------------------------------------------------------------------
  // Auto-assign crops (includes failed-detection images with default crop)
  // -----------------------------------------------------------------------
  const autoAssignCrops = useCallback(() => {
    const prev = stateRef.current;
    if (prev.detections.length === 0) return;
    if (!prev.ruleset) return;

    // Filter out detections that have errors (failed/skipped)
    const validDetections = prev.detections.filter((d) => !d.error);

    // Allocate crop types for valid detections
    const cropTypes = validDetections.length > 0
      ? allocateCropTypes(validDetections, prev.ruleset.portraitRatio)
      : [];

    // Build a set of skipped image names for quick lookup
    const skippedNames = new Set(
      prev.detections.filter((d) => d.error).map((d) => d.imageName)
    );

    // Build crops for ALL images — failed detections get a default full-image crop
    const crops: ImageCrop[] = [];
    let validIndex = 0;

    for (let i = 0; i < prev.detections.length; i++) {
      const detection = prev.detections[i];

      if (skippedNames.has(detection.imageName)) {
        // Failed detection — assign default full-image crop so user can manually adjust
        crops.push({
          imageIndex: detection.imageIndex,
          imageName: imageNames[detection.imageIndex] ?? detection.imageName ?? `image_${detection.imageIndex}`,
          cropType: "face",
          cropRect: buildDefaultCrop(),
          autoDetected: false,
        });
        continue;
      }

      const type = cropTypes[validIndex];
      const padding = type === "face" ? FACE_CROP_PADDING : BODY_CROP_PADDING;
      const boxes = type === "face" ? detection.faceBoxes : detection.bodyBoxes;
      const cropRect = buildCropRectFromBestBox(boxes, padding);

      crops.push({
        imageIndex: detection.imageIndex,
        imageName: imageNames[detection.imageIndex] ?? detection.imageName ?? `image_${detection.imageIndex}`,
        cropType: type,
        cropRect: cropRect ?? buildDefaultCrop(),
        autoDetected: cropRect !== null,
      });
      validIndex++;
    }

    // Update ref directly — immediately readable
    stateRef.current = { ...prev, crops };
    forceRender((v) => v + 1);
  }, [imageNames]);

  // -----------------------------------------------------------------------
  // Set crop type for a single image
  // -----------------------------------------------------------------------
  const setCropType = useCallback((imageIndex: number, cropType: "face" | "body") => {
    const prev = stateRef.current;
    const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
    if (cropIndex === -1) return;

    const existing = prev.crops[cropIndex];
    const updatedCrops = [...prev.crops];
    updatedCrops[cropIndex] = {
      ...existing,
      cropType,
      autoDetected: false,
    };

    stateRef.current = { ...prev, crops: updatedCrops };
    forceRender((v) => v + 1);
  }, []);

  // -----------------------------------------------------------------------
  // Update crop rectangle for a single image
  // -----------------------------------------------------------------------
  const updateCropRect = useCallback((imageIndex: number, partial: Partial<{ x: number; y: number; width: number; height: number }>) => {
    const prev = stateRef.current;
    const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
    if (cropIndex === -1) return;

    const existing = prev.crops[cropIndex];
    const updatedCrops = [...prev.crops];
    updatedCrops[cropIndex] = {
      ...existing,
      cropRect: { ...existing.cropRect, ...partial },
      autoDetected: false,
    };

    stateRef.current = { ...prev, crops: updatedCrops };
    forceRender((v) => v + 1);
  }, []);

  // -----------------------------------------------------------------------
  // Reset a single image's crop
  // -----------------------------------------------------------------------
  const resetCrop = useCallback((imageIndex: number) => {
    const prev = stateRef.current;
    const detectionIndex = prev.detections.findIndex((d) => d.imageIndex === imageIndex);
    if (detectionIndex === -1) return;
    const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
    if (cropIndex === -1) return;

    const detection = prev.detections[detectionIndex];
    const existing = prev.crops[cropIndex];

    // Reset to the crop matching the current type
    const padding = existing.cropType === "face" ? FACE_CROP_PADDING : BODY_CROP_PADDING;
    const boxes = existing.cropType === "face" ? detection.faceBoxes : detection.bodyBoxes;
    const cropRect = buildCropRectFromBestBox(boxes, padding);

    const updatedCrops = [...prev.crops];
    updatedCrops[cropIndex] = {
      ...existing,
      cropRect: cropRect ?? buildDefaultCrop(),
      autoDetected: cropRect !== null,
    };

    stateRef.current = { ...prev, crops: updatedCrops };
    forceRender((v) => v + 1);
  }, []);

  // -----------------------------------------------------------------------
  // Validate ruleset
  // -----------------------------------------------------------------------
  const validation = useMemo(() => validateRuleset(state.crops, state.ruleset), [state.crops, state.ruleset]);

  const validateRulesetFn = useCallback(() => validation, [validation]);

  // -----------------------------------------------------------------------
  // Get final crops — reads from ref (always current)
  // -----------------------------------------------------------------------
  const getFinalCrops = useCallback(() => stateRef.current.crops, []);

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    stateRef.current = createEmptyState();
    detectionProgressRef.current = { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 };
    detectionStatusesRef.current = {};
    skippedImagesRef.current = [];
    setSelectedImageIndex(0);
    forceRender((v) => v + 1);
  }, []);

  // -----------------------------------------------------------------------
  // SSE handlers
  // -----------------------------------------------------------------------
  // SSE handlers use direct ref access — no stale closure issues.
  const getSSEHandlers = useCallback(() => {
    const onMessage = (event: MessageEvent) => {
      const data: DetectionProgress & { done?: boolean; statuses?: Record<string, DetectionImageStatus> } = JSON.parse(event.data);
      detectionProgressRef.current = {
        total: data.total ?? 0,
        queued: data.queued ?? 0,
        processing: data.processing ?? 0,
        completed: data.completed ?? 0,
        failed: data.failed ?? 0,
        done: data.done,
      };
      if (data.statuses) {
        detectionStatusesRef.current = data.statuses;
      }
      if (data.done) {
        stateRef.current = { ...stateRef.current, isDetecting: false };
      }
      forceRender((v) => v + 1);
    };

    const onDone = () => {};
    const onError = () => {
      stateRef.current = {
        ...stateRef.current,
        isDetecting: false,
        detectionError: "SSE connection lost",
      };
      forceRender((v) => v + 1);
    };

    return { onMessage, onDone, onError };
  }, []);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  // Note: `hasCrops` is computed from stateRef.current in the return object
  // below, so it always reads the latest value without waiting for re-render.

  // Return object with getters for live ref access.
  // Properties like `state`, `detectionProgress`, `hasCrops` use getters
  // so they always read the latest ref value — no stale closure issues.
  return {
    get state() { return stateRef.current; },
    get detectionProgress() { return detectionProgressRef.current; },
    get detectionStatuses() { return detectionStatusesRef.current; },
    get skippedImages() { return skippedImagesRef.current; },
    get hasCrops() { return stateRef.current.crops.length > 0; },
    get rulesetValid() { return validation.valid; },
    selectedImageIndex,
    setSelectedImageIndex,
    setRuleset,
    setDetectionResults,
    autoAssignCrops,
    setCropType,
    updateCropRect,
    resetCrop,
    reset,
    getFinalCrops,
    validateRuleset: validateRulesetFn,
    getSSEHandlers,
  };
}
/* eslint-enable react-hooks/refs */
