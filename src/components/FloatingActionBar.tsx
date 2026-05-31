"use client";

import type { ImageFile, ProgressState } from "./CaptionStudioTypes";
import type { DetectionProgress, RulesetValidation } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// FloatingActionBar — fixed bottom bar reflecting current workflow step
//
// Unified layout for all steps:
//   [status text]  [primary button]  [secondary button]
//
// Progress steps (detect / caption) add a thin progress bar beneath status.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-zinc-700 transition-all duration-400 ease-out rounded-full"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StatusText({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-zinc-500">{children}</div>;
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
        disabled
          ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
          : "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-1.5"
    >
      {children}
    </button>
  );
}

function AbortButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
      aria-label="Abort"
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
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function CaptionIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0l-4.5-4.5M12 16.5V3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ClearAllIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FloatingActionBar({
  step,
  imagesCount,
  detectionProgress,
  captionProgress,
  captionProgressPercent,
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
  step: "upload" | "detect" | "crop" | "caption" | "done";
  imagesCount: number;
  images?: ImageFile[];
  detectionProgress?: DetectionProgress;
  detectionStatuses?: Record<string, unknown>;
  captionProgress?: ProgressState;
  captionProgressPercent?: number;
  estimatedRemainingMs?: number;
  avgTimeMs?: number;
  onDetect?: () => void;
  onAbortDetection?: () => void;
  onProceedToCaption?: () => void;
  onBackToUpload?: () => void;
  onAbortCaption?: () => void;
  onDownloadZip?: () => void;
  onClearAll?: () => void;
  canDetect?: boolean;
  canProceedToCaption?: boolean;
  rulesetValid?: boolean;
  rulesetValidation?: RulesetValidation;
}) {
  if (imagesCount === 0) return null;

  // Compute detection progress percent
  const detectPercent = detectionProgress
    ? detectionProgress.total > 0
      ? ((detectionProgress.completed + detectionProgress.failed) / detectionProgress.total) * 100
      : 0
    : 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-md border-t border-zinc-200 transition-opacity duration-300">
      <div className="max-w-7xl mx-auto px-6 py-3">
        {/* ----------------------------------------------------------------- */}
        {/* UPLOAD — prompt to detect                                          */}
        {/* ----------------------------------------------------------------- */}
        {step === "upload" && (
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={onDetect} disabled={!canDetect}>
              <SearchIcon />
              Detect Faces &amp; Bodies ({imagesCount} images)
            </PrimaryButton>
            <SecondaryButton onClick={onClearAll}>
              <ClearAllIcon />
              Clear all
            </SecondaryButton>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* DETECT — unified progress                                          */}
        {/* ----------------------------------------------------------------- */}
        {step === "detect" && detectionProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <StatusText>
                <span className="space-x-2">
                  <span>{detectionProgress.completed} detected</span>
                  {detectionProgress.processing > 0 && (
                    <span className="text-zinc-400">
                      &middot; {detectionProgress.processing} processing
                    </span>
                  )}
                  {(detectionProgress.skipped ?? 0) > 0 && (
                    <span className="text-red-500">
                      &middot; {detectionProgress.skipped} skipped
                    </span>
                  )}
                </span>
              </StatusText>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 shrink-0">
                  {Math.round(detectPercent)}%
                </span>
                <AbortButton onClick={onAbortDetection} />
              </div>
            </div>
            <ProgressBar percent={detectPercent} />
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* CROP — prompt to proceed                                           */}
        {/* ----------------------------------------------------------------- */}
        {step === "crop" && (
          <div className="space-y-1.5">
            {!rulesetValid && rulesetValidation && (
              <StatusText>
                <span className="text-amber-600">
                  Need {rulesetValidation.expectedFaceRange[0]}&ndash;{rulesetValidation.expectedFaceRange[1]} face and {rulesetValidation.expectedBodyRange[0]}&ndash;{rulesetValidation.expectedBodyRange[1]} body crops. Currently: {rulesetValidation.faceCount} face, {rulesetValidation.bodyCount} body.
                </span>
              </StatusText>
            )}
            <div className="flex items-center gap-3">
              <SecondaryButton onClick={onBackToUpload}>
                <BackIcon />
                Back
              </SecondaryButton>
              <PrimaryButton
                onClick={canProceedToCaption ? onProceedToCaption : undefined}
                disabled={!canProceedToCaption}
              >
                <CaptionIcon />
                Caption Cropped ({imagesCount} images)
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* CAPTION — unified progress                                         */}
        {/* ----------------------------------------------------------------- */}
        {step === "caption" && captionProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <StatusText>
                <span className="space-x-2">
                  <span>{captionProgress.completed} captioned</span>
                  {captionProgress.processing > 0 && (
                    <span className="text-zinc-400">
                      &middot; {captionProgress.processing} processing
                    </span>
                  )}
                  {captionProgress.failed > 0 && (
                    <span className="text-zinc-400">
                      &middot; {captionProgress.failed} failed
                    </span>
                  )}
                </span>
              </StatusText>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 shrink-0">
                  {captionProgressPercent ?? 0}%
                </span>
                <AbortButton onClick={onAbortCaption} />
              </div>
            </div>
            <ProgressBar percent={captionProgressPercent ?? 0} />
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* DONE — results summary                                             */}
        {/* ----------------------------------------------------------------- */}
        {step === "done" && captionProgress && (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <StatusText>
                <span className="flex items-center gap-1.5">
                  <CheckIcon />
                  <span className="font-medium text-zinc-700">
                    {captionProgress.completed} captioned
                  </span>
                  {captionProgress.failed > 0 && (
                    <span className="text-zinc-400">
                      &middot; {captionProgress.failed} failed
                    </span>
                  )}
                </span>
              </StatusText>
            </div>
            <PrimaryButton onClick={onDownloadZip}>
              <DownloadIcon />
              Download ZIP
            </PrimaryButton>
            <SecondaryButton onClick={onClearAll}>
              <RefreshIcon />
              Start over
            </SecondaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
