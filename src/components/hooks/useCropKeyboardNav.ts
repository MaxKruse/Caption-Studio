"use client";

import { useEffect } from "react";
import type { ImageFile } from "../CaptionStudioTypes";
import type { UseCropDetectionReturn } from "../CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Keyboard navigation for crop editor (skips skipped images)
// ---------------------------------------------------------------------------

export function useCropKeyboardNav({
  workflowStep,
  images,
  cropDetection,
}: {
  workflowStep: string;
  images: ImageFile[];
  cropDetection: UseCropDetectionReturn;
}) {
  useEffect(() => {
    if (workflowStep !== "crop") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const crops = cropDetection.getFinalCrops();
      if (images.length === 0 || crops.length === 0) return;

      // Build list of valid (non-skipped) image indices
      const validIndices = crops.map((c) => c.imageIndex);
      if (validIndices.length === 0) return;

      const current = cropDetection.selectedImageIndex;
      const currentValidIndex = validIndices.indexOf(current);
      const currentIndexInValid = currentValidIndex >= 0 ? currentValidIndex : 0;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const nextValidIndex = currentIndexInValid > 0 ? currentIndexInValid - 1 : validIndices.length - 1;
        cropDetection.setSelectedImageIndex(validIndices[nextValidIndex]);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextValidIndex = currentIndexInValid < validIndices.length - 1 ? currentIndexInValid + 1 : 0;
        cropDetection.setSelectedImageIndex(validIndices[nextValidIndex]);
      } else if (e.key === " ") {
        e.preventDefault();
        const crop = crops.find((c) => c.imageIndex === current);
        if (crop) {
          // Toggle type AND snap to the best bounding box for the new type
          const newType = crop.cropType === "face" ? "body" : "face";
          cropDetection.setCropType(current, newType);
          cropDetection.resetCrop(current);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workflowStep, images, cropDetection]);
}
