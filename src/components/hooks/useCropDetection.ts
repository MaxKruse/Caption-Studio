import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CROP_RULESETS } from "../CaptionStudioCropConstants";
import type {
  BoundingBox,
  CropState,
  DetectionProgress,
  DetectionResult,
  ImageCrop,
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

/** Default padding factor for body crops (tight fit). */
const BODY_CROP_PADDING = 0.05;
/** Extra padding for face crops — LLMs return tight face boxes, so expand significantly. */
const FACE_CROP_PADDING = 0.25;

/**
 * Build a crop rectangle from the best bounding box of a given category.
 */
function buildCropRectFromBestBox(
  boxes: BoundingBox[],
  paddingFactor: number
): { x: number; y: number; width: number; height: number } | null {
  if (boxes.length === 0) return null;

  // Pick the box with the largest area
  const largest = boxes.reduce((max, bb) => {
    const area = (bb.bbox_2d[2] - bb.bbox_2d[0]) * (bb.bbox_2d[3] - bb.bbox_2d[1]);
    const maxArea = (max.bbox_2d[2] - max.bbox_2d[0]) * (max.bbox_2d[3] - max.bbox_2d[1]);
    return area > maxArea ? bb : max;
  });

  return buildCropRectFromBox(largest, paddingFactor);
}

/**
 * Compute a quality score for a set of bounding boxes (0-1 range).
 * Based on the largest box's area relative to the full 1000×1000 canvas.
 */
function computeBoxQuality(boxes: BoundingBox[]): number {
  if (boxes.length === 0) return 0;
  const largest = boxes.reduce((max, bb) => {
    const area = (bb.bbox_2d[2] - bb.bbox_2d[0]) * (bb.bbox_2d[3] - bb.bbox_2d[1]);
    const maxArea = (max.bbox_2d[2] - max.bbox_2d[0]) * (max.bbox_2d[3] - max.bbox_2d[1]);
    return area > maxArea ? bb : max;
  });
  const area = (largest.bbox_2d[2] - largest.bbox_2d[0]) * (largest.bbox_2d[3] - largest.bbox_2d[1]);
  // Normalize: 1000×1000 = 1,000,000. A reasonable face is ~50×50 = 2500 (0.0025).
  // Scale so typical detections score 0.5-1.0.
  return Math.min(1, area / 100000);
}

/**
 * Allocate crop types to images based on detection quality and ruleset ratio.
 * Each image gets exactly ONE crop type (face or body).
 */
function allocateCropTypes(
  detections: Array<{ faceBoxes: BoundingBox[]; bodyBoxes: BoundingBox[] }>,
  portraitRatio: number
): ("face" | "body")[] {
  const total = detections.length;
  const portraitCount = Math.round(total * portraitRatio);

  // Score each image: face quality vs body quality
  const scored = detections.map((d, i) => {
    const faceQuality = computeBoxQuality(d.faceBoxes);
    const bodyQuality = computeBoxQuality(d.bodyBoxes);
    // Preference: positive = prefers face, negative = prefers body
    const preference = faceQuality - bodyQuality;
    return { index: i, faceQuality, bodyQuality, preference };
  });

  // Sort by preference (most face-preferring first)
  scored.sort((a, b) => b.preference - a.preference);

  // Allocate: top N get face, rest get body
  const result = new Array<"face" | "body">(total);
  scored.forEach((item, rank) => {
    result[item.index] = rank < portraitCount ? "face" : "body";
  });

  return result;
}

/**
 * Build a crop rectangle from a bounding box, centered on the box.
 * Free aspect ratio — the crop rect starts at the exact box size.
 * paddingFactor: fraction of box size to expand on each side (0.05 = 5%, 0.25 = 25%).
 */
function buildCropRectFromBox(
  box: BoundingBox,
  paddingFactor: number
): { x: number; y: number; width: number; height: number } {
  const bx = box.bbox_2d[0];
  const by = box.bbox_2d[1];
  const bw = box.bbox_2d[2] - bx;
  const bh = box.bbox_2d[3] - by;

  // Add padding so the crop isn't tight on the edge
  const paddingW = bw * paddingFactor;
  const paddingH = bh * paddingFactor;

  let cropX = bx - paddingW;
  let cropY = by - paddingH;
  let cropWidth = bw + paddingW * 2;
  let cropHeight = bh + paddingH * 2;

  // Clamp to image bounds (0-1000)
  if (cropX < 0) { cropX = 0; cropWidth = Math.min(cropWidth + cropX, 1000); }
  if (cropY < 0) { cropY = 0; cropHeight = Math.min(cropHeight + cropY, 1000); }
  if (cropX + cropWidth > 1000) cropWidth = 1000 - cropX;
  if (cropY + cropHeight > 1000) cropHeight = 1000 - cropY;

  return { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
}

/**
 * Build a default full-image crop (for body type or when no detection available).
 */
function buildDefaultCrop(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  // Full image with small margin
  const margin = 20;
  return {
    x: margin,
    y: margin,
    width: 1000 - margin * 2,
    height: 1000 - margin * 2,
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

  // -----------------------------------------------------------------------
  // Set ruleset
  // -----------------------------------------------------------------------
  const setRuleset = useCallback((ruleset: (typeof CROP_RULESETS)[0]) => {
    setState((prev) => ({ ...prev, ruleset }));
  }, []);

  // -----------------------------------------------------------------------
  // Set detection results (called from parent after API response)
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
  // Auto-assign crops — assigns ONE crop type per image based on ruleset + quality
  // -----------------------------------------------------------------------
  const autoAssignCrops = useCallback(() => {
    setState((prev) => {
      if (prev.detections.length === 0) return prev;
      if (!prev.ruleset) return prev;

      // Allocate crop types: each image gets exactly one (face or body)
      const cropTypes = allocateCropTypes(
        prev.detections,
        prev.ruleset.portraitRatio
      );

      const crops: ImageCrop[] = prev.detections.map((detection, i) => {
        const selectedType = cropTypes[i];
        const faceCrop = buildCropRectFromBestBox(detection.faceBoxes, FACE_CROP_PADDING);
        const bodyCrop = buildCropRectFromBestBox(detection.bodyBoxes, BODY_CROP_PADDING);

        return {
          imageIndex: i,
          imageName: imageNames[i] ?? detection.imageName ?? `image_${i}`,
          selectedCrop: selectedType,
          faceCrop: faceCrop ?? buildDefaultCrop(),
          bodyCrop: bodyCrop ?? buildDefaultCrop(),
          faceAutoDetected: faceCrop !== null,
          bodyAutoDetected: bodyCrop !== null,
        };
      });

      return { ...prev, crops };
    });
  }, [imageNames]);

  // -----------------------------------------------------------------------
  // Update crop for a single image (face or body crop)
  // -----------------------------------------------------------------------
  const updateCrop = useCallback((imageIndex: number, cropTarget: "face" | "body", partial: Partial<{ x: number; y: number; width: number; height: number }>) => {
    setState((prev) => {
      const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
      if (cropIndex === -1) return prev;

      const existing = prev.crops[cropIndex];
      const updatedCrops = [...prev.crops];

      if (cropTarget === "face") {
        updatedCrops[cropIndex] = {
          ...existing,
          faceCrop: { ...existing.faceCrop, ...partial },
          faceAutoDetected: false,
        };
      } else {
        updatedCrops[cropIndex] = {
          ...existing,
          bodyCrop: { ...existing.bodyCrop, ...partial },
          bodyAutoDetected: false,
        };
      }

      return { ...prev, crops: updatedCrops };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Get final crops
  // -----------------------------------------------------------------------
  const getFinalCrops = useCallback(() => {
    return state.crops;
  }, [state.crops]);

  // -----------------------------------------------------------------------
  // Reset — also clears detection progress
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    setState(createEmptyState());
    setSelectedImageIndex(0);
    setDetectionProgress({
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    });
  }, []);

  // -----------------------------------------------------------------------
  // SSE handlers — attach to EventSource for live progress
  // Uses refs internally so handlers always call latest setters
  // -----------------------------------------------------------------------
  const setProgressRef = useRef(setDetectionProgress);
  useEffect(() => { setProgressRef.current = setDetectionProgress; }, [setDetectionProgress]);

  const setStateRef = useRef(setState);
  useEffect(() => { setStateRef.current = setState; }, [setState]);

  const getSSEHandlers = useCallback(() => {
    const onMessage = (event: MessageEvent) => {
      const data: DetectionProgress & { done?: boolean } = JSON.parse(event.data);
      setProgressRef.current({
        total: data.total ?? 0,
        queued: data.queued ?? 0,
        processing: data.processing ?? 0,
        completed: data.completed ?? 0,
        failed: data.failed ?? 0,
        done: data.done,
      });

      // When done, mark detecting as false
      if (data.done) {
        setStateRef.current((prev) => ({
          ...prev,
          isDetecting: false,
        }));
      }
    };

    const onDone = () => {
      // Cleanup — SSE connection closed
    };

    const onError = () => {
      setProgressRef.current((prev: DetectionProgress) => ({
        ...prev,
        done: false,
      }));
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
    selectedImageIndex,
    setSelectedImageIndex,
    setRuleset,
    setDetectionResults,
    autoAssignCrops,
    updateCrop,
    reset,
    getFinalCrops,
    hasCrops,
    getSSEHandlers,
  };
}
