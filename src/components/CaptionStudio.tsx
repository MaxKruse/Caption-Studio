"use client";

import { useCallback, useEffect, useState } from "react";

import type { ImageFile, WorkflowStep } from "./CaptionStudioTypes";
import type { CropRuleset, ImageCrop } from "./CaptionStudioCropTypes";
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
import { useCaptionStudioDerived } from "./hooks/useCaptionStudioDerived";
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

  // -- Detection workflow --
  const { isDetecting, detectionError, setDetectionError, handleDetect, handleAbortDetection } =
    useDetection({
      images: imageUpload.images,
      serverUrl: config.serverUrl,
      contentMode: config.contentMode,
      parallelRequests: config.parallelRequests,
      selectedModel,
      cropRuleset,
      cropDetection,
      showToast: config.showToast,
      onStepChange: setWorkflowStep,
    });

  // -- Caption job --
  const captionJob = useCaptionJob({
    images: imageUpload.images,
    selectedModel,
    serverUrl: config.serverUrl,
    systemPrompt: config.systemPrompt,
    userPrompt: config.userPrompt,
    presetId: config.presetId,
    presetZipName: config.presetZipName,
    triggerWord: config.triggerWord,
    parallelRequests: config.parallelRequests,
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

  // -- Derived values --
  const derived = useCaptionStudioDerived({
    captionJob,
    cropDetection,
    imageUpload,
    config,
    isDetecting,
    selectedModel,
    workflowStep,
  });

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
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8 pb-20">
      <AppHeader />

      <ToastNotification toast={config.toast} onClose={config.hideToast} />

      <JobErrorMessage
        message={captionJob.jobError}
        onDismiss={captionJob.clearJobError}
      />

      {derived.jobDone && derived.failedImages.length > 0 && (
        <FailedImagesLog
          failedImages={derived.failedImages}
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
        selectedRuleset={cropRuleset}
        onRulesetChange={setCropRuleset}
        isProcessing={captionJob.isProcessing || isDetecting}
      />

      {/* Step 2: Upload */}
      {derived.showUploadSection && (
        <UploadSection
          images={imageUpload.images}
          imageStatuses={derived.mergedImageStatuses}
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
      {(derived.displayStep === "detect" || derived.displayStep === "crop") && detectionError && (
        <JobErrorMessage
          message={detectionError}
          onDismiss={() => setDetectionError(null)}
        />
      )}

      {/* Step 2.5: Crop Editor */}
      {derived.showCropEditor && (
        <CropEditor
          images={imageUpload.images}
          ruleset={cropRuleset}
          crops={crops}
          detections={detections}
          detectionError={detectionError}
          rulesetValid={cropDetection.rulesetValid}
          rulesetValidation={derived.rulesetValidation}
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
      {derived.showGallery && (
        <ResultsGallery
          images={imageUpload.images}
          imageStatuses={derived.mergedImageStatuses}
          croppedPreviews={croppedPreviews}
          onPreview={openPreview}
        />
      )}

      {/* Floating Action Bar */}
      <FloatingActionBar
        step={derived.actionBarStep}
        imagesCount={imageUpload.images.length}
        detectionProgress={cropDetection.detectionProgress}
        captionProgress={captionJob.progress}
        captionProgressPercent={derived.progressPercent}
        onDetect={handleDetect}
        onAbortDetection={handleAbortDetection}
        onProceedToCaption={derived.canProceedToCaption ? handleProceedFromCrop : undefined}
        onBackToUpload={handleBackFromCrop}
        onAbortCaption={captionJob.abortJob}
        onDownloadZip={captionJob.downloadZip}
        onClearAll={handleClearAllToggle}
        canDetect={derived.canDetect}
        canProceedToCaption={derived.canProceedToCaption}
        rulesetValid={cropDetection.rulesetValid}
        rulesetValidation={derived.rulesetValidation}
      />

      {previewImage && (
        <ImagePreviewModal
          img={previewImage}
          status={derived.mergedImageStatuses[previewImage.name] ?? captionJob.imageStatuses[previewImage.name] ?? { status: "queued" }}
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
