import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CROP_RULESETS } from "../CaptionStudioCropConstants";
import type {
  BoundingBox,
  CropState,
  CropType,
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

/**
 * Auto-assign portrait/body crops based on ruleset and detection results.
 * Images with larger face bounding boxes get priority for portrait crops.
 */
function computeAutoAssignments(
  imageCount: number,
  portraitCount: number,
  detections: DetectionResult[]
): { imageIndex: number; cropType: CropType }[] {
  // Score each image by total face bounding box area (in 1000-normalized coords)
  const scored: { imageIndex: number; totalArea: number; hasFaces: boolean }[] = [];

  for (let i = 0; i < imageCount; i++) {
    const detection = detections[i];
    let totalArea = 0;
    if (detection && detection.faceBoxes.length > 0) {
      for (const bb of detection.faceBoxes) {
        const w = bb.bbox_2d[2] - bb.bbox_2d[0];
        const h = bb.bbox_2d[3] - bb.bbox_2d[1];
        totalArea += w * h;
      }
    }
    scored.push({
      imageIndex: i,
      totalArea,
      hasFaces: detection?.faceBoxes.length > 0,
    });
  }

  // Sort by face area (largest first) — images with bigger faces get portrait priority
  scored.sort((a, b) => b.totalArea - a.totalArea);

  // Assign portrait to top N, body to rest
  const assignments = new Map<number, CropType>();
  let portraitAssigned = 0;

  for (const entry of scored) {
    if (portraitAssigned < portraitCount) {
      assignments.set(entry.imageIndex, "portrait");
      portraitAssigned++;
    } else {
      assignments.set(entry.imageIndex, "body");
    }
  }

  return Array.from(assignments.entries()).map(([imageIndex, cropType]) => ({
    imageIndex,
    cropType,
  }));
}

/**
 * Build a crop rectangle from a bounding box, centered on the box.
 * Free aspect ratio — the crop rect starts at the exact box size.
 */
function buildCropRectFromBox(
  box: BoundingBox
): { x: number; y: number; width: number; height: number } {
  const bx = box.bbox_2d[0];
  const by = box.bbox_2d[1];
  const bw = box.bbox_2d[2] - bx;
  const bh = box.bbox_2d[3] - by;

  // Add a small padding (5% of box size) so the crop isn't tight on the edge
  const paddingW = bw * 0.05;
  const paddingH = bh * 0.05;

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
  imageCount,
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
  // Auto-assign crops based on ruleset and detections
  // -----------------------------------------------------------------------
  const autoAssignCrops = useCallback(() => {
    setState((prev) => {
      if (!prev.ruleset || prev.detections.length === 0) return prev;

      const portraitCount = Math.round(imageCount * prev.ruleset.portraitRatio);
      const assignments = computeAutoAssignments(
        imageCount,
        portraitCount,
        prev.detections
      );

      const crops: ImageCrop[] = assignments.map((a) => {
        const detection = prev.detections[a.imageIndex];

        let cropRect: { x: number; y: number; width: number; height: number };
        let autoDetected = false;

        if (a.cropType === "portrait" && detection?.faceBoxes.length) {
          // Use the largest face bounding box
          const largest = detection.faceBoxes.reduce((max, bb) => {
            const area = (bb.bbox_2d[2] - bb.bbox_2d[0]) * (bb.bbox_2d[3] - bb.bbox_2d[1]);
            const maxArea = (max.bbox_2d[2] - max.bbox_2d[0]) * (max.bbox_2d[3] - max.bbox_2d[1]);
            return area > maxArea ? bb : max;
          });
          cropRect = buildCropRectFromBox(largest);
          autoDetected = true;
        } else if (a.cropType === "body" && detection?.bodyBoxes.length) {
          // Use the largest body bounding box
          const largest = detection.bodyBoxes.reduce((max, bb) => {
            const area = (bb.bbox_2d[2] - bb.bbox_2d[0]) * (bb.bbox_2d[3] - bb.bbox_2d[1]);
            const maxArea = (max.bbox_2d[2] - max.bbox_2d[0]) * (max.bbox_2d[3] - max.bbox_2d[1]);
            return area > maxArea ? bb : max;
          });
          cropRect = buildCropRectFromBox(largest);
          autoDetected = true;
        } else {
          // No detection — use full image
          cropRect = buildDefaultCrop();
        }

        return {
          imageIndex: a.imageIndex,
          imageName: imageNames[a.imageIndex] ?? detection?.imageName ?? `image_${a.imageIndex}`,
          cropType: a.cropType,
          cropRect,
          autoDetected,
        };
      });

      return { ...prev, crops };
    });
  }, [imageCount, imageNames]);

  // -----------------------------------------------------------------------
  // Update crop for a single image
  // -----------------------------------------------------------------------
  const updateCrop = useCallback((imageIndex: number, partial: Partial<ImageCrop>) => {
    setState((prev) => {
      const cropIndex = prev.crops.findIndex((c) => c.imageIndex === imageIndex);
      if (cropIndex === -1) return prev;

      const updatedCrops = [...prev.crops];
      updatedCrops[cropIndex] = { ...updatedCrops[cropIndex], ...partial, autoDetected: false };
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
