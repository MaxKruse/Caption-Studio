"use client";

import type { ImageFile, ImageStatus, WorkflowStep } from "../CaptionStudioTypes";
import type { UseCropDetectionReturn, RulesetValidation } from "../CaptionStudioCropTypes";

// Minimal shapes for hook return values (avoids circular deps on full hook types)
interface CaptionJobShape {
  progress: { total: number; completed: number; failed: number };
  isProcessing: boolean;
  jobId: string | null;
  imageStatuses: Record<string, ImageStatus>;
}

interface ImageUploadShape {
  images: ImageFile[];
}

interface ConfigShape {
  serverUrl: string;
  triggerRequired: boolean;
}

// ---------------------------------------------------------------------------
// Derived values for CaptionStudio
// ---------------------------------------------------------------------------

export function useCaptionStudioDerived({
  captionJob,
  cropDetection,
  imageUpload,
  config,
  isDetecting,
  selectedModel,
  workflowStep: baseWorkflowStep,
}: {
  captionJob: CaptionJobShape;
  cropDetection: UseCropDetectionReturn;
  imageUpload: ImageUploadShape;
  config: ConfigShape;
  isDetecting: boolean;
  selectedModel: string;
  workflowStep: WorkflowStep;
}) {
  const progressPercent =
    captionJob.progress.total > 0
      ? Math.round(
          ((captionJob.progress.completed + captionJob.progress.failed) /
            captionJob.progress.total) *
            100
        )
      : 0;

  const canDetect =
    !isDetecting &&
    imageUpload.images.length > 0 &&
    !!selectedModel &&
    !!config.serverUrl.trim();

  const rulesetValidation: RulesetValidation = cropDetection.validateRuleset();
  const canProceedToCaption =
    cropDetection.hasCrops &&
    cropDetection.rulesetValid &&
    !isDetecting &&
    !captionJob.isProcessing &&
    !!selectedModel &&
    !!config.serverUrl.trim() &&
    !config.triggerRequired;

  const jobDone = !!captionJob.jobId && !captionJob.isProcessing;

  // Build merged image statuses
  const mergedImageStatuses: Record<string, ImageStatus> = {};
  for (const img of imageUpload.images) {
    mergedImageStatuses[img.name] = captionJob.imageStatuses[img.name];
  }

  const failedImages = imageUpload.images
    .map((img) => ({ img, status: mergedImageStatuses[img.name] }))
    .filter(({ status }) => status?.status === "failed");

  // jobDone overrides workflowStep to "done"
  const displayStep: WorkflowStep = jobDone ? "done" : baseWorkflowStep;

  const actionBarStep: "upload" | "detect" | "crop" | "caption" | "done" = displayStep === "done"
    ? "done"
    : displayStep === "caption"
      ? "caption"
      : displayStep === "crop"
        ? "crop"
        : displayStep === "detect"
          ? "detect"
          : imageUpload.images.length > 0
            ? "upload"
            : "upload";

  const showUploadSection = displayStep === "upload" || displayStep === "configure" || displayStep === "detect" || displayStep === "crop";
  const showCropEditor = displayStep === "crop";
  const showGallery = displayStep === "caption" || displayStep === "done";

  return {
    progressPercent,
    canDetect,
    canProceedToCaption,
    jobDone,
    mergedImageStatuses,
    failedImages,
    actionBarStep,
    displayStep,
    showUploadSection,
    showCropEditor,
    showGallery,
    rulesetValidation,
  };
}
