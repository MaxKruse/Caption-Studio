"use client";

import { formatDuration } from "./CaptionStudioTypes";
import type { ImageFile, ProgressState } from "./CaptionStudioTypes";
import type { DetectionImageStatus, DetectionProgress, RulesetValidation } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// FloatingActionBar — fixed bottom bar reflecting current workflow step
//
// Workflow phases:
//   upload   → "Detect Faces & Bodies" + "Clear all"
//   detect   → progress bar + abort
//   crop     → "Proceed to Caption" + "Back to Upload"
//   caption  → progress bar + abort
//   done     → "Download ZIP" + "Start over"
// ---------------------------------------------------------------------------

export function FloatingActionBar({
  step,
  imagesCount,
  images,
  detectionProgress,
  detectionStatuses,
  captionProgress,
  captionProgressPercent,
  estimatedRemainingMs,
  avgTimeMs,
  onDetect,
  onAbortDetection,
  onProceedToCaption,
  onBackToUpload,
  onAbortCaption,
  onDownloadZip,
  onClearAll,
  canDetect,
  canProceedToCaption,
  rulesetValid,
  rulesetValidation,
}: {
  // Current workflow step
  step: "upload" | "detect" | "crop" | "caption" | "done";

  // Image count
  imagesCount: number;

  // Images (for per-image detection status)
  images?: ImageFile[];

  // Detection progress (step = "detect")
  detectionProgress?: DetectionProgress;
  detectionStatuses?: Record<string, DetectionImageStatus>;

  // Caption progress (step = "caption")
  captionProgress?: ProgressState;
  captionProgressPercent?: number;
  estimatedRemainingMs?: number;
  avgTimeMs?: number;

  // Handlers
  onDetect?: () => void;
  onAbortDetection?: () => void;
  onProceedToCaption?: () => void;
  onBackToUpload?: () => void;
  onAbortCaption?: () => void;
  onDownloadZip?: () => void;
  onClearAll?: () => void;

  // Enable/disable flags
  canDetect?: boolean;
  canProceedToCaption?: boolean;

  // Ruleset validation (step = "crop")
  rulesetValid?: boolean;
  rulesetValidation?: RulesetValidation;
}) {
  // Nothing to show — no images
  if (imagesCount === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-md border-t border-zinc-200">
      <div className="max-w-7xl mx-auto px-6 py-3">
        {/* ----------------------------------------------------------------- */}
        {/* UPLOAD — images ready, prompt to detect                            */}
        {/* ----------------------------------------------------------------- */}
        {step === "upload" && (
          <div className="flex items-center gap-3">
            <button
              onClick={onDetect}
              disabled={!canDetect}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                canDetect
                  ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              Detect Faces &amp; Bodies ({imagesCount} images)
            </button>

            <button
              onClick={onClearAll}
              className="shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-1.5"
              aria-label="Clear all"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear all
            </button>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* DETECT — running detection, show progress + per-image list        */}
        {/* ----------------------------------------------------------------- */}
        {step === "detect" && detectionProgress && (
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                  <span className="space-x-2 truncate">
                    <span>{detectionProgress.completed} detected</span>
                    {detectionProgress.failed > 0 && (
                      <span className="text-amber-600">
                        &middot; {detectionProgress.failed} retrying
                      </span>
                    )}
                    {(detectionProgress.skipped ?? 0) > 0 && (
                      <span className="text-red-500">
                        &middot; {detectionProgress.skipped} skipped
                      </span>
                    )}
                    {detectionProgress.processing > 0 && (
                      <span className="text-zinc-400">
                        &middot; {detectionProgress.processing} processing
                      </span>
                    )}
                  </span>
                  <span className="font-medium shrink-0">
                    {detectionProgress.total > 0
                      ? Math.round(
                          ((detectionProgress.completed + detectionProgress.failed) /
                            detectionProgress.total) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-700 transition-all duration-300 ease-out rounded-full"
                    style={{
                      width: `${
                        detectionProgress.total > 0
                          ? ((detectionProgress.completed + detectionProgress.failed) /
                              detectionProgress.total) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <button
                onClick={onAbortDetection}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
                aria-label="Abort detection"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Abort
              </button>
            </div>

            {/* Per-image status list */}
            {images && images.length > 0 && detectionStatuses && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {images.map((img) => {
                  const status = detectionStatuses[img.name];
                  const statusStyle = status?.status === "completed"
                    ? "bg-zinc-700 text-zinc-100"
                    : status?.status === "processing"
                      ? "bg-zinc-400 text-zinc-900 animate-pulse"
                      : status?.status === "skipped"
                        ? "bg-red-600 text-white"
                        : status?.status === "failed"
                          ? "bg-amber-500 text-white"
                          : "bg-zinc-200 text-zinc-500";

                  return (
                    <div
                      key={img.name}
                      className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium bg-zinc-50 border border-zinc-200"
                    >
                      {/* Status dot */}
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        status?.status === "completed"
                          ? "bg-zinc-700"
                          : status?.status === "processing"
                            ? "bg-zinc-400 animate-pulse"
                            : status?.status === "skipped"
                              ? "bg-red-600"
                              : status?.status === "failed"
                                ? "bg-amber-500"
                                : "bg-zinc-300"
                      }`} />
                      <span className="truncate max-w-[120px] text-zinc-600">{img.name}</span>
                      <span className={`shrink-0 px-1 py-0.5 rounded text-[8px] uppercase tracking-wide ${statusStyle}`}>
                        {status?.status ?? "queued"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* CROP — crops ready, prompt to proceed                             */}
        {/* ----------------------------------------------------------------- */}
        {step === "crop" && (
          <div className="space-y-2">
            {/* Ruleset validation warning */}
            {!rulesetValid && rulesetValidation && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>
                  Need {rulesetValidation.expectedFaceRange[0]}&ndash;{rulesetValidation.expectedFaceRange[1]} face and {rulesetValidation.expectedBodyRange[0]}&ndash;{rulesetValidation.expectedBodyRange[1]} body crops. Currently: {rulesetValidation.faceCount} face, {rulesetValidation.bodyCount} body.
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={onBackToUpload}
                className="shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-1.5"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Back
              </button>

              <button
                onClick={onProceedToCaption}
                disabled={!canProceedToCaption}
                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  canProceedToCaption
                    ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                    : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
                Caption Cropped ({imagesCount} images)
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* CAPTION — job running, show progress + estimate + abort           */}
        {/* ----------------------------------------------------------------- */}
        {step === "caption" && captionProgress && (
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                <span className="space-x-2 truncate">
                  <span>{captionProgress.completed} captioned</span>
                  {captionProgress.failed > 0 && (
                    <span className="text-zinc-400">
                      &middot; {captionProgress.failed} failed
                    </span>
                  )}
                  {captionProgress.processing > 0 && (
                    <span className="text-zinc-400">
                      &middot; {captionProgress.processing} processing
                    </span>
                  )}
                </span>
                <span className="font-medium shrink-0">
                  {captionProgressPercent ?? 0}%
                </span>
              </div>
              <div className="h-2 bg-zinc-200 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-zinc-700 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${captionProgressPercent ?? 0}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                  </svg>
                  {estimatedRemainingMs != null
                    ? `${formatDuration(estimatedRemainingMs)} remaining`
                    : "Waiting..."}
                </span>
                {avgTimeMs != null && (
                  <span>~{formatDuration(Math.round(avgTimeMs))} per image</span>
                )}
                {(captionProgress.queued ?? 0) > 0 && (
                  <span>
                    {captionProgress.queued} image
                    {captionProgress.queued !== 1 ? "s" : ""} left
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onAbortCaption}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
              aria-label="Abort captioning"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Abort
            </button>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* DONE — job completed, show results + download + start over        */}
        {/* ----------------------------------------------------------------- */}
        {step === "done" && captionProgress && (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <svg
                  className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium text-zinc-700">
                  {captionProgress.completed} captioned
                </span>
                {captionProgress.failed > 0 && (
                  <span className="text-zinc-400">
                    &middot; {captionProgress.failed} failed
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onDownloadZip}
              className="shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm transition-colors flex items-center gap-1.5"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0l-4.5-4.5M12 16.5V3"
                />
              </svg>
              Download ZIP
            </button>

            <button
              onClick={onClearAll}
              className="shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
              aria-label="Start over"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
                />
              </svg>
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
