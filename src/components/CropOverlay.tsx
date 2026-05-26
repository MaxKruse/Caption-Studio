"use client";

import { useCallback, useRef, useState } from "react";
import type { BoundingBox, CropRect, CropType } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// CropOverlay — single draggable/resizable crop box + detection guides
//
// Detection boxes: non-interactive dashed outlines (visual guides only)
// Crop box: fully draggable + resizable with corner handles
// ---------------------------------------------------------------------------

interface CropOverlayProps {
  /** Current crop rectangle (1000-normalized). */
  cropRect: CropRect;
  /** Detected bounding boxes (visual guides, not interactive). */
  boundingBoxes: BoundingBox[];
  /** Original image pixel dimensions. */
  imageWidth: number;
  imageHeight: number;
  /** Displayed container dimensions. */
  containerWidth: number;
  containerHeight: number;
  /** Current crop type (affects color). */
  cropType: CropType;
  /** Callback when crop rectangle changes. */
  onChange: (rect: Partial<CropRect>) => void;
  disabled?: boolean;
}

type ResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface DragState {
  type: "move" | "resize";
  startX: number;
  startY: number;
  origCrop: CropRect;
  handle?: ResizeHandle;
}

export function CropOverlay({
  cropRect,
  boundingBoxes,
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  cropType,
  onChange,
  disabled,
}: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Color scheme based on crop type
  const colors = cropType === "face"
    ? { border: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)", handle: "#3b82f6", label: "bg-blue-500" }
    : { border: "#a855f7", bg: "rgba(168, 85, 247, 0.08)", handle: "#a855f7", label: "bg-purple-500" };

  // Scale: 1000-normalized → container pixels
  const scaleX = containerWidth / 1000;
  const scaleY = containerHeight / 1000;

  const toPixel = (val: number, isX: boolean) => val * (isX ? scaleX : scaleY);
  const toNorm = (pixelVal: number, isX: boolean) => pixelVal / (isX ? scaleX : scaleY);

  // Crop rect in container pixels
  const cropPixel = {
    x: toPixel(cropRect.x, true),
    y: toPixel(cropRect.y, false),
    w: toPixel(cropRect.width, true),
    h: toPixel(cropRect.height, false),
  };

  // Crop resolution in original image pixels
  const cropResolution = imageWidth > 0 && imageHeight > 0
    ? {
        width: Math.round((cropRect.width / 1000) * imageWidth),
        height: Math.round((cropRect.height / 1000) * imageHeight),
      }
    : null;

  // Pointer handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "resize", handle?: ResizeHandle) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);

      dragRef.current = {
        type,
        startX: e.clientX,
        startY: e.clientY,
        origCrop: { ...cropRect },
        handle,
      };
    },
    [disabled, cropRect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || disabled) return;
      e.preventDefault();

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const orig = dragRef.current.origCrop;

      if (dragRef.current.type === "move") {
        let newX = orig.x + toNorm(dx, true);
        let newY = orig.y + toNorm(dy, false);
        newX = Math.max(0, Math.min(newX, 1000 - orig.width));
        newY = Math.max(0, Math.min(newY, 1000 - orig.height));
        onChange({ ...orig, x: newX, y: newY });
      } else if (dragRef.current.type === "resize" && dragRef.current.handle) {
        const dX = toNorm(dx, true);
        const dY = toNorm(dy, false);
        let newX = orig.x;
        let newY = orig.y;
        let newW = orig.width;
        let newH = orig.height;

        switch (dragRef.current.handle) {
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

        // Minimum size (3% of canvas)
        newW = Math.max(30, newW);
        newH = Math.max(30, newH);
        newX = Math.max(0, Math.min(newX, 1000 - newW));
        newY = Math.max(0, Math.min(newY, 1000 - newH));

        onChange({ x: newX, y: newY, width: newW, height: newH });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, onChange, scaleX, scaleY]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  // Resize handle size
  const handleSize = 16;

  // Detection box colors by label
  const getDetectionColor = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes("face")) return "border-blue-400/50 text-blue-400/70";
    if (lower.includes("body")) return "border-purple-400/50 text-purple-400/70";
    return "border-amber-400/50 text-amber-400/70";
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ touchAction: "none" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Detection bounding boxes — visual guides only, not interactive */}
      {boundingBoxes.map((bb, i) => {
        const bx = toPixel(bb.bbox_2d[0], true);
        const by = toPixel(bb.bbox_2d[1], false);
        const bw = toPixel(bb.bbox_2d[2] - bb.bbox_2d[0], true);
        const bh = toPixel(bb.bbox_2d[3] - bb.bbox_2d[1], false);
        const detColor = getDetectionColor(bb.label);

        return (
          <div
            key={i}
            className={`absolute border border-dashed rounded pointer-events-none ${detColor}`}
            style={{
              left: bx,
              top: by,
              width: bw,
              height: bh,
            }}
          >
            <span className="absolute -top-4 left-0 text-[9px] font-medium bg-zinc-900/70 px-1 rounded">
              {bb.label}
            </span>
          </div>
        );
      })}

      {/* Crop box — draggable + resizable */}
      <div
        className={`absolute ${isDragging ? "z-20" : "z-10"}`}
        style={{
          left: cropPixel.x,
          top: cropPixel.y,
          width: cropPixel.w,
          height: cropPixel.h,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
      >
        {/* Semi-transparent fill */}
        <div
          className="absolute inset-0 rounded"
          style={{ backgroundColor: colors.bg }}
        />

        {/* Border */}
        <div
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            borderColor: colors.border,
            borderWidth: 2,
            borderStyle: "solid",
          }}
        />

        {/* Rule of thirds grid */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
        </div>

        {/* Type label + resolution */}
        <div className="absolute -top-6 left-0 flex items-center gap-1.5 pointer-events-none">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded text-white ${colors.label}`}>
            {cropType}
          </span>
          {cropResolution && (
            <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">
              {cropResolution.width}&times;{cropResolution.height}
            </span>
          )}
        </div>

        {/* Corner resize handles */}
        {(["top-left", "top-right", "bottom-left", "bottom-right"] as ResizeHandle[]).map((handle) => {
          const cursors: Record<ResizeHandle, string> = {
            "top-left": "nwse-resize",
            "top-right": "nesw-resize",
            "bottom-left": "nesw-resize",
            "bottom-right": "nwse-resize",
          };
          const positions: Record<ResizeHandle, React.CSSProperties> = {
            "top-left": { top: -handleSize / 2, left: -handleSize / 2 },
            "top-right": { top: -handleSize / 2, right: -handleSize / 2 },
            "bottom-left": { bottom: -handleSize / 2, left: -handleSize / 2 },
            "bottom-right": { bottom: -handleSize / 2, right: -handleSize / 2 },
          };

          return (
            <div
              key={handle}
              className="absolute bg-white rounded-sm shadow-sm"
              style={{
                width: handleSize,
                height: handleSize,
                ...positions[handle],
                cursor: cursors[handle],
                borderColor: colors.border,
                borderWidth: 2,
                borderStyle: "solid",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                handlePointerDown(e, "resize", handle);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
