"use client";

import { useCallback, useState } from "react";
import type { CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";
import type { ImageFile } from "./CaptionStudioTypes";
import { CropEditorView } from "./CropEditorView";

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
  canProceedToCaption,
  onProceedToCaption,
  onBackToUpload,
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
  canProceedToCaption: boolean;
  onProceedToCaption: () => void;
  onBackToUpload: () => void;
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
      <section className="animate-fade-in rounded-xl border border-zinc-200 overflow-hidden bg-white">
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
    <section className="animate-fade-in rounded-xl border border-zinc-200 overflow-hidden bg-white">
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

          {/* Failed detection warning — shows when selected image needs manual crop */}
          {isCurrentSkipped && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="font-semibold">{currentImage?.name} — detection failed</p>
                <p className="mt-0.5">Draw a crop box manually for this image.</p>
              </div>
            </div>
          )}

          {/* Main editor area — always visible when crops exist */}
          {crops.length > 0 && displayCrop && (
            <CropEditorView
              image={displayImage!}
              crop={displayCrop}
              detection={displayDetection}
              onUpdateCropRect={handleCropChange}
              onSetCropType={handleToggleCropType}
              disabled={disabled}
            />
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
                        isSelected
                          ? "border-zinc-900 ring-2 ring-zinc-300"
                          : isSkipped
                            ? "border-amber-300"
                            : "border-zinc-200 hover:border-zinc-400"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      {crop ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm ${
                            crop.cropType === "face"
                              ? "bg-blue-500 text-white"
                              : "bg-purple-500 text-white"
                          }`}>
                            {crop.cropType === "face" ? "F" : "B"}
                          </span>
                          {isSkipped && (
                            <span className="absolute bottom-0.5 right-0.5 text-[7px] font-bold px-0.5 rounded bg-amber-500 text-white">
                              !
                            </span>
                          )}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons — back + caption */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
            <button
              onClick={onBackToUpload}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Back
            </button>
            <button
              onClick={onProceedToCaption}
              disabled={!canProceedToCaption}
              className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                canProceedToCaption
                  ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              Caption Cropped ({images.length} image{images.length !== 1 ? "s" : ""})
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
