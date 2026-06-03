import { useCallback, useMemo, useRef, useState } from "react";
import { CROP_RULESETS } from "../CaptionStudioCropConstants";
import type {
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
import {
  FACE_CROP_PADDING,
  BODY_CROP_PADDING,
  buildCropRectFromBestBox,
  buildDefaultCrop,
  allocateCropTypes,
} from "@/lib/crop-allocation";
import { buildLowConfidenceWarning } from "@/lib/crop-warnings";

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
