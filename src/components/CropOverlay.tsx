"use client";

import { useCallback, useRef } from "react";
import type { BoundingBox, CropRect, ImageCrop } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// CropOverlay — interactive crop rectangle on an image
// Shows both face and body crops; user edits the active one
// ---------------------------------------------------------------------------

interface CropOverlayProps {
  crop: ImageCrop;
  boundingBoxes: BoundingBox[];
  imageWidth: number;  // actual image pixel width
  imageHeight: number; // actual image pixel height
  containerWidth: number;  // displayed container width
  containerHeight: number; // displayed container height
  /** Which crop is currently being edited */
  activeCrop: "face" | "body";
  onChange: (rect: Partial<CropRect>) => void;
  onActiveCropChange: (target: "face" | "body") => void;
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
  onActiveCropChange,
  activeCrop,
  disabled,
}: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  type ResizeMode = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  const dragRef = useRef<{ type: "move" | "resize" | "snap"; startX: number; startY: number; origCrop: CropRect; resizeMode?: ResizeMode } | null>(null);

  // Scale factor: 1000-normalized → container pixels
  const scaleX = containerWidth / 1000;
  const scaleY = containerHeight / 1000;

  // Convert 1000-normalized to container pixels
  const toPixel = (val: number, isX: boolean) => val * (isX ? scaleX : scaleY);

  // Active and inactive crop rects
  const activeRect = activeCrop === "face" ? crop.faceCrop : crop.bodyCrop;
  const inactiveRect = activeCrop === "face" ? crop.bodyCrop : crop.faceCrop;

  // Compute actual cropped resolution (in real image pixels)
  const cropResolution = imageWidth > 0 && imageHeight > 0
    ? {
        width: Math.round((activeRect.width / 1000) * imageWidth),
        height: Math.round((activeRect.height / 1000) * imageHeight),
      }
    : null;

  // Active crop rect in container pixels
  const activePixel = {
    x: toPixel(activeRect.x, true),
    y: toPixel(activeRect.y, false),
    w: toPixel(activeRect.width, true),
    h: toPixel(activeRect.height, false),
  };

  // Inactive crop rect in container pixels
  const inactivePixel = {
    x: toPixel(inactiveRect.x, true),
    y: toPixel(inactiveRect.y, false),
    w: toPixel(inactiveRect.width, true),
    h: toPixel(inactiveRect.height, false),
  };

  // Handle mouse/touch interactions
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "resize" | "snap", resizeModeOrSnapBox?: ResizeMode | BoundingBox) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      if (type === "snap" && resizeModeOrSnapBox && typeof resizeModeOrSnapBox !== "string") {
        // Snap crop to bounding box (with padding based on box type)
        const snapBox = resizeModeOrSnapBox;
        const bx = snapBox.bbox_2d[0];
        const by = snapBox.bbox_2d[1];
        const bw = snapBox.bbox_2d[2] - bx;
        const bh = snapBox.bbox_2d[3] - by;
        // Face boxes get wider padding (25%) since LLMs return tight face boxes
        // Body boxes get tight padding (5%)
        const paddingFactor = snapBox.label === "face" ? 0.25 : 0.05;
        const padW = bw * paddingFactor;
        const padH = bh * paddingFactor;

        let newX = bx - padW;
        let newY = by - padH;
        let newW = bw + padW * 2;
        let newH = bh + padH * 2;

        // Clamp to bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.min(newW, 1000 - newX);
        newH = Math.min(newH, 1000 - newY);

        onChange({ x: newX, y: newY, width: newW, height: newH });
        return;
      }

      dragRef.current = {
        type,
        startX: e.clientX,
        startY: e.clientY,
        origCrop: { ...activeRect },
        resizeMode: type === "resize" && typeof resizeModeOrSnapBox === "string" ? resizeModeOrSnapBox : undefined,
      };
    },
    [disabled, activeRect, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || disabled) return;
      e.preventDefault();

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const orig = dragRef.current.origCrop;
      const toNorm = (pixelVal: number, isX: boolean) => pixelVal / (isX ? scaleX : scaleY);

      const mode = dragRef.current.resizeMode;

      if (dragRef.current.type === "move") {
        let newX = orig.x + toNorm(dx, true);
        let newY = orig.y + toNorm(dy, false);
        // Clamp
        newX = Math.max(0, Math.min(newX, 1000 - orig.width));
        newY = Math.max(0, Math.min(newY, 1000 - orig.height));
        onChange({ ...orig, x: newX, y: newY });
      } else if (dragRef.current.type === "resize" && mode) {
        const dX = toNorm(dx, true);
        const dY = toNorm(dy, false);
        let newX = orig.x;
        let newY = orig.y;
        let newW = orig.width;
        let newH = orig.height;

        // Per-corner resize math
        switch (mode) {
          case "left":
            newW = orig.width - dX;
            newX = orig.x + dX;
            break;
          case "right":
            newW = orig.width + dX;
            break;
          case "top":
            newH = orig.height - dY;
            newY = orig.y + dY;
            break;
          case "bottom":
            newH = orig.height + dY;
            break;
          case "top-left":
            newW = orig.width - dX;
            newH = orig.height - dY;
            newX = orig.x + dX;
            newY = orig.y + dY;
            break;
          case "top-right":
            newW = orig.width + dX;
            newH = orig.height - dY;
            newY = orig.y + dY;
            break;
          case "bottom-left":
            newW = orig.width - dX;
            newH = orig.height + dY;
            newX = orig.x + dX;
            break;
          case "bottom-right":
            newW = orig.width + dX;
            newH = orig.height + dY;
            break;
        }

        // Minimum size
        newW = Math.max(30, newW);
        newH = Math.max(30, newH);

        // Clamp to bounds
        newX = Math.max(0, Math.min(newX, 1000 - newW));
        newY = Math.max(0, Math.min(newY, 1000 - newH));
        onChange({ x: newX, y: newY, width: newW, height: newH });
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

      {/* Inactive crop (dimmed overlay) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: inactivePixel.x,
          top: inactivePixel.y,
          width: inactivePixel.w,
          height: inactivePixel.h,
        }}
      >
        <div className="absolute inset-0 border-2 border-purple-400/40 rounded" />
        <div className="absolute -top-3 left-0 text-[8px] font-medium text-purple-400/60 bg-zinc-900/60 px-1 rounded">
          {activeCrop === "face" ? "body" : "face"}
        </div>
      </div>

      {/* Active crop overlay */}
      <div
        className="absolute border-2 border-blue-400 rounded cursor-move"
        style={{
          left: activePixel.x,
          top: activePixel.y,
          width: activePixel.w,
          height: activePixel.h,
        }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
      >
        {/* Crop type label + resolution tooltip */}
        <div className="absolute -top-5 left-0 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onActiveCropChange("face"); }}
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
              activeCrop === "face"
                ? "bg-blue-500 text-white"
                : "bg-zinc-800/80 text-zinc-300 hover:text-white"
            }`}
          >
            face
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onActiveCropChange("body"); }}
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
              activeCrop === "body"
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
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize", "top-left" as const); }}
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
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize", "top-right" as const); }}
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
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize", "bottom-left" as const); }}
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
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize", "bottom-right" as const); }}
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
