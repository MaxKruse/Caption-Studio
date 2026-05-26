"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageFile } from "./CaptionStudioTypes";
import type { BoundingBox, CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import { CropRulesetSelector } from "./CropRulesetSelector";
import { CropOverlay } from "./CropOverlay";

// ---------------------------------------------------------------------------
// CropEditor — main crop editing interface
// ---------------------------------------------------------------------------

export function CropEditor({
  images,
  selectedModel,
  ruleset,
  onRulesetChange,
  crops,
  detections,
  isDetecting,
  detectionError,
  onDetect,
  onAutoAssign,
  onUpdateCrop,
  onBack,
  onProceed,
  disabled,
}: {
  images: ImageFile[];
  selectedModel: string;
  ruleset: CropRuleset | null;
  onRulesetChange: (ruleset: CropRuleset) => void;
  crops: ImageCrop[];
  detections: DetectionResult[];
  isDetecting: boolean;
  detectionError: string | null;
  onDetect: () => Promise<void>;
  onAutoAssign: () => void;
  onUpdateCrop: (imageIndex: number, partial: Partial<ImageCrop>) => void;
  onBack: () => void;
  onProceed: () => void;
  disabled?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  // Original image dimensions (from the actual file, not the thumbnail)
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Measure container and image dimensions
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageSize({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
    }
  }, []);

  // Current image and crop
  const currentImage = images[selectedIndex];
  const currentCrop = crops.find((c) => c.imageIndex === selectedIndex);
  const currentDetection = detections.find((d) => d.imageIndex === selectedIndex);

  // Build combined bounding boxes for overlay (face + body)
  const boundingBoxes: BoundingBox[] = [];
  if (currentDetection) {
    for (const bb of currentDetection.faceBoxes) {
      boundingBoxes.push({ ...bb, label: "face" });
    }
    for (const bb of currentDetection.bodyBoxes) {
      boundingBoxes.push({ ...bb, label: "body" });
    }
  }

  // Load original image dimensions from the file
  useEffect(() => {
    if (!currentImage) return;

    const url = URL.createObjectURL(currentImage.file);
    const img = new Image();
    img.onload = () => {
      setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage?.name, currentImage?.file]);

  // Derived values
  const portraitCrops = crops.filter((c) => c.cropType === "portrait").length;
  const bodyCrops = crops.filter((c) => c.cropType === "body").length;
  const canProceed = crops.length > 0 && !isDetecting;

  // Handlers
  const handleCropChange = useCallback(
    (partial: Partial<ImageCrop>) => {
      onUpdateCrop(selectedIndex, partial);
    },
    [selectedIndex, onUpdateCrop]
  );

  const handleCropTypeChange = useCallback(
    (type: "portrait" | "body") => {
      onUpdateCrop(selectedIndex, { cropType: type });
    },
    [selectedIndex, onUpdateCrop]
  );

  if (!currentImage) return null;

  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          2.5
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Crop Images</h2>
        {ruleset && (
          <span className="text-xs text-zinc-400 ml-auto">
            {portraitCrops} portrait / {bodyCrops} body
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Ruleset selector + detection controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex-1">
            <CropRulesetSelector
              selected={ruleset}
              onSelect={onRulesetChange}
              disabled={isDetecting || !!disabled}
            />
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {crops.length === 0 ? (
              <button
                onClick={onDetect}
                disabled={isDetecting || !ruleset || !!disabled || !selectedModel}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-zinc-900 text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDetecting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                    Detecting...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    Detect Faces &amp; Bodies
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onAutoAssign}
                disabled={isDetecting || !!disabled}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                Re-assign crops
              </button>
            )}
          </div>
        </div>

        {/* Detection error */}
        {detectionError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {detectionError}
          </div>
        )}

        {/* Main editor area */}
        {crops.length > 0 && currentCrop && (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Image with crop overlay */}
            <div
              ref={containerRef}
              className="relative flex-1 bg-zinc-900 rounded-lg overflow-hidden"
              style={{ aspectRatio: "1" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={currentImage.preview}
                alt={currentImage.name}
                className="w-full h-full object-contain"
                onLoad={handleImageLoad}
              />

              {/* Crop overlay */}
              {containerSize.width > 0 && imageSize.width > 0 && (
                <CropOverlay
                  crop={currentCrop}
                  boundingBoxes={boundingBoxes}
                  imageWidth={originalSize.width}
                  imageHeight={originalSize.height}
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                  onChange={handleCropChange}
                  onCropTypeChange={handleCropTypeChange}
                  disabled={disabled}
                />
              )}
            </div>

            {/* Image info sidebar */}
            <div className="lg:w-48 space-y-3 shrink-0">
              <div className="rounded-lg border border-zinc-200 p-3 space-y-2">
                <p className="text-xs font-medium text-zinc-500">Selected Image</p>
                <p className="text-xs text-zinc-700 truncate" title={currentImage.name}>
                  {currentImage.name}
                </p>
                <div className="flex gap-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    currentCrop.cropType === "portrait"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-purple-50 text-purple-700"
                  }`}>
                    {currentCrop.cropType}
                  </span>
                  {currentCrop.autoDetected && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 text-zinc-500">
                      auto
                    </span>
                  )}
                </div>
              </div>

              {/* Crop resolution display */}
              {originalSize.width > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-zinc-400">Crop Resolution</p>
                  <p className="text-sm font-semibold text-zinc-700 font-mono">
                    {Math.round((currentCrop.cropRect.width / 1000) * originalSize.width)}
                    <span className="text-zinc-400 mx-1">&times;</span>
                    {Math.round((currentCrop.cropRect.height / 1000) * originalSize.height)}
                    <span className="text-[10px] font-medium text-zinc-400 ml-1">px</span>
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    from {originalSize.width} &times; {originalSize.height}
                  </p>
                </div>
              )}

              {/* Crop coordinates display */}
              <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
                <p className="text-[10px] font-medium text-zinc-400">Crop (normalized)</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  x: {Math.round(currentCrop.cropRect.x)} y: {Math.round(currentCrop.cropRect.y)}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  w: {Math.round(currentCrop.cropRect.width)} h: {Math.round(currentCrop.cropRect.height)}
                </p>
              </div>

              {/* Detection info */}
              {currentDetection && (
                <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-zinc-400">Detection</p>
                  <p className="text-[10px] text-zinc-500">
                    {currentDetection.faceBoxes.length} face{currentDetection.faceBoxes.length !== 1 ? "s" : ""} &middot; {currentDetection.bodyBoxes.length} bod{currentDetection.bodyBoxes.length === 1 ? "y" : "ies"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Image grid navigation */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500">
            Select image to edit ({selectedIndex + 1} of {images.length})
          </p>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {images.map((img, i) => {
              const crop = crops.find((c) => c.imageIndex === i);
              const isSelected = i === selectedIndex;

              return (
                <button
                  key={img.name}
                  onClick={() => setSelectedIndex(i)}
                  className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                    isSelected
                      ? "border-blue-500 ring-1 ring-blue-200"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                  {crop && (
                    <span className={`absolute bottom-0 inset-x-0 text-[7px] text-center py-0.5 font-medium ${
                      crop.cropType === "portrait"
                        ? "bg-blue-500/80 text-white"
                        : "bg-purple-500/80 text-white"
                    }`}>
                      {crop.cropType === "portrait" ? "P" : "B"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
          <button
            onClick={onBack}
            disabled={isDetecting || !!disabled}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            Back to upload
          </button>
          <button
            onClick={onProceed}
            disabled={!canProceed || !!disabled}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-zinc-900 text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Proceed to caption
          </button>
        </div>
      </div>
    </section>
  );
}
