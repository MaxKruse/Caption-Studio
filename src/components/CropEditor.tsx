"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageFile } from "./CaptionStudioTypes";
import type { BoundingBox, CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import { CropOverlay } from "./CropOverlay";

// Max dimension for crop preview images.
const CROP_PREVIEW_MAX_DIM = 1024;

// ---------------------------------------------------------------------------
// CropEditorView — shared image + overlay for editing a single crop
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
      <div className="lg:w-56 space-y-3 shrink-0">
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
            <span className="ml-1">swap type &amp; snap</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CropEditor — main crop editing interface (collapsible)
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
  skippedImageNames,
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
  skippedImageNames?: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Current image and crop
  const currentImage = images[selectedIndex];
  const currentCrop = crops.find((c) => c.imageIndex === selectedIndex);
  const currentDetection = detections.find((d) => d.imageIndex === selectedIndex);
  const isCurrentSkipped = skippedImageNames?.includes(currentImage?.name ?? "") ?? false;

  // If the selected image has no crop (skipped), find the first valid crop
  const hasValidCrop = !!currentCrop;
  const displayIndex = hasValidCrop
    ? selectedIndex
    : crops.length > 0 ? crops[0].imageIndex : 0;
  const displayImage = images[displayIndex];
  const displayCrop = hasValidCrop ? currentCrop : crops[0];
  const displayDetection = hasValidCrop
    ? currentDetection
    : detections.find((d) => d.imageIndex === (crops[0]?.imageIndex ?? 0));

  // Crop change handler for inline editor
  const handleCropChange = useCallback(
    (rect: Partial<{ x: number; y: number; width: number; height: number }>) => {
      onUpdateCropRect(displayIndex, rect);
    },
    [displayIndex, onUpdateCropRect]
  );

  // Toggle crop type for inline editor
  const handleToggleCropType = useCallback(() => {
    if (displayCrop) {
      onSetCropType(displayIndex, displayCrop.cropType === "face" ? "body" : "face");
    }
  }, [displayIndex, displayCrop, onSetCropType]);

  // If no crops at all, show a message instead of nothing
  if (crops.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
        <div className="px-5 py-8 text-center space-y-3">
          <p className="text-sm font-medium text-zinc-500">No crops to edit</p>
          <p className="text-xs text-zinc-400">
            {detections.every((d) => d.error)
              ? "All images failed detection. Please try different images or a different model."
              : "Run detection first to generate crops."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
      {/* Header — collapsible toggle */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200 text-left hover:bg-zinc-100 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${collapsed ? "" : "rotate-90"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium shrink-0">
          3
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Set Crops</h2>
        <p className="text-xs text-zinc-400 hidden sm:block">
          Adjust the crop box for each image and assign face or body
        </p>
        {crops.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto shrink-0">
            <span className={rulesetValidation.faceCount > rulesetValidation.expectedFaceRange[1] ? "text-red-500 font-medium" : ""}>
              {rulesetValidation.faceCount} face
            </span>
            {" / "}
            <span className={rulesetValidation.bodyCount > rulesetValidation.expectedBodyRange[1] ? "text-red-500 font-medium" : ""}>
              {rulesetValidation.bodyCount} body
            </span>
          </span>
        )}
      </button>

      {/* Collapsible body */}
      {!collapsed && (
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

          {/* Skipped image warning */}
          {isCurrentSkipped && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="font-semibold">{currentImage?.name} was skipped</p>
                <p className="mt-0.5">This image failed detection and will be omitted from crops and captioning.</p>
              </div>
            </div>
          )}

          {/* Main editor area — always visible when crops exist */}
          {crops.length > 0 && displayCrop && !isCurrentSkipped && (
            <CropEditorView
              image={displayImage!}
              crop={displayCrop}
              detection={displayDetection}
              onUpdateCropRect={handleCropChange}
              onSetCropType={handleToggleCropType}
              disabled={disabled}
            />
          )}
          {crops.length > 0 && isCurrentSkipped && (
            <div className="flex items-center justify-center min-h-[300px] bg-zinc-100 rounded-lg border-2 border-dashed border-zinc-200">
              <div className="text-center space-y-2">
                <svg className="w-8 h-8 mx-auto text-zinc-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p className="text-xs text-zinc-400">This image was skipped — select another image to edit</p>
              </div>
            </div>
          )}

          {/* Thumbnail strip */}
          {images.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500">
                Select image to edit ({selectedIndex + 1} of {images.length})
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2">
                {images.map((img, i) => {
                  const crop = crops.find((c) => c.imageIndex === i);
                  const isSelected = i === selectedIndex;
                  const isSkipped = skippedImageNames?.includes(img.name) ?? false;

                  return (
                    <button
                      key={img.name}
                      onClick={() => onSelectImage(i)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSkipped
                          ? "border-red-200 opacity-50"
                          : isSelected
                            ? "border-zinc-900 ring-2 ring-zinc-300"
                            : "border-zinc-200 hover:border-zinc-400"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      {isSkipped ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-100/60 pointer-events-none">
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm bg-red-500 text-white">
                            SKIP
                          </span>
                        </div>
                      ) : crop ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm ${
                            crop.cropType === "face"
                              ? "bg-blue-500 text-white"
                              : "bg-purple-500 text-white"
                          }`}>
                            {crop.cropType === "face" ? "F" : "B"}
                          </span>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
