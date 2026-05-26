"use client";

import { useCallback, useRef } from "react";
import type { BoundingBox, CropRect, ImageCrop } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// CropOverlay — interactive crop rectangle on an image
// Toggle between face-only, body-only, or both crop boxes
// ---------------------------------------------------------------------------

export type CropViewMode = "face" | "body" | "both";

interface CropOverlayProps {
  crop: ImageCrop;
  boundingBoxes: BoundingBox[];
  imageWidth: number;  // actual image pixel width
  imageHeight: number; // actual image pixel height
  containerWidth: number;  // displayed container width
  containerHeight: number; // displayed container height
  /** Which crop is currently being edited */
  activeCrop: "face" | "body";
  /** What to display: single crop or both */
  viewMode: CropViewMode;
  onChange: (rect: Partial<CropRect>) => void;
  onActiveCropChange: (target: "face" | "body") => void;
  onViewModeChange: (mode: CropViewMode) => void;
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
  onViewModeChange,
  activeCrop,
  viewMode,
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

  // Inactive crop rect (for "both" mode)
  const inactiveRect = activeCrop === "face" ? crop.bodyCrop : crop.faceCrop;

  // Inactive crop rect in container pixels
  const inactivePixel = {
    x: toPixel(inactiveRect.x, true),
    y: toPixel(inactiveRect.y, false),
    w: toPixel(inactiveRect.width, true),
    h: toPixel(inactiveRect.height, false),
  };

  // Visibility
  const showBoth = viewMode === "both";

  // In single-crop mode, the active crop follows the view mode
  // In "both" mode, active crop follows activeCrop prop
  const editableCrop = showBoth ? activeCrop : viewMode;
  const editableRect = editableCrop === "face" ? crop.faceCrop : crop.bodyCrop;
  const editablePixel = {
    x: toPixel(editableRect.x, true),
    y: toPixel(editableRect.y, false),
    w: toPixel(editableRect.width, true),
    h: toPixel(editableRect.height, false),
  };
  const editableResolution = imageWidth > 0 && imageHeight > 0
    ? {
        width: Math.round((editableRect.width / 1000) * imageWidth),
        height: Math.round((editableRect.height / 1000) * imageHeight),
      }
    : null;

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
        // Body boxes use no extra padding — already well-sized
        const paddingFactor = snapBox.label === "face" ? 0.25 : 0;
        const padW = bw * paddingFactor;
        const padH = bh * paddingFactor;

        let newX = bx - padW;
        let newY = by - padH;
        let newW = bw + padW * 2;
        let newH = bh + padH * 2;

        // Clamp to bounds (0-1000) — adjust size first, then clamp position
        if (newX < 0) { newW += newX; newX = 0; }
        if (newY < 0) { newH += newY; newY = 0; }
        if (newX + newW > 1000) newW = 1000 - newX;
        if (newY + newH > 1000) newH = 1000 - newY;

        onChange({ x: newX, y: newY, width: newW, height: newH });
        return;
      }

      dragRef.current = {
        type,
        startX: e.clientX,
        startY: e.clientY,
        origCrop: { ...editableRect },
        resizeMode: type === "resize" && typeof resizeModeOrSnapBox === "string" ? resizeModeOrSnapBox : undefined,
      };
    },
    [disabled, editableRect, onChange]
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

  // Toggle button handler — cycle through or direct select
  const handleToggle = (mode: CropViewMode) => {
    onViewModeChange(mode);
    if (mode !== "both") {
      onActiveCropChange(mode);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ touchAction: "none" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* View mode toggle — fixed position top-right */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 z-50">
        {(["face", "body", "both"] as CropViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => handleToggle(mode)}
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
              viewMode === mode
                ? "bg-blue-500 text-white"
                : "bg-zinc-900/70 text-zinc-300 hover:text-white hover:bg-zinc-900/90"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* "both" mode — inactive crop (dimmed overlay) */}
      {showBoth && (
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
      )}

      {/* Editable crop overlay */}
      <div
        className="absolute border-2 border-blue-400 rounded cursor-move"
        style={{
          left: editablePixel.x,
          top: editablePixel.y,
          width: editablePixel.w,
          height: editablePixel.h,
        }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
      >
        {/* Crop type label + resolution */}
        <div className="absolute -top-5 left-0 flex items-center gap-1">
          <span
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
              editableCrop === "face"
                ? "bg-blue-500 text-white"
                : "bg-purple-500 text-white"
            }`}
          >
            {editableCrop}
          </span>
          {editableResolution && (
            <span className="text-[9px] font-mono text-zinc-300 bg-zinc-900/90 px-1.5 py-0.5 rounded whitespace-nowrap">
              {editableResolution.width} × {editableResolution.height}
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

      {/* Detected bounding boxes — rendered LAST so they sit on top of crop overlays
          and remain clickable for snap-to functionality */}
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
    </div>
  );
}
