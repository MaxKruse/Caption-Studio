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
 */
function computeBoxQuality(boxes: BoundingBox[]): number {
  if (boxes.length === 0) return 0;
  const largest = boxes.reduce((max, bb) => {
    const area = (bb.bbox_2d[2] - bb.bbox_2d[0]) * (bb.bbox_2d[3] - bb.bbox_2d[1]);
    const maxArea = (max.bbox_2d[2] - max.bbox_2d[0]) * (max.bbox_2d[3] - max.bbox_2d[1]);
    return area > maxArea ? bb : max;
  });
  const area = (largest.bbox_2d[2] - largest.bbox_2d[0]) * (largest.bbox_2d[3] - largest.bbox_2d[1]);
  return Math.min(1, area / 100000);
}

/**
 * Allocate crop types to images based on detection quality and ruleset ratio.
 */
function allocateCropTypes(
  detections: Array<{ faceBoxes: BoundingBox[]; bodyBoxes: BoundingBox[] }>,
  portraitRatio: number
): ("face" | "body")[] {
  const total = detections.length;
  const portraitCount = Math.round(total * portraitRatio);

  const scored = detections.map((d, i) => {
    const faceQuality = computeBoxQuality(d.faceBoxes);
    const bodyQuality = computeBoxQuality(d.bodyBoxes);
    const preference = faceQuality - bodyQuality;
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

  // -----------------------------------------------------------------------
  // Set ruleset
  // -----------------------------------------------------------------------
  const setRuleset = useCallback((ruleset: (typeof CROP_RULESETS)[0]) => {
    setState((prev) => ({ ...prev, ruleset }));
  }, []);

  // -----------------------------------------------------------------------
  // Set detection results
  // -----------------------------------------------------------------------
  const setDetectionResults = useCallback((results: DetectionResult[]) => {
    setState((prev) => ({
      ...prev,
      isDetecting: false,
      detections: results,
      detectionError: results.some((r) => r.error)
        ? `${results.filter((r) => r.error).length} image(s) failed detection`
        : null,
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Auto-assign crops
  // -----------------------------------------------------------------------
  const autoAssignCrops = useCallback(() => {
    setState((prev) => {
      if (prev.detections.length === 0) return prev;
      if (!prev.ruleset) return prev;

      const cropTypes = allocateCropTypes(prev.detections, prev.ruleset.portraitRatio);

      const crops: ImageCrop[] = prev.detections.map((detection, i) => {
        const type = cropTypes[i];
        const padding = type === "face" ? FACE_CROP_PADDING : BODY_CROP_PADDING;
        const boxes = type === "face" ? detection.faceBoxes : detection.bodyBoxes;
        const cropRect = buildCropRectFromBestBox(boxes, padding);

        return {
          imageIndex: i,
          imageName: imageNames[i] ?? detection.imageName ?? `image_${i}`,
          cropType: type,
          cropRect: cropRect ?? buildDefaultCrop(),
          autoDetected: cropRect !== null,
        };
      });

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
