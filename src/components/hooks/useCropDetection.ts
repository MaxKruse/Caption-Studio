import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
function buildCropRectFromBestBox(
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
function buildCropRectFromBox(
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
function buildDefaultCrop(): { x: number; y: number; width: number; height: number } {
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

export function useCropDetection({
  imageNames,
}: UseCropDetectionOptions): UseCropDetectionReturn {
  const [state, setState] = useState<CropState>(createEmptyState);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [detectionProgress, setDetectionProgress] = useState<DetectionProgress>({
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [detectionStatuses, setDetectionStatuses] = useState<Record<string, DetectionImageStatus>>({});
  const [skippedImages, setSkippedImages] = useState<string[]>([]);

  // -----------------------------------------------------------------------
  // Set ruleset
  // -----------------------------------------------------------------------
  const setRuleset = useCallback((ruleset: (typeof CROP_RULESETS)[0]) => {
    setState((prev) => ({ ...prev, ruleset }));
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
    setSkippedImages(skipped);

    // Check for low confidence scores
    const lowConfWarning = buildLowConfidenceWarning(results);

    setState((prev) => {
      const hasErrors = results.some((r) => r.error);
      const hasSkipped = skipped.length > 0;
      let detectionError: string | null = null;

      if (hasSkipped) {
        detectionError = `${skipped.length} image(s) skipped after failed detection (will be omitted from crops): ${skipped.join(", ")}`;
      } else if (hasErrors) {
        detectionError = `${results.filter((r) => r.error).length} image(s) had detection issues`;
      }

      // Prepend low-confidence warning if present
      if (lowConfWarning) {
        detectionError = lowConfWarning + (detectionError ? `\n${detectionError}` : "");
      }

      return {
        ...prev,
        isDetecting: false,
        detections: results,
        detectionError,
      };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Auto-assign crops (skips images that failed detection)
  // -----------------------------------------------------------------------
  const autoAssignCrops = useCallback(() => {
    setState((prev) => {
      if (prev.detections.length === 0) return prev;
      if (!prev.ruleset) return prev;

      // Filter out detections that have errors (failed/skipped)
      const validDetections = prev.detections.filter((d) => !d.error);
      if (validDetections.length === 0) return prev;

      const cropTypes = allocateCropTypes(validDetections, prev.ruleset.portraitRatio);

      // Build a set of skipped image names for quick lookup
      const skippedNames = new Set(
        prev.detections.filter((d) => d.error).map((d) => d.imageName)
      );

      // Build crops only for valid (non-skipped) detections
      const crops: ImageCrop[] = [];
      let validIndex = 0;

      for (let i = 0; i < prev.detections.length; i++) {
        const detection = prev.detections[i];
        if (skippedNames.has(detection.imageName)) continue;

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

      return { ...prev, crops };
    });
  }, [imageNames]);

  // -----------------------------------------------------------------------
  // Set crop type for a single image
  // -----------------------------------------------------------------------
  const setCropType = useCallback((imageIndex: number, cropType: "face" | "body") => {
    setState((prev) => {
      const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
      if (cropIndex === -1) return prev;

      const existing = prev.crops[cropIndex];
      const updatedCrops = [...prev.crops];
      updatedCrops[cropIndex] = {
        ...existing,
        cropType,
        autoDetected: false,
      };

      return { ...prev, crops: updatedCrops };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Update crop rectangle for a single image
  // -----------------------------------------------------------------------
  const updateCropRect = useCallback((imageIndex: number, partial: Partial<{ x: number; y: number; width: number; height: number }>) => {
    setState((prev) => {
      const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
      if (cropIndex === -1) return prev;

      const existing = prev.crops[cropIndex];
      const updatedCrops = [...prev.crops];
      updatedCrops[cropIndex] = {
        ...existing,
        cropRect: { ...existing.cropRect, ...partial },
        autoDetected: false,
      };

      return { ...prev, crops: updatedCrops };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Reset a single image's crop
  // -----------------------------------------------------------------------
  const resetCrop = useCallback((imageIndex: number) => {
    setState((prev) => {
      const detectionIndex = prev.detections.findIndex((d) => d.imageIndex === imageIndex);
      if (detectionIndex === -1) return prev;
      const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
      if (cropIndex === -1) return prev;

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

      return { ...prev, crops: updatedCrops };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Validate ruleset
  // -----------------------------------------------------------------------
  const validation = useMemo(() => validateRuleset(state.crops, state.ruleset), [state.crops, state.ruleset]);
  const rulesetValid = validation.valid;

  const validateRulesetFn = useCallback(() => validation, [validation]);

  // -----------------------------------------------------------------------
  // Get final crops
  // -----------------------------------------------------------------------
  const getFinalCrops = useCallback(() => state.crops, [state.crops]);

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    setState(createEmptyState());
    setSelectedImageIndex(0);
    setDetectionProgress({ total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });
    setDetectionStatuses({});
    setSkippedImages([]);
  }, []);

  // -----------------------------------------------------------------------
  // SSE handlers
  // -----------------------------------------------------------------------
  const setProgressRef = useRef(setDetectionProgress);
  useEffect(() => { setProgressRef.current = setDetectionProgress; }, [setDetectionProgress]);
  const setStatusesRef = useRef(setDetectionStatuses);
  useEffect(() => { setStatusesRef.current = setDetectionStatuses; }, [setDetectionStatuses]);
  const setStateRef = useRef(setState);
  useEffect(() => { setStateRef.current = setState; }, [setState]);

  const getSSEHandlers = useCallback(() => {
    const onMessage = (event: MessageEvent) => {
      const data: DetectionProgress & { done?: boolean; statuses?: Record<string, DetectionImageStatus> } = JSON.parse(event.data);
      setProgressRef.current({
        total: data.total ?? 0,
        queued: data.queued ?? 0,
        processing: data.processing ?? 0,
        completed: data.completed ?? 0,
        failed: data.failed ?? 0,
        done: data.done,
      });
      if (data.statuses) {
        setStatusesRef.current(data.statuses);
      }
      if (data.done) {
        setStateRef.current((prev) => ({ ...prev, isDetecting: false }));
      }
    };

    const onDone = () => {};
    const onError = () => {
      setStateRef.current((prev) => ({
        ...prev,
        isDetecting: false,
        detectionError: "SSE connection lost",
      }));
    };

    return { onMessage, onDone, onError };
  }, []);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const hasCrops = useMemo(() => state.crops.length > 0, [state.crops.length]);

  return {
    state,
    detectionProgress,
    detectionStatuses,
    skippedImages,
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
    hasCrops,
    rulesetValid,
    validateRuleset: validateRulesetFn,
    getSSEHandlers,
  };
}
