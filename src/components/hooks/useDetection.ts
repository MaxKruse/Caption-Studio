"use client";

import { useCallback, useRef, useState } from "react";
import type { ImageFile, WorkflowStep } from "../CaptionStudioTypes";
import type { CropRuleset, DetectionResult } from "../CaptionStudioCropTypes";
import type { UseCropDetectionReturn } from "../CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Detection workflow hook
// ---------------------------------------------------------------------------

export function useDetection({
  images,
  serverUrl,
  contentMode,
  parallelRequests,
  selectedModel,
  cropRuleset,
  cropDetection,
  showToast,
  onStepChange,
}: {
  images: ImageFile[];
  serverUrl: string;
  contentMode: "sfw" | "nsfw";
  parallelRequests: number;
  selectedModel: string;
  cropRuleset: CropRuleset | null;
  cropDetection: UseCropDetectionReturn;
  showToast: (message: string) => void;
  onStepChange: (step: WorkflowStep) => void;
}) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // Use a ref to track the latest EventSource so we can close it on abort
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleDetect = useCallback(async () => {
    if (isDetecting) return;

    if (!cropRuleset || images.length === 0 || !selectedModel) {
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);
    onStepChange("detect");

    try {
      const formData = new FormData();
      formData.append("config", JSON.stringify({
        serverUrl: serverUrl.trim(),
        model: selectedModel,
        contentMode,
        parallelRequests,
      }));
      for (const img of images) {
        formData.append("images", img.file);
      }

      const res = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setDetectionError(data.error || "Detection failed");
        setIsDetecting(false);
        onStepChange("upload");
        return;
      }

      const jobId = data.jobId;

      // Connect to SSE for live progress
      const es = new EventSource(`/api/detect?jobId=${jobId}`);
      eventSourceRef.current = es;
      const sseHandlers = cropDetection.getSSEHandlers();

      es.onmessage = (event: MessageEvent) => {
        sseHandlers.onMessage(event);

        const parsed = JSON.parse(event.data);
        if (parsed.done) {
          es.close();
          eventSourceRef.current = null;

          type SseStatus = { status: string; faceBoxes?: DetectionResult["faceBoxes"]; bodyBoxes?: DetectionResult["bodyBoxes"]; error?: string; retryCount?: number };
          const statuses = (parsed.statuses ?? {}) as Record<string, SseStatus | undefined>;

          const results: DetectionResult[] = images.map((img, i) => {
            const status = statuses?.[img.name];
            return {
              imageIndex: i,
              imageName: img.name,
              faceBoxes: status?.faceBoxes ?? [],
              bodyBoxes: status?.bodyBoxes ?? [],
              error: status?.error,
            };
          });

          cropDetection.setDetectionResults(results);
          cropDetection.autoAssignCrops();

          // Ensure selected image index points to a valid (non-skipped) image
          const validCrops = cropDetection.getFinalCrops();
          if (validCrops.length > 0) {
            cropDetection.setSelectedImageIndex(validCrops[0].imageIndex);
          }

          // Check if we have any crops to work with
          const hasValidCrops = validCrops.length > 0;

          if (!hasValidCrops) {
            setDetectionError(
              `All ${images.length} image(s) failed detection. Please try different images or a different model.`
            );
            setIsDetecting(false);
            onStepChange("upload");
            showToast("All images failed detection — please try again");
            return;
          }

          // Check for skipped images and warn
          const skippedCount = results.filter((r) => r.error && (r.error.includes("permanently") || r.error.includes("skipped"))).length;
          if (skippedCount > 0) {
            setDetectionError(
              `${skippedCount} image(s) failed detection — set their crop boxes manually in the editor below.`
            );
          }

          onStepChange("crop");
          setIsDetecting(false);
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        sseHandlers.onError();
        setDetectionError("Detection connection lost");
        setIsDetecting(false);
        onStepChange("upload");
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Detection failed";
      setDetectionError(message);
      showToast(message);
      setIsDetecting(false);
      onStepChange("upload");
    }
  }, [isDetecting, cropRuleset, images, selectedModel, serverUrl, contentMode, parallelRequests, showToast, cropDetection, onStepChange]);

  const handleAbortDetection = useCallback(() => {
    const es = eventSourceRef.current;
    if (es) {
      es.close();
      eventSourceRef.current = null;
    }
    setIsDetecting(false);
    onStepChange("upload");
  }, [onStepChange]);

  return {
    isDetecting,
    detectionError,
    setDetectionError,
    handleDetect,
    handleAbortDetection,
  };
}
