"use client";

import { useCallback, useRef } from "react";
import type { BoundingBox, ImageCrop } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// CropOverlay — interactive crop rectangle on an image
// Free aspect ratio — no lock
// ---------------------------------------------------------------------------

interface CropOverlayProps {
  crop: ImageCrop;
  boundingBoxes: BoundingBox[];
  imageWidth: number;  // actual image pixel width
  imageHeight: number; // actual image pixel height
  containerWidth: number;  // displayed container width
  containerHeight: number; // displayed container height
  onChange: (crop: Partial<ImageCrop>) => void;
  onCropTypeChange: (type: "portrait" | "body") => void;
  disabled?: boolean;
}

export function CropOverlay({
  crop,
  boundingBoxes,
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  onChange,
  onCropTypeChange,
  disabled,
}: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ type: "move" | "resize" | "snap"; startX: number; startY: number; origCrop: typeof crop.cropRect } | null>(null);

  // Scale factor: 1000-normalized → container pixels
  const scaleX = containerWidth / 1000;
  const scaleY = containerHeight / 1000;

  // Convert 1000-normalized to container pixels
  const toPixel = (val: number, isX: boolean) => val * (isX ? scaleX : scaleY);

  // Compute actual cropped resolution (in real image pixels)
  const cropResolution = imageWidth > 0 && imageHeight > 0
    ? {
        width: Math.round((crop.cropRect.width / 1000) * imageWidth),
        height: Math.round((crop.cropRect.height / 1000) * imageHeight),
      }
    : null;

  // Crop rect in container pixels
  const cropPixel = {
    x: toPixel(crop.cropRect.x, true),
    y: toPixel(crop.cropRect.y, false),
    w: toPixel(crop.cropRect.width, true),
    h: toPixel(crop.cropRect.height, false),
  };

  // Handle mouse/touch interactions
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "resize" | "snap", snapBox?: BoundingBox) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      if (type === "snap" && snapBox) {
        // Snap crop to bounding box (with small padding)
        const bx = snapBox.bbox_2d[0];
        const by = snapBox.bbox_2d[1];
        const bw = snapBox.bbox_2d[2] - bx;
        const bh = snapBox.bbox_2d[3] - by;
        const padW = bw * 0.05;
        const padH = bh * 0.05;

        let newX = bx - padW;
        let newY = by - padH;
        let newW = bw + padW * 2;
        let newH = bh + padH * 2;

        // Clamp to bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.min(newW, 1000 - newX);
        newH = Math.min(newH, 1000 - newY);

        onChange({ cropRect: { x: newX, y: newY, width: newW, height: newH }, autoDetected: false });
        return;
      }

      dragRef.current = {
        type,
        startX: e.clientX,
        startY: e.clientY,
        origCrop: { ...crop.cropRect },
      };
    },
    [disabled, crop, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || disabled) return;
      e.preventDefault();

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const orig = dragRef.current.origCrop;
      const toNorm = (pixelVal: number, isX: boolean) => pixelVal / (isX ? scaleX : scaleY);

      if (dragRef.current.type === "move") {
        let newX = orig.x + toNorm(dx, true);
        let newY = orig.y + toNorm(dy, false);
        // Clamp
        newX = Math.max(0, Math.min(newX, 1000 - orig.width));
        newY = Math.max(0, Math.min(newY, 1000 - orig.height));
        onChange({ cropRect: { ...orig, x: newX, y: newY }, autoDetected: false });
      } else if (dragRef.current.type === "resize") {
        // Free aspect ratio — no lock
        let newW = orig.width + toNorm(dx, true);
        let newH = orig.height + toNorm(dy, false);
        // Minimum size
        newW = Math.max(30, Math.min(newW, 1000));
        newH = Math.max(30, Math.min(newH, 1000));
        // Center-shift on resize
        let newX = orig.x + (orig.width - newW) / 2;
        let newY = orig.y + (orig.height - newH) / 2;
        // Clamp to bounds
        newX = Math.max(0, Math.min(newX, 1000 - newW));
        newY = Math.max(0, Math.min(newY, 1000 - newH));
        onChange({ cropRect: { x: newX, y: newY, width: newW, height: newH }, autoDetected: false });
      }
    },
    [disabled, onChange, scaleX, scaleY]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Resize handle size in pixels
  const handleSize = 12;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ touchAction: "none" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Detected bounding boxes */}
      {boundingBoxes.map((bb, i) => {
        const bx = toPixel(bb.bbox_2d[0], true);
        const by = toPixel(bb.bbox_2d[1], false);
        const bw = toPixel(bb.bbox_2d[2] - bb.bbox_2d[0], true);
        const bh = toPixel(bb.bbox_2d[3] - bb.bbox_2d[1], false);

        return (
          <div
            key={i}
            className="absolute border-2 border-amber-400/70 rounded cursor-pointer hover:border-amber-400 transition-colors"
            style={{
              left: bx,
              top: by,
              width: bw,
              height: bh,
            }}
            onPointerDown={(e) => handlePointerDown(e, "snap", bb)}
            title={`Snap to: ${bb.label}`}
          >
            <span className="absolute -top-4 left-0 text-[9px] font-medium text-amber-400 bg-zinc-900/80 px-1 rounded">
              {bb.label}
            </span>
          </div>
        );
      })}

      {/* Crop overlay */}
      <div
        className="absolute border-2 border-blue-400 rounded cursor-move"
        style={{
          left: cropPixel.x,
          top: cropPixel.y,
          width: cropPixel.w,
          height: cropPixel.h,
        }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
      >
        {/* Crop type label + resolution tooltip */}
        <div className="absolute -top-5 left-0 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onCropTypeChange("portrait"); }}
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
              crop.cropType === "portrait"
                ? "bg-blue-500 text-white"
                : "bg-zinc-800/80 text-zinc-300 hover:text-white"
            }`}
          >
            portrait
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCropTypeChange("body"); }}
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
              crop.cropType === "body"
                ? "bg-blue-500 text-white"
                : "bg-zinc-800/80 text-zinc-300 hover:text-white"
            }`}
          >
            body
          </button>
          {cropResolution && (
            <span className="text-[9px] font-mono text-zinc-300 bg-zinc-900/90 px-1.5 py-0.5 rounded whitespace-nowrap">
              {cropResolution.width} × {cropResolution.height}
            </span>
          )}
        </div>

        {/* Corner resize handles */}
        {/* Top-left */}
        <div
          className="absolute bg-white border border-blue-400 rounded-sm"
          style={{
            width: handleSize,
            height: handleSize,
            top: -handleSize / 2,
            left: -handleSize / 2,
            cursor: "nwse-resize",
          }}
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize"); }}
        />
        {/* Top-right */}
        <div
          className="absolute bg-white border border-blue-400 rounded-sm"
          style={{
            width: handleSize,
            height: handleSize,
            top: -handleSize / 2,
            right: -handleSize / 2,
            cursor: "nesw-resize",
          }}
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize"); }}
        />
        {/* Bottom-left */}
        <div
          className="absolute bg-white border border-blue-400 rounded-sm"
          style={{
            width: handleSize,
            height: handleSize,
            bottom: -handleSize / 2,
            left: -handleSize / 2,
            cursor: "nesw-resize",
          }}
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize"); }}
        />
        {/* Bottom-right */}
        <div
          className="absolute bg-white border border-blue-400 rounded-sm"
          style={{
            width: handleSize,
            height: handleSize,
            bottom: -handleSize / 2,
            right: -handleSize / 2,
            cursor: "nwse-resize",
          }}
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize"); }}
        />

        {/* Grid lines (rule of thirds) */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
        </div>
      </div>
    </div>
  );
}
