"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageFile } from "./CaptionStudioTypes";
import type { BoundingBox, CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import { CropOverlay } from "./CropOverlay";

type ActiveCropTarget = "face" | "body";

// ---------------------------------------------------------------------------
// CropEditor — main crop editing interface
// ---------------------------------------------------------------------------

export function CropEditor({
  images,
  ruleset,
  crops,
  detections,
  detectionError,
  onAutoAssign,
  onUpdateCrop,
  disabled,
}: {
  images: ImageFile[];
  ruleset: CropRuleset | null;
  crops: ImageCrop[];
  detections: DetectionResult[];
  detectionError: string | null;
  onAutoAssign: () => void;
  onUpdateCrop: (imageIndex: number, cropTarget: "face" | "body", rect: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  disabled?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCropTarget, setActiveCropTarget] = useState<ActiveCropTarget>("face");

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
  const activeRect = currentCrop
    ? activeCropTarget === "face" ? currentCrop.faceCrop : currentCrop.bodyCrop
    : null;

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

  // Handlers
  const handleCropChange = useCallback(
    (rect: Partial<{ x: number; y: number; width: number; height: number }>) => {
      onUpdateCrop(selectedIndex, activeCropTarget, rect);
    },
    [selectedIndex, activeCropTarget, onUpdateCrop]
  );

  const handleActiveCropChange = useCallback(
    (target: "face" | "body") => {
      setActiveCropTarget(target);
    },
    []
  );

  if (!currentImage) return null;

  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          3
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Crop Images</h2>
        {crops.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {crops.filter((c) => c.selectedCrop === "face").length} face · {crops.filter((c) => c.selectedCrop === "body").length} body
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
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
            <button
              onClick={onAutoAssign}
              disabled={!!disabled}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Re-assign crops
            </button>
          </div>
        )}

        {/* Detection error */}
        {detectionError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {detectionError}
          </div>
        )}

        {/* Main editor area */}
        {crops.length > 0 && currentCrop && activeRect && (
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
                  activeCrop={activeCropTarget}
                  onChange={handleCropChange}
                  onActiveCropChange={handleActiveCropChange}
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
                    currentCrop?.selectedCrop === "face"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-purple-50 text-purple-700"
                  }`}>
                    assigned: {currentCrop?.selectedCrop}
                  </span>
                </div>
              </div>

              {/* Face crop resolution */}
              {originalSize.width > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-zinc-400">Face Crop</p>
                  <p className="text-sm font-semibold text-zinc-700 font-mono">
                    {Math.round((currentCrop.faceCrop.width / 1000) * originalSize.width)}
                    <span className="text-zinc-400 mx-1">&times;</span>
                    {Math.round((currentCrop.faceCrop.height / 1000) * originalSize.height)}
                    <span className="text-[10px] font-medium text-zinc-400 ml-1">px</span>
                  </p>
                  {currentCrop.faceAutoDetected && (
                    <span className="text-[9px] text-zinc-400">auto-detected</span>
                  )}
                </div>
              )}

              {/* Body crop resolution */}
              {originalSize.width > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-zinc-400">Body Crop</p>
                  <p className="text-sm font-semibold text-zinc-700 font-mono">
                    {Math.round((currentCrop.bodyCrop.width / 1000) * originalSize.width)}
                    <span className="text-zinc-400 mx-1">&times;</span>
                    {Math.round((currentCrop.bodyCrop.height / 1000) * originalSize.height)}
                    <span className="text-[10px] font-medium text-zinc-400 ml-1">px</span>
                  </p>
                  {currentCrop.bodyAutoDetected && (
                    <span className="text-[9px] text-zinc-400">auto-detected</span>
                  )}
                </div>
              )}

              {/* Active crop coordinates */}
              <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
                <p className="text-[10px] font-medium text-zinc-400">{activeCropTarget === "face" ? "Face" : "Body"} (normalized)</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  x: {Math.round(activeRect.x)} y: {Math.round(activeRect.y)}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  w: {Math.round(activeRect.width)} h: {Math.round(activeRect.height)}
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
                  onClick={() => {
                    setSelectedIndex(i);
                    if (crop) setActiveCropTarget(crop.selectedCrop);
                  }}
                  className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                    isSelected
                      ? "border-blue-500 ring-1 ring-blue-200"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                  {crop && (
                    <div className="absolute bottom-0 inset-x-0">
                      <span className={`block w-full text-[7px] text-center py-0.5 font-medium ${
                        crop.selectedCrop === "face"
                          ? "bg-blue-500/80 text-white"
                          : "bg-purple-500/80 text-white"
                      }`}>
                        {crop.selectedCrop === "face" ? "F" : "B"}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>


      </div>
    </section>
  );
}
