"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBox, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import type { ImageFile } from "./CaptionStudioTypes";
import { CropOverlay } from "./CropOverlay";

// Max dimension for crop preview images.
const CROP_PREVIEW_MAX_DIM = 1024;

// ---------------------------------------------------------------------------
// CropEditorView — shared image + overlay for editing a single crop
// ---------------------------------------------------------------------------

export function CropEditorView({
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
