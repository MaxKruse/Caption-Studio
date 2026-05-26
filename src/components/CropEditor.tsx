"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageFile } from "./CaptionStudioTypes";
import type { BoundingBox, CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import { CropOverlay } from "./CropOverlay";

// Max dimension for crop preview images.
const CROP_PREVIEW_MAX_DIM = 1024;

// ---------------------------------------------------------------------------
// CropEditorView — shared image + overlay used by inline editor and modal
// ---------------------------------------------------------------------------

function CropEditorView({
  image,
  crop,
  detection,
  onUpdateCropRect,
  onSetCropType,
  disabled,
}: {
  image: ImageFile;
  crop: ImageCrop;
  detection: DetectionResult | undefined;
  onUpdateCropRect: (rect: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onSetCropType: (type: "face" | "body") => void;
  disabled?: boolean;
  className?: string;
}) {
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  const [scaledPreviewUrl, setScaledPreviewUrl] = useState<string | null>(null);
  const [renderedImage, setRenderedImage] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Build combined bounding boxes for overlay
  const boundingBoxes: BoundingBox[] = [];
  if (detection) {
    for (const bb of detection.faceBoxes) {
      boundingBoxes.push({ ...bb, label: bb.label || "face" });
    }
    for (const bb of detection.bodyBoxes) {
      boundingBoxes.push({ ...bb, label: bb.label || "body" });
    }
  }

  // Scale image to 1024px max dimension for preview
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(image.file);
    const img = new Image();

    img.onload = () => {
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }

      setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight });

      const origWidth = img.naturalWidth;
      const origHeight = img.naturalHeight;
      const biggest = Math.max(origWidth, origHeight);

      if (biggest <= CROP_PREVIEW_MAX_DIM) {
        setScaledPreviewUrl(url);
      } else {
        const scale = CROP_PREVIEW_MAX_DIM / biggest;
        const newWidth = Math.round(origWidth * scale);
        const newHeight = Math.round(origHeight * scale);

        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          URL.revokeObjectURL(url);
          setScaledPreviewUrl(canvas.toDataURL("image/jpeg", 0.92));
        }
      }
    };

    img.onerror = () => {
      if (!cancelled) {
        URL.revokeObjectURL(url);
        setScaledPreviewUrl(null);
      }
    };

    img.src = url;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [image.name, image.file]);

  // Measure the actual rendered image position/size within the container.
  const handleImageLoad = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const imageRect = imageRef.current.getBoundingClientRect();

    setRenderedImage({
      x: imageRect.left - containerRect.left,
      y: imageRect.top - containerRect.top,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, []);

  // Re-measure on container resize
  useEffect(() => {
    if (!scaledPreviewUrl) return;

    const measure = () => {
      if (!imageRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const imageRect = imageRef.current.getBoundingClientRect();
      setRenderedImage({
        x: imageRect.left - containerRect.left,
        y: imageRect.top - containerRect.top,
        width: imageRect.width,
        height: imageRect.height,
      });
    };

    const timer = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(timer);
      window.removeEventListener("resize", measure);
    };
  }, [scaledPreviewUrl]);

  // Toggle crop type
  const handleToggleCropType = useCallback(() => {
    onSetCropType(crop.cropType === "face" ? "body" : "face");
  }, [crop.cropType, onSetCropType]);

  const isReady = scaledPreviewUrl !== null && renderedImage !== null && renderedImage.width > 0;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Image with crop overlay */}
      <div
        ref={containerRef}
        className="relative flex-1 min-w-0 bg-zinc-900 rounded-lg overflow-hidden"
        style={{ minHeight: 300 }}
      >
        {scaledPreviewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={scaledPreviewUrl}
              alt={image.name}
              className="w-full h-full object-contain block"
              onLoad={handleImageLoad}
            />

            {isReady && (
              <CropOverlay
                cropRect={crop.cropRect}
                boundingBoxes={boundingBoxes}
                imageWidth={originalSize.width}
                imageHeight={originalSize.height}
                imageOffsetX={renderedImage.x}
                imageOffsetY={renderedImage.y}
                imageDisplayWidth={renderedImage.width}
                imageDisplayHeight={renderedImage.height}
                cropType={crop.cropType}
                onChange={onUpdateCropRect}
                disabled={disabled}
              />
            )}

            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Preparing crop editor&hellip;
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading image&hellip;
            </div>
          </div>
        )}
      </div>

      {/* Info sidebar */}
      <div className="space-y-3 shrink-0">
        <div className="rounded-lg border border-zinc-200 p-3 space-y-2">
          <p className="text-xs font-medium text-zinc-500">Selected Image</p>
          <p className="text-xs text-zinc-700 truncate" title={image.name}>
            {image.name}
          </p>

          <button
            onClick={handleToggleCropType}
            disabled={!!disabled}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              crop.cropType === "face"
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-purple-500 text-white hover:bg-purple-600"
            } disabled:opacity-50`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {crop.cropType === "face" ? "Face" : "Body"}
            <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-3.75 3.75h5.25" />
            </svg>
          </button>
        </div>

        {originalSize.width > 0 && (
          <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Crop Output</p>
            <p className="text-sm font-semibold text-zinc-700 font-mono">
              {Math.round((crop.cropRect.width / 1000) * originalSize.width)}
              <span className="text-zinc-400 mx-1">&times;</span>
              {Math.round((crop.cropRect.height / 1000) * originalSize.height)}
              <span className="text-[10px] font-medium text-zinc-400 ml-1">px</span>
            </p>
            {crop.autoDetected && (
              <span className="text-[9px] text-zinc-400">auto-detected</span>
            )}
          </div>
        )}

        {originalSize.width > 0 && (
          <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Original Image</p>
            <p className="text-xs text-zinc-600 font-mono">
              {originalSize.width}&times;{originalSize.height} px
            </p>
          </div>
        )}

        {detection && (
          <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Detection</p>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm border border-dashed border-blue-400/50" />
                {detection.faceBoxes.length} face
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm border border-dashed border-purple-400/50" />
                {detection.bodyBoxes.length} body
              </span>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-zinc-100 p-3 space-y-1.5">
          <p className="text-[10px] text-zinc-400">
            <span className="font-mono bg-zinc-100 px-1 rounded">&larr;</span>
            <span className="font-mono bg-zinc-100 px-1 rounded ml-1">&rarr;</span>
            <span className="ml-1">navigate images</span>
          </p>
          <p className="text-[10px] text-zinc-400">
            <span className="font-mono bg-zinc-100 px-1 rounded">Space</span>
            <span className="ml-1">toggle face/body</span>
          </p>
          <p className="text-[10px] text-zinc-400">
            <span className="font-mono bg-zinc-100 px-1 rounded">Esc</span>
            <span className="ml-1">close modal</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CropEditorModal — fullscreen modal for editing a single image's crop
// ---------------------------------------------------------------------------

function CropEditorModal({
  image,
  crop,
  detection,
  onUpdateCropRect,
  onSetCropType,
  onClose,
  disabled,
}: {
  image: ImageFile;
  crop: ImageCrop;
  detection: DetectionResult | undefined;
  onUpdateCropRect: (rect: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onSetCropType: (type: "face" | "body") => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit crop for ${image.name}`}
    >
      <div className="relative w-full max-w-6xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200 shrink-0">
          <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
            3
          </div>
          <h2 className="text-sm font-semibold text-zinc-900">Edit Crop</h2>
          <p className="text-xs text-zinc-400 truncate">{image.name}</p>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-auto p-5">
          <CropEditorView
            image={image}
            crop={crop}
            detection={detection}
            onUpdateCropRect={onUpdateCropRect}
            onSetCropType={onSetCropType}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CropEditor — main crop editing interface
// ---------------------------------------------------------------------------

export function CropEditor({
  images,
  ruleset,
  crops,
  detections,
  detectionError,
  rulesetValid,
  rulesetValidation,
  onAutoAssign,
  onUpdateCropRect,
  onSetCropType,
  onResetCrop,
  onSelectImage,
  selectedIndex,
  disabled,
}: {
  images: ImageFile[];
  ruleset: CropRuleset | null;
  crops: ImageCrop[];
  detections: DetectionResult[];
  detectionError: string | null;
  rulesetValid: boolean;
  rulesetValidation: { faceCount: number; bodyCount: number; expectedFaceRange: [number, number]; expectedBodyRange: [number, number] };
  onAutoAssign: () => void;
  onUpdateCropRect: (imageIndex: number, rect: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onSetCropType: (imageIndex: number, cropType: "face" | "body") => void;
  onResetCrop: (imageIndex: number) => void;
  onSelectImage: (index: number) => void;
  selectedIndex: number;
  disabled?: boolean;
}) {
  // Modal state — which image index is being edited in the modal
  const [modalImageIndex, setModalImageIndex] = useState<number | null>(null);

  // Current image and crop (for inline editor)
  const currentImage = images[selectedIndex];
  const currentCrop = crops.find((c) => c.imageIndex === selectedIndex);
  const currentDetection = detections.find((d) => d.imageIndex === selectedIndex);

  // Crop change handler for inline editor
  const handleCropChange = useCallback(
    (rect: Partial<{ x: number; y: number; width: number; height: number }>) => {
      onUpdateCropRect(selectedIndex, rect);
    },
    [selectedIndex, onUpdateCropRect]
  );

  // Toggle crop type for inline editor
  const handleToggleCropType = useCallback(() => {
    if (currentCrop) {
      onSetCropType(selectedIndex, currentCrop.cropType === "face" ? "body" : "face");
    }
  }, [selectedIndex, currentCrop, onSetCropType]);

  // Open modal for editing a specific image
  const handleOpenModal = useCallback((index: number) => {
    setModalImageIndex(index);
    // Also update inline selection for consistency
    onSelectImage(index);
  }, [onSelectImage]);

  // Close modal
  const handleCloseModal = useCallback(() => {
    setModalImageIndex(null);
  }, []);

  // Modal crop handlers
  const handleModalCropChange = useCallback(
    (rect: Partial<{ x: number; y: number; width: number; height: number }>) => {
      if (modalImageIndex !== null) {
        onUpdateCropRect(modalImageIndex, rect);
      }
    },
    [modalImageIndex, onUpdateCropRect]
  );

  const handleModalSetCropType = useCallback(
    (type: "face" | "body") => {
      if (modalImageIndex !== null) {
        onSetCropType(modalImageIndex, type);
      }
    },
    [modalImageIndex, onSetCropType]
  );

  if (!currentImage || !currentCrop) return null;

  // Modal image data
  const modalImage = modalImageIndex !== null ? images[modalImageIndex] : null;
  const modalCrop = modalImage ? crops.find((c) => c.imageIndex === modalImageIndex) : null;
  const modalDetection = modalImage ? detections.find((d) => d.imageIndex === modalImageIndex) : undefined;

  return (
    <>
      <section className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
          <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
            3
          </div>
          <h2 className="text-sm font-semibold text-zinc-900">Set Crops</h2>
          <p className="text-xs text-zinc-400 hidden sm:block">
            Adjust the crop box for each image and assign face or body
          </p>
          {crops.length > 0 && (
            <span className="text-xs text-zinc-400 ml-auto">
              <span className={rulesetValidation.faceCount > rulesetValidation.expectedFaceRange[1] ? "text-red-500 font-medium" : ""}>
                {rulesetValidation.faceCount} face
              </span>
              {" / "}
              <span className={rulesetValidation.bodyCount > rulesetValidation.expectedBodyRange[1] ? "text-red-500 font-medium" : ""}>
                {rulesetValidation.bodyCount} body
              </span>
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Ruleset validation warning */}
          {!rulesetValid && ruleset && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="font-semibold">Crop ratio doesn&apos;t match ruleset</p>
                <p className="mt-0.5">
                  Ruleset {ruleset.label} expects {rulesetValidation.expectedFaceRange[0]}&ndash;{rulesetValidation.expectedFaceRange[1]} face and {rulesetValidation.expectedBodyRange[0]}&ndash;{rulesetValidation.expectedBodyRange[1]} body crops.
                  Currently: {rulesetValidation.faceCount} face, {rulesetValidation.bodyCount} body.
                </p>
              </div>
            </div>
          )}

          {/* Detection error */}
          {detectionError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{detectionError}</span>
            </div>
          )}

          {/* Controls bar */}
          {crops.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {ruleset && (
                  <span className="text-xs text-zinc-400">
                    Ruleset: <span className="font-medium text-zinc-600">{ruleset.label}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onResetCrop(selectedIndex)}
                  disabled={!!disabled}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  title="Reset this image&apos;s crop to auto-detected defaults"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Reset
                </button>
                <button
                  onClick={onAutoAssign}
                  disabled={!!disabled}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.49 12l.01-.01L9.01 4.49 9 2.25 12.003 2.25 18.75 9 16.5 9.003 16.5 12.003 18.75 12.003 18.75 15 16.5 15 16.5 16.5 12 16.5 12 18.75 9.003 18.75 9 16.5 6.75 16.5 6.747 14.25 9.003 12 9 12z" />
                  </svg>
                  Re-assign all
                </button>
              </div>
            </div>
          )}

          {/* Main editor area — always visible when crops exist */}
          {crops.length > 0 && currentCrop && (
            <CropEditorView
              image={currentImage}
              crop={currentCrop}
              detection={currentDetection}
              onUpdateCropRect={handleCropChange}
              onSetCropType={handleToggleCropType}
              disabled={disabled}
            />
          )}

          {/* Thumbnail strip */}
          {images.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500">
                Select image to edit ({selectedIndex + 1} of {images.length}) &middot;{" "}
                <span className="text-zinc-400">Click thumbnail to open full editor</span>
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2">
                {images.map((img, i) => {
                  const crop = crops.find((c) => c.imageIndex === i);
                  const isSelected = i === selectedIndex;

                  return (
                    <button
                      key={img.name}
                      onClick={() => handleOpenModal(i)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group ${
                        isSelected
                          ? "border-zinc-900 ring-2 ring-zinc-300"
                          : "border-zinc-200 hover:border-zinc-400"
                      }`}
                      title={`Click to edit crop for ${img.name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      {crop && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm ${
                            crop.cropType === "face"
                              ? "bg-blue-500 text-white"
                              : "bg-purple-500 text-white"
                          }`}>
                            {crop.cropType === "face" ? "F" : "B"}
                          </span>
                        </div>
                      )}
                      {/* Hover hint */}
                      <div className="absolute inset-0 bg-zinc-900/0 group-hover:bg-zinc-900/20 transition-colors flex items-center justify-center pointer-events-none">
                        <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Modal — opens when clicking a thumbnail */}
      {modalImageIndex !== null && modalImage && modalCrop && (
        <CropEditorModal
          image={modalImage}
          crop={modalCrop}
          detection={modalDetection}
          onUpdateCropRect={handleModalCropChange}
          onSetCropType={handleModalSetCropType}
          onClose={handleCloseModal}
          disabled={disabled}
        />
      )}
    </>
  );
}
