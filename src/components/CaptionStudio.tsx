"use client";

import { useCallback, useEffect, useState } from "react";

import type { ImageFile, ImageStatus } from "./CaptionStudioTypes";
import { CAPTION_PRESETS } from "./CaptionStudioTypes";
import type { ImageCrop } from "./CaptionStudioCropTypes";
import { CROP_RULESETS } from "./CaptionStudioCropConstants";
export { formatDuration } from "./CaptionStudioTypes";
import { cropImagePreview } from "@/lib/image-client-utils";
import { useStudioStore } from "@/store/studioStore";
import { AppHeader } from "./AppHeader";
import { ConfigSection } from "./ConfigSection";
import { CropEditor } from "./CropEditor";
import { FailedImagesLog } from "./FailedImagesLog";
import { PageFooter } from "./PageFooter";
import { ResultsGallery } from "./ResultsGallery";
import { SessionRestoredBanner } from "./SessionRestoredBanner";

import { ImagePreviewModal } from "./ImagePreviewModal";
import { JobErrorMessage } from "./JobErrorMessage";
import { ToastNotification } from "./ToastNotification";
import { UploadSection } from "./UploadSection";
import { useAppConfig } from "./hooks/useAppConfig";
import { useCaptionJob } from "./hooks/useCaptionJob";

import { useCropDetection } from "./hooks/useCropDetection";
import { useCropKeyboardNav } from "./hooks/useCropKeyboardNav";
import { useDetection } from "./hooks/useDetection";
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

  // -- Detect session restored from localStorage --
  const sessionRestored = useStudioStore((s) => {
    return !!(
      s.config.serverUrl &&
      s.config.serverUrl !== process.env.NEXT_PUBLIC_CAPTION_API_URL &&
      s.config.selectedModel !== ""
    );
  });


  // -- Model fetching (reads serverUrl from store) --
  const { models, modelLoading, modelError, fetchModels } = useFetchModels();

  // Derive effective selected model — auto-picks first when list refreshes
  const selectedModel =
    models.length > 0 && models.some((m) => m.id === config.selectedModel)
      ? config.selectedModel
      : models[0]?.id ?? "";

  // -- Workflow step (from store) --
  const workflowStep = useStudioStore((s) => s.workflowStep);
  const setWorkflowStep = useStudioStore((s) => s.setWorkflowStep);

  // -- Crop ruleset (from store) --
  const cropRulesetId = useStudioStore((s) => s.crop.rulesetId);
  const setCropRulesetId = useStudioStore((s) => s.setCropRulesetId);
  const cropRuleset = CROP_RULESETS.find((r) => r.id === cropRulesetId) ?? CROP_RULESETS[1];

  // -- Image upload --
  const imageUpload = useImageUpload({
    isProcessing: false,
  });

  // Sync image names to store (metadata only — not file data)
  const setStoreImages = useStudioStore((s) => s.setImages);
  useEffect(() => {
    const names = imageUpload.images.map((img) => img.name);
    setStoreImages(names);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on count change only
  }, [imageUpload.images.length, setStoreImages]);

  // -- Crop detection --
  const cropDetection = useCropDetection({
    imageNames: imageUpload.images.map((img) => img.name),
  });

  // -- Sync ruleset into crop detection hook --
  const cropSetRuleset = cropDetection.setRuleset;
  useEffect(() => {
    if (cropRuleset) {
      cropSetRuleset(cropRuleset);
    }
  }, [cropRuleset, cropSetRuleset]);

  // -- Detection workflow (reads config from store) --
  const { isDetecting, detectionError, setDetectionError, handleDetect, handleAbortDetection } =
    useDetection({
      images: imageUpload.images,
      selectedModel,
      cropRuleset,
      cropDetection,
      showToast: config.showToast,
      onStepChange: setWorkflowStep,
    });

  // -- Caption job (reads config from store) --
  const captionJob = useCaptionJob({
    images: imageUpload.images,
    selectedModel,
    showToast: config.showToast,
    onDownloadComplete: () => {
      imageUpload.clearAll();
      resetWorkflow();
    },
    cropData: cropDetection.hasCrops ? cropDetection.getFinalCrops() : undefined,
  });

  // -- Reset workflow --
  const resetWorkflow = useCallback(() => {
    setWorkflowStep("configure");
    cropDetection.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setWorkflowStep is a stable store action
  }, [cropDetection]);

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
      if (config.captionAllPresets) {
        captionJob.startCaptioningAllPresets();
      } else {
        captionJob.startCaptioning();
      }
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setWorkflowStep is a stable store action
  }, [captionJob, cropDetection, imageUpload.images, config.captionAllPresets]);

  // -- Back from crop to upload --
  const handleBackFromCrop = useCallback(() => {
    setWorkflowStep("upload");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setWorkflowStep is a stable store action
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

  // -- Keyboard navigation for crop editor --
  useCropKeyboardNav({
    workflowStep,
    images: imageUpload.images,
    cropDetection,
  });

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

  // -- Derived values (inline — no separate hook) --
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

  const rulesetValidation = cropDetection.validateRuleset();
  // In multi-preset mode, check if ANY preset needs a trigger word
  const anyPresetNeedsTrigger = config.captionAllPresets
    ? CAPTION_PRESETS.some((p) => p.needsTrigger && !config.triggerWord.trim())
    : config.triggerRequired;

  const canProceedToCaption =
    cropDetection.hasCrops &&
    cropDetection.rulesetValid &&
    !isDetecting &&
    !captionJob.isProcessing &&
    !!selectedModel &&
    !!config.serverUrl.trim() &&
    !anyPresetNeedsTrigger;

  const jobDone = (!captionJob.isProcessing && (captionJob.jobId || (config.captionAllPresets && captionJob.progress.total > 0)));

  // In multi-preset mode, use active preset's statuses (or current if still processing)
  const activePresetStatuses = config.captionAllPresets
    ? captionJob.presetResults[captionJob.activePresetId ?? ""] ?? captionJob.imageStatuses
    : captionJob.imageStatuses;

  const mergedImageStatuses: Record<string, ImageStatus> = {};
  for (const img of imageUpload.images) {
    mergedImageStatuses[img.name] = activePresetStatuses[img.name];
  }

  const failedImages = imageUpload.images
    .map((img) => ({ img, status: mergedImageStatuses[img.name] }))
    .filter(({ status }) => status?.status === "failed");

  const displayStep = jobDone ? "done" : workflowStep;

  const showUploadSection = displayStep === "upload" || displayStep === "configure" || displayStep === "detect" || displayStep === "crop";
  const showCropEditor = displayStep === "crop";
  const showGallery = displayStep === "caption" || displayStep === "done";

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

  // -- Crops & detections for render --
  const crops = cropDetection.getFinalCrops();
  const detections = cropDetection.state.detections;

  // -- Render --
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <AppHeader />

      <SessionRestoredBanner restored={sessionRestored} />

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
        presetId={config.presetId}
        onPresetChange={config.setPresetId}
        presetLabel={config.presetLabel}
        systemPrompt={config.systemPrompt}
        onSystemPromptChange={config.setSystemPrompt}
        userPrompt={config.userPrompt}
        onUserPromptChange={config.setUserPrompt}
        triggerWord={config.triggerWord}
        onTriggerWordChange={config.setTriggerWord}
        needsTrigger={config.presetNeedsTrigger}
        triggerRequired={config.triggerRequired}
        parallelRequests={config.parallelRequests}
        onParallelRequestsChange={config.setParallelRequests}
        captionAllPresets={config.captionAllPresets}
        onCaptionAllPresetsChange={config.setCaptionAllPresets}
        selectedRuleset={cropRuleset}
        onRulesetChange={(r) => setCropRulesetId(r.id)}
        isProcessing={captionJob.isProcessing || isDetecting}
        workflowStep={workflowStep}
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
          isDetecting={isDetecting}
          canDetect={canDetect}
          onDetect={handleDetect}
          onAbortDetection={handleAbortDetection}
          detectionProgress={cropDetection.detectionProgress}
          detectionError={detectionError}
          onDismissDetectionError={() => setDetectionError(null)}
        />
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
          canProceedToCaption={canProceedToCaption}
          onProceedToCaption={handleProceedFromCrop}
          onBackToUpload={handleBackFromCrop}
        />
      )}

      {/* Step 3+: Results gallery after captioning */}
      {showGallery && (
        <ResultsGallery
          images={imageUpload.images}
          imageStatuses={mergedImageStatuses}
          croppedPreviews={croppedPreviews}
          onPreview={openPreview}
          captionProgress={captionJob.progress}
          captionProgressPercent={progressPercent}
          isProcessing={captionJob.isProcessing}
          isDownloading={captionJob.isDownloading}
          onAbortCaption={config.captionAllPresets ? captionJob.abortMultiPreset : captionJob.abortJob}
          onDownloadZip={config.captionAllPresets ? captionJob.downloadMultiPresetZip : captionJob.downloadZip}
          onClearAll={handleClearAll}
          captionAllPresets={config.captionAllPresets}
          presetResults={captionJob.presetResults}
          activePresetId={captionJob.activePresetId}
        />
      )}

      {previewImage && (
        <ImagePreviewModal
          key={previewImage.name}
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

      <PageFooter />
    </div>
  );
}
