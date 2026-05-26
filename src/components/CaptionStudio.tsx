"use client";

import { useCallback, useEffect, useState } from "react";

import type { ImageFile, ImageStatus, WorkflowStep } from "./CaptionStudioTypes";
import type { CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import { CROP_RULESETS } from "./CaptionStudioCropConstants";
export { formatDuration } from "./CaptionStudioTypes";
import { cropImagePreview } from "@/lib/image-client-utils";
import { AppHeader } from "./AppHeader";
import { ConfigSection } from "./ConfigSection";
import { CropEditor } from "./CropEditor";
import { FailedImagesLog } from "./FailedImagesLog";
import { ResultsGallery } from "./ResultsGallery";
import { FloatingActionBar } from "./FloatingActionBar";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { JobErrorMessage } from "./JobErrorMessage";
import { ToastNotification } from "./ToastNotification";
import { UploadSection } from "./UploadSection";
import { useAppConfig } from "./hooks/useAppConfig";
import { useCaptionJob } from "./hooks/useCaptionJob";
import { useCropDetection } from "./hooks/useCropDetection";
import { useFetchModels } from "./hooks/useFetchModels";
import { useImageUpload } from "./hooks/useImageUpload";
import { usePreviewKeyboardNav } from "./hooks/usePreviewKeyboardNav";

// ---------------------------------------------------------------------------
// Main component — step-based workflow
//
// Workflow: Configure → Upload → Detect → Crop → Caption → Done
// ---------------------------------------------------------------------------

export default function CaptionStudio() {
  // -- App configuration state --
  const config = useAppConfig();

  // -- Model fetching --
  const { models, modelLoading, modelError, fetchModels } =
    useFetchModels(config.serverUrl);

  // Derive effective selected model — auto-picks first when list refreshes
  const selectedModel =
    models.length > 0 && models.some((m) => m.id === config.selectedModel)
      ? config.selectedModel
      : models[0]?.id ?? "";

  // -- Workflow step --
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("configure");

  // -- Crop ruleset --
  const [cropRuleset, setCropRuleset] = useState<CropRuleset | null>(CROP_RULESETS[1]); // default 50/50

  // -- Image upload --
  const imageUpload = useImageUpload({
    isProcessing: false,
  });

  // -- Crop detection --
  const cropDetection = useCropDetection({
    imageCount: imageUpload.images.length,
    imageNames: imageUpload.images.map((img) => img.name),
    serverUrl: config.serverUrl,
    selectedModel,
    showToast: config.showToast,
  });

  // -- Sync ruleset into crop detection hook --
  const cropSetRuleset = cropDetection.setRuleset;
  useEffect(() => {
    if (cropRuleset) {
      cropSetRuleset(cropRuleset);
    }
  }, [cropRuleset, cropSetRuleset]);

  // -- Detection state --
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // -- Caption job --
  const captionJob = useCaptionJob({
    images: imageUpload.images,
    selectedModel,
    serverUrl: config.serverUrl,
    systemPrompt: config.systemPrompt,
    userPrompt: config.userPrompt,
    captionTypeId: config.captionTypeId,
    triggerWord: config.triggerWord,
    subjectName: config.subjectName,
    parallelRequests: config.parallelRequests,
    showToast: config.showToast,
    onDownloadComplete: () => {
      imageUpload.clearAll();
      config.setSubjectName("");
      resetWorkflow();
    },
    cropData: cropDetection.hasCrops ? cropDetection.getFinalCrops() : undefined,
  });

  // -- Reset workflow --
  const resetWorkflow = useCallback(() => {
    setWorkflowStep("configure");
    cropDetection.reset();
    setIsDetecting(false);
    setDetectionError(null);
  }, [cropDetection]);

  // -- Detection handler --
  const handleDetect = useCallback(async () => {
    if (!cropRuleset || imageUpload.images.length === 0 || !selectedModel) return;

    setIsDetecting(true);
    setDetectionError(null);
    setWorkflowStep("detect");

    try {
      const formData = new FormData();
      formData.append("config", JSON.stringify({
        serverUrl: config.serverUrl.trim(),
        model: selectedModel,
        contentMode: config.contentMode,
      }));
      for (const img of imageUpload.images) {
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
        setWorkflowStep("upload");
        return;
      }

      const jobId = data.jobId;

      // Connect to SSE for live progress
      const es = new EventSource(`/api/detect?jobId=${jobId}`);
      const sseHandlers = cropDetection.getSSEHandlers();

      es.onmessage = (event: MessageEvent) => {
        sseHandlers.onMessage(event);

        const parsed = JSON.parse(event.data);
        if (parsed.done) {
          es.close();

          type SseStatus = { status: string; faceBoxes?: DetectionResult["faceBoxes"]; bodyBoxes?: DetectionResult["bodyBoxes"]; error?: string; retryCount?: number };
          const statuses = (parsed.statuses ?? {}) as Record<string, SseStatus | undefined>;

          const results: DetectionResult[] = imageUpload.images.map((img, i) => {
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

          // Auto-assign crops based on ruleset (skips failed images)
          cropDetection.autoAssignCrops();

          // Ensure selected image index points to a valid (non-skipped) image
          const validCrops = cropDetection.getFinalCrops();
          if (validCrops.length > 0) {
            cropDetection.setSelectedImageIndex(validCrops[0].imageIndex);
          }

          // Check if we have any crops to work with
          const hasValidCrops = validCrops.length > 0;

          if (!hasValidCrops) {
            // All images failed — go back to upload
            setDetectionError(
              `All ${imageUpload.images.length} image(s) failed detection. Please try different images or a different model.`
            );
            setIsDetecting(false);
            setWorkflowStep("upload");
            config.showToast("All images failed detection — please try again");
            return;
          }

          // Check for skipped images and warn
          const skippedCount = results.filter((r) => r.error && (r.error.includes("permanently") || r.error.includes("skipped"))).length;
          if (skippedCount > 0) {
            setDetectionError(
              `${skippedCount} image(s) skipped after failed detection and will be omitted from crops. ${hasValidCrops ? "Proceeding with remaining images." : ""}`
            );
          }

          // Move to crop step
          setWorkflowStep("crop");
          setIsDetecting(false);
        }
      };

      es.onerror = () => {
        es.close();
        sseHandlers.onError();
        setDetectionError("Detection connection lost");
        setIsDetecting(false);
        setWorkflowStep("upload");
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Detection failed";
      setDetectionError(message);
      config.showToast(message);
      setIsDetecting(false);
      setWorkflowStep("upload");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropRuleset, imageUpload.images, selectedModel, config.serverUrl, config.showToast, cropDetection]);

  // -- Abort detection handler --
  const handleAbortDetection = useCallback(() => {
    setIsDetecting(false);
    setWorkflowStep("upload");
  }, []);

  // -- Crop handlers --
  const handleAutoAssign = useCallback(() => {
    cropDetection.autoAssignCrops();
  }, [cropDetection]);

  const handleUpdateCropRect = useCallback((imageIndex: number, rect: Partial<{ x: number; y: number; width: number; height: number }>) => {
    cropDetection.updateCropRect(imageIndex, rect);
  }, [cropDetection]);

  const handleSetCropType = useCallback((imageIndex: number, cropType: "face" | "body") => {
    cropDetection.setCropType(imageIndex, cropType);
  }, [cropDetection]);

  const handleResetCrop = useCallback((imageIndex: number) => {
    cropDetection.resetCrop(imageIndex);
  }, [cropDetection]);

  const handleSelectCropImage = useCallback((index: number) => {
    cropDetection.setSelectedImageIndex(index);
  }, [cropDetection]);

  // Ensure selected image index stays valid when crops change (e.g., after auto-assign)
  useEffect(() => {
    if (workflowStep !== "crop") return;
    const validCrops = cropDetection.getFinalCrops();
    if (validCrops.length === 0) return;

    const current = cropDetection.selectedImageIndex;
    const hasCrop = validCrops.some((c) => c.imageIndex === current);
    if (!hasCrop) {
      // Current selection has no crop — select first valid crop
      cropDetection.setSelectedImageIndex(validCrops[0].imageIndex);
    }
  }, [workflowStep, cropDetection]);

  // -- Cropped previews map (image name -> cropped preview URL) --
  const [croppedPreviews, setCroppedPreviews] = useState<Record<string, string>>({});

  // -- Proceed from crop to caption --
  const handleProceedFromCrop = useCallback(async () => {
    // Generate cropped previews for the results gallery
    const crops = cropDetection.getFinalCrops();
    if (crops.length > 0) {
      const previews: Record<string, string> = {};
      await Promise.allSettled(crops.map(async (crop: ImageCrop) => {
        const img = imageUpload.images[crop.imageIndex];
        if (!img) return;
        try {
          previews[crop.imageName] = await cropImagePreview(img.preview, crop.cropRect);
        } catch {
          // Fall back to original preview on error
        }
      }));
      setCroppedPreviews(previews);
    }

    setWorkflowStep("caption");
    setTimeout(() => {
      captionJob.startCaptioning();
    }, 100);
  }, [captionJob, cropDetection, imageUpload.images]);

  // -- Back from crop to upload --
  const handleBackFromCrop = useCallback(() => {
    setWorkflowStep("upload");
  }, []);

  // -- Preview modal --
  const [previewImage, setPreviewImage] = useState<ImageFile | null>(null);

  const openPreview = useCallback((img: ImageFile) => {
    setPreviewImage(img);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  // -- Preview navigation --
  const navigatePreview = useCallback(
    (index: number) => {
      setPreviewImage(imageUpload.images[index] ?? null);
    },
    [imageUpload.images]
  );

  usePreviewKeyboardNav({
    previewImage,
    allImages: imageUpload.images,
    onClose: closePreview,
    onNavigate: navigatePreview,
  });

  // -- Keyboard navigation for crop editor (skips skipped images) --
  useEffect(() => {
    if (workflowStep !== "crop") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const images = imageUpload.images;
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
  }, [workflowStep, imageUpload.images, cropDetection]);

  // -- Warn before leaving while a job is processing --
  useEffect(() => {
    if (!captionJob.isProcessing) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [captionJob.isProcessing]);

  // -- Derived values --
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
    !!cropRuleset &&
    !!config.serverUrl.trim();

  const rulesetValidation = cropDetection.validateRuleset();
  const canProceedToCaption =
    cropDetection.hasCrops &&
    cropDetection.rulesetValid &&
    !isDetecting &&
    !captionJob.isProcessing;

  const jobDone = !!captionJob.jobId && !captionJob.isProcessing;

  // Build image statuses
  const mergedImageStatuses: Record<string, ImageStatus> = {};
  for (const img of imageUpload.images) {
    mergedImageStatuses[img.name] = captionJob.imageStatuses[img.name];
  }

  const failedImages = imageUpload.images
    .map((img) => ({ img, status: mergedImageStatuses[img.name] }))
    .filter(({ status }) => status?.status === "failed");

  // -- Handlers --
  const handleClearAll = useCallback(() => {
    imageUpload.clearAll();
    captionJob.reset();
    resetWorkflow();
  }, [imageUpload, captionJob, resetWorkflow]);

  const handleClearAllToggle = useCallback(() => {
    if (imageUpload.clearAllConfirm) {
      handleClearAll();
      imageUpload.setClearAllConfirm(false);
    } else {
      imageUpload.setClearAllConfirm(true);
      setTimeout(() => imageUpload.setClearAllConfirm(false), 3000);
    }
  }, [imageUpload, handleClearAll]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      imageUpload.processFiles(e.target.files || []);
    },
    [imageUpload]
  );

  // -- Derived display step --
  const displayStep: WorkflowStep = jobDone ? "done" : workflowStep;

  const showUploadSection = displayStep === "upload" || displayStep === "configure" || displayStep === "detect" || displayStep === "crop";
  const showCropEditor = displayStep === "crop";
  const showGallery = displayStep === "caption" || displayStep === "done";

  // -- Determine action bar step --
  const actionBarStep = displayStep === "done"
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

  // -- Crops & detections for render --
  const crops = cropDetection.getFinalCrops();
  const detections = cropDetection.state.detections;

  // -- Render --
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8 pb-20">
      <AppHeader />

      <ToastNotification toast={config.toast} onClose={config.hideToast} />

      <JobErrorMessage
        message={captionJob.jobError}
        onDismiss={captionJob.clearJobError}
      />

      {jobDone && failedImages.length > 0 && (
        <FailedImagesLog
          failedImages={failedImages}
          isOpen={captionJob.showErrorLog}
          onToggle={() => captionJob.setShowErrorLog((prev) => !prev)}
        />
      )}

      {/* Step 1: Configure (always visible) */}
      <ConfigSection
        serverUrl={config.serverUrl}
        onServerUrlChange={config.setServerUrl}
        models={models}
        selectedModel={selectedModel}
        onModelChange={config.setSelectedModel}
        modelLoading={modelLoading}
        modelError={modelError}
        onFetchModels={fetchModels}
        contentMode={config.contentMode}
        onContentModeChange={config.setContentMode}
        captionTypeId={config.captionTypeId}
        onCaptionTypeIdChange={config.setCaptionTypeId}
        systemPrompt={config.systemPrompt}
        onSystemPromptChange={config.setSystemPrompt}
        userPrompt={config.userPrompt}
        onUserPromptChange={config.setUserPrompt}
        triggerWord={config.triggerWord}
        onTriggerWordChange={config.setTriggerWord}
        subjectName={config.subjectName}
        onSubjectNameChange={config.setSubjectName}
        needsTrigger={config.needsTrigger}
        needsName={config.needsName}
        triggerRequired={config.triggerRequired}
        nameRequired={config.nameRequired}
        parallelRequests={config.parallelRequests}
        onParallelRequestsChange={config.setParallelRequests}
        selectedRuleset={cropRuleset}
        onRulesetChange={setCropRuleset}
        isProcessing={captionJob.isProcessing || isDetecting}
      />

      {/* Step 2: Upload */}
      {showUploadSection && (
        <UploadSection
          images={imageUpload.images}
          imageStatuses={mergedImageStatuses}
          dragOver={imageUpload.dragOver}
          galleryOpen={imageUpload.galleryOpen}
          onGalleryToggle={() => imageUpload.setGalleryOpen((p) => !p)}
          clearAllConfirm={imageUpload.clearAllConfirm}
          onClearAllToggle={handleClearAllToggle}
          isProcessing={captionJob.isProcessing || isDetecting}
          isUploading={imageUpload.isUploading}
          onDragOver={imageUpload.handleDragOver}
          onDragLeave={imageUpload.handleDragLeave}
          onDrop={imageUpload.handleDrop}
          onFileChange={handleFileChange}
          onRemoveImage={imageUpload.removeImage}
          onPreview={openPreview}
          fileInputRef={imageUpload.fileInputRef}
        />
      )}

      {/* Detection error */}
      {(displayStep === "detect" || displayStep === "crop") && detectionError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {detectionError}
        </div>
      )}

      {/* Step 2.5: Crop Editor */}
      {showCropEditor && (
        <CropEditor
          images={imageUpload.images}
          ruleset={cropRuleset}
          crops={crops}
          detections={detections}
          detectionError={detectionError}
          rulesetValid={cropDetection.rulesetValid}
          rulesetValidation={rulesetValidation}
          onAutoAssign={handleAutoAssign}
          onUpdateCropRect={handleUpdateCropRect}
          onSetCropType={handleSetCropType}
          onResetCrop={handleResetCrop}
          onSelectImage={handleSelectCropImage}
          selectedIndex={cropDetection.selectedImageIndex}
          disabled={captionJob.isProcessing}
          skippedImageNames={cropDetection.skippedImages}
        />
      )}

      {/* Step 3+: Results gallery after captioning */}
      {showGallery && (
        <ResultsGallery
          images={imageUpload.images}
          imageStatuses={mergedImageStatuses}
          croppedPreviews={croppedPreviews}
          onPreview={openPreview}
        />
      )}

      {/* Floating Action Bar */}
      <FloatingActionBar
        step={actionBarStep}
        imagesCount={imageUpload.images.length}
        images={imageUpload.images}
        detectionProgress={cropDetection.detectionProgress}
        detectionStatuses={cropDetection.detectionStatuses}
        captionProgress={captionJob.progress}
        captionProgressPercent={progressPercent}
        estimatedRemainingMs={captionJob.progress.estimatedRemainingMs}
        avgTimeMs={captionJob.progress.avgTimeMs}
        onDetect={canDetect ? handleDetect : undefined}
        onAbortDetection={handleAbortDetection}
        onProceedToCaption={canProceedToCaption ? handleProceedFromCrop : undefined}
        onBackToUpload={handleBackFromCrop}
        onAbortCaption={captionJob.abortJob}
        onDownloadZip={captionJob.downloadZip}
        onClearAll={handleClearAllToggle}
        canDetect={canDetect}
        canProceedToCaption={canProceedToCaption}
        rulesetValid={cropDetection.rulesetValid}
        rulesetValidation={rulesetValidation}
      />

      {previewImage && (
        <ImagePreviewModal
          img={previewImage}
          status={mergedImageStatuses[previewImage.name] ?? captionJob.imageStatuses[previewImage.name] ?? { status: "queued" }}
          onClose={closePreview}
          allImages={imageUpload.images}
          currentIndex={imageUpload.images.findIndex(
            (img) => img.name === previewImage.name
          )}
          onNavigate={navigatePreview}
        />
      )}
    </div>
  );
}
