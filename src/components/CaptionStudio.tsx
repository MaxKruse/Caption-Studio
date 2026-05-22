"use client";

import { useCallback, useEffect, useState } from "react";

import type { ImageFile } from "./CaptionStudioTypes";
export { formatDuration } from "./CaptionStudioTypes";
import { AppHeader } from "./AppHeader";
import { ConfigSection } from "./ConfigSection";
import { FailedImagesLog } from "./FailedImagesLog";
import { FloatingActionBar } from "./FloatingActionBar";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { JobErrorMessage } from "./JobErrorMessage";

import { ToastNotification } from "./ToastNotification";
import { UploadSection } from "./UploadSection";
import { useAppConfig } from "./hooks/useAppConfig";
import { useCaptionJob } from "./hooks/useCaptionJob";
import { useFetchModels } from "./hooks/useFetchModels";
import { useImageUpload } from "./hooks/useImageUpload";
import { usePreviewKeyboardNav } from "./hooks/usePreviewKeyboardNav";

// ---------------------------------------------------------------------------
// Main component
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

  // -- Image upload --
  const imageUpload = useImageUpload({
    isProcessing: false, // overridden by captionJob.isProcessing below
  });

  // -- Caption job --
  const captionJob = useCaptionJob({
    images: imageUpload.images,
    selectedModel,
    serverUrl: config.serverUrl,
    systemPrompt: config.systemPrompt,
    userPrompt: config.userPrompt,
    includeNameInPrompt: config.includeNameInPrompt,
    parallelRequests: config.parallelRequests,
    captionName: config.captionName,
    showToast: config.showToast,
    onDownloadComplete: () => {
      imageUpload.clearAll();
      config.setCaptionName("");
    },
  });

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
    (!config.includeNameInPrompt || !!config.captionName.trim());

  const jobDone = !!captionJob.jobId && !captionJob.isProcessing;

  const failedImages = imageUpload.images
    .map((img) => ({ img, status: captionJob.imageStatuses[img.name] }))
    .filter(({ status }) => status?.status === "failed");

  // -- Handlers --
  const handleClearAll = useCallback(() => {
    imageUpload.clearAll();
    captionJob.reset();
  }, [imageUpload, captionJob]);

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
        systemPrompt={config.systemPrompt}
        onSystemPromptChange={config.setSystemPrompt}
        userPrompt={config.userPrompt}
        onUserPromptChange={config.setUserPrompt}
        captionName={config.captionName}
        onCaptionNameChange={config.setCaptionName}
        includeNameInPrompt={config.includeNameInPrompt}
        onIncludeNameInPromptChange={config.setIncludeNameInPrompt}
        parallelRequests={config.parallelRequests}
        onParallelRequestsChange={config.setParallelRequests}
        isProcessing={captionJob.isProcessing}
        promptPrefixReadOnly={config.promptPrefixReadOnly}
        captionNameRequired={config.captionNameRequired}
      />

      <UploadSection
        images={imageUpload.images}
        imageStatuses={captionJob.imageStatuses}
        dragOver={imageUpload.dragOver}
        galleryOpen={imageUpload.galleryOpen}
        onGalleryToggle={() => imageUpload.setGalleryOpen((p) => !p)}
        clearAllConfirm={imageUpload.clearAllConfirm}
        onClearAllToggle={handleClearAllToggle}
        isProcessing={captionJob.isProcessing}
        isUploading={imageUpload.isUploading}
        onDragOver={imageUpload.handleDragOver}
        onDragLeave={imageUpload.handleDragLeave}
        onDrop={imageUpload.handleDrop}
        onFileChange={handleFileChange}
        onRemoveImage={imageUpload.removeImage}
        onPreview={openPreview}
        fileInputRef={imageUpload.fileInputRef}
      />

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
        onAddMore={() => imageUpload.fileInputRef.current?.click()}
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
