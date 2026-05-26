"use client";

import { useCallback, useEffect, useState } from "react";

import type { ImageFile, WorkflowStep } from "./CaptionStudioTypes";
import type { CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import { CROP_RULESETS } from "./CaptionStudioCropConstants";
export { formatDuration } from "./CaptionStudioTypes";
import { AppHeader } from "./AppHeader";
import { ConfigSection } from "./ConfigSection";
import { CropEditor } from "./CropEditor";
import { FailedImagesLog } from "./FailedImagesLog";
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

        // Check if done by parsing the event data
        const parsed = JSON.parse(event.data);
        if (parsed.done) {
          es.close();

          // Convert SSE statuses to DetectionResult[]
          type SseStatus = { status: string; faceBoxes?: DetectionResult["faceBoxes"]; bodyBoxes?: DetectionResult["bodyBoxes"]; error?: string };
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

          // Check for errors
          const hasErrors = results.some((r) => r.error);
          if (hasErrors) {
            setDetectionError(`${results.filter((r) => r.error).length} image(s) failed detection`);
          }

          // Auto-assign crops based on ruleset
          cropDetection.autoAssignCrops();

          // Move to crop step
          setWorkflowStep("crop");
        }
      };

      es.onerror = () => {
        es.close();
        sseHandlers.onError();
        setDetectionError("Detection connection lost");
        setWorkflowStep("upload");
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Detection failed";
      setDetectionError(message);
      config.showToast(message);
      setWorkflowStep("upload");
      setIsDetecting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropRuleset, imageUpload.images, selectedModel, config.serverUrl, config.showToast, cropDetection]);

  // -- Crop auto-assign handler --
  const handleAutoAssign = useCallback(() => {
    cropDetection.autoAssignCrops();
  }, [cropDetection]);

  // -- Crop update handler --
  const handleUpdateCrop = useCallback((imageIndex: number, partial: Partial<ImageCrop>) => {
    cropDetection.updateCrop(imageIndex, partial);
  }, [cropDetection]);

  // -- Proceed from crop to caption --
  const handleProceedFromCrop = useCallback(() => {
    setWorkflowStep("caption");
  }, []);

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

  const canCaption =
    !captionJob.isProcessing &&
    imageUpload.images.length > 0 &&
    !!selectedModel &&
    !!config.serverUrl.trim() &&
    !config.triggerRequired &&
    !config.nameRequired;

  const canDetect =
    !isDetecting &&
    imageUpload.images.length > 0 &&
    !!selectedModel &&
    !!cropRuleset &&
    !!config.serverUrl.trim();

  const jobDone = !!captionJob.jobId && !captionJob.isProcessing;

  const failedImages = imageUpload.images
    .map((img) => ({ img, status: captionJob.imageStatuses[img.name] }))
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

  // -- Derived display step — auto-transitions based on state --
  const showUploadSection = workflowStep !== "crop" && workflowStep !== "caption" && workflowStep !== "done";
  const showCropEditor = workflowStep === "crop";
  const showGallery = workflowStep === "caption" || workflowStep === "done";

  // -- Render --
  const crops = cropDetection.getFinalCrops();
  const detections = cropDetection.state.detections;

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

      {/* Step 2: Upload (visible in configure, upload, detect steps) */}
      {showUploadSection && (
        <UploadSection
          images={imageUpload.images}
          imageStatuses={captionJob.imageStatuses}
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
          onDetect={canDetect ? handleDetect : undefined}
          detectionError={detectionError}
          detectionProgress={cropDetection.detectionProgress}
          detectionTotal={imageUpload.images.length}
        />
      )}

      {/* Step 2.5: Crop Editor */}
      {showCropEditor && (
        <CropEditor
          images={imageUpload.images}
          selectedModel={selectedModel}
          ruleset={cropRuleset}
          onRulesetChange={setCropRuleset}
          crops={crops}
          detections={detections}
          isDetecting={isDetecting}
          detectionError={detectionError}
          onDetect={handleDetect}
          onAutoAssign={handleAutoAssign}
          onUpdateCrop={handleUpdateCrop}
          onBack={handleBackFromCrop}
          onProceed={handleProceedFromCrop}
          disabled={captionJob.isProcessing}
        />
      )}

      {/* Step 3+: Gallery after captioning */}
      {showGallery && (
        <UploadSection
          images={imageUpload.images}
          imageStatuses={captionJob.imageStatuses}
          dragOver={imageUpload.dragOver}
          galleryOpen={true}
          onGalleryToggle={() => {}}
          clearAllConfirm={false}
          onClearAllToggle={() => {}}
          isProcessing={captionJob.isProcessing}
          isUploading={false}
          onDragOver={() => {}}
          onDragLeave={() => {}}
          onDrop={() => {}}
          onFileChange={() => {}}
          onRemoveImage={() => {}}
          onPreview={openPreview}
          fileInputRef={imageUpload.fileInputRef}
        />
      )}

      <FloatingActionBar
        imagesCount={imageUpload.images.length}
        canCaption={canCaption}
        isProcessing={captionJob.isProcessing}
        jobId={captionJob.jobId}
        progress={captionJob.progress}
        progressPercent={progressPercent}
        estimatedRemainingMs={captionJob.progress.estimatedRemainingMs}
        avgTimeMs={captionJob.progress.avgTimeMs}
        onStartCaptioning={captionJob.startCaptioning}
        onAbort={captionJob.abortJob}
        onAddMore={() => {
          if (showUploadSection) {
            imageUpload.fileInputRef.current?.click();
          }
        }}
        onClearAll={handleClearAllToggle}
        onDownloadZip={captionJob.downloadZip}
        jobDone={jobDone}
      />

      {previewImage && (
        <ImagePreviewModal
          img={previewImage}
          status={captionJob.imageStatuses[previewImage.name] ?? { status: "queued" }}
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
