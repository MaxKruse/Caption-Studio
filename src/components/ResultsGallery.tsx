"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ImageFile, ImageStatus, ProgressState } from "./CaptionStudioTypes";
import { StatusBadge } from "./ImagePreviewModal";

// ---------------------------------------------------------------------------
// ResultCard — single cropped image with caption result
// ---------------------------------------------------------------------------

function ResultCard({
  img,
  status,
  croppedPreview,
  onPreview,
}: {
  img: ImageFile;
  status?: ImageStatus;
  croppedPreview?: string;
  onPreview: (img: ImageFile) => void;
}) {
  const isProcessing = status?.status === "processing";
  const hasPrompt = !!(status?.prompt ?? status?.reasoningContent);

  return (
    <div className="relative group border border-zinc-200 rounded overflow-hidden bg-white card-lift">
      <button
        onClick={() => onPreview(img)}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer hover:opacity-90 transition-opacity"
        title="Click to view details"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={croppedPreview ?? img.preview}
          alt={img.name}
          className="w-full aspect-square object-cover"
        />
        {/* Processing overlay — subtle pulse */}
        {isProcessing && (
          <div className="absolute inset-0 bg-zinc-900/20 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-zinc-100/80 border-t-transparent animate-spin" />
          </div>
        )}
      </button>

      <div className="absolute bottom-0 inset-x-0 bg-zinc-900/70 px-2 py-1 flex items-center justify-between gap-1">
        <span className="text-[11px] text-zinc-200 truncate flex-1">
          {img.name}
        </span>
        {status && <StatusBadge status={status.status} />}
      </div>

      {/* Expandable details — prompt, reasoning, caption */}
      {status?.caption && (
        <div className="px-2 py-1.5 border-t border-zinc-100">
          <p className="text-[11px] text-zinc-500 line-clamp-3 leading-relaxed">
            {status.caption}
          </p>
        </div>
      )}

      {status?.error && (
        <div className="px-2 py-1.5 border-t border-zinc-100">
          <p className="text-[10px] text-zinc-400 line-clamp-2">
            Error: {status.error}
          </p>
        </div>
      )}

      {/* Prompt / Reasoning toggle */}
      {hasPrompt && status && (
        <DetailsAccordion
          prompt={status.prompt}
          reasoning={status.reasoningContent}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailsAccordion — collapsible prompt + reasoning inside a card
// ---------------------------------------------------------------------------

function DetailsAccordion({
  prompt,
  reasoning,
}: {
  prompt?: string;
  reasoning?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-zinc-100">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <span className="font-medium uppercase tracking-wider">
          {prompt ? "Prompt" : ""}
          {prompt && reasoning ? " + " : ""}
          {reasoning ? "Reasoning" : ""}
        </span>
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          {prompt && (
            <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-4 font-mono">
              {prompt}
            </p>
          )}
          {reasoning && (
            <p className="text-[10px] text-amber-700 leading-relaxed line-clamp-4 bg-amber-50/60 rounded px-1.5 py-1">
              {reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultsGallery — shows captioned images with results
// ---------------------------------------------------------------------------

export function ResultsGallery({
  images,
  imageStatuses,
  croppedPreviews,
  onPreview,
  captionProgress,
  captionProgressPercent,
  isProcessing,
  isDownloading,
  onAbortCaption,
  onDownloadZip,
  onClearAll,
}: {
  images: ImageFile[];
  imageStatuses: Record<string, ImageStatus>;
  croppedPreviews?: Record<string, string>;
  onPreview: (img: ImageFile) => void;
  captionProgress: ProgressState;
  captionProgressPercent: number;
  isProcessing: boolean;
  isDownloading: boolean;
  onAbortCaption: () => void;
  onDownloadZip: () => void;
  onClearAll: () => void;
}) {
  // Local confirmation for "Start over" — avoids stale closure issues
  const [confirmReset, setConfirmReset] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear confirmation after 3 seconds
  useEffect(() => {
    if (!confirmReset) return;
    confirmTimer.current = setTimeout(() => setConfirmReset(false), 3000);
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, [confirmReset]);

  const handleStartOver = useCallback(() => {
    if (confirmReset) {
      onClearAll();
      setConfirmReset(false);
    } else {
      setConfirmReset(true);
    }
  }, [confirmReset, onClearAll]);

  const completedCount = images.filter(
    (img) => imageStatuses[img.name]?.status === "completed"
  ).length;
  const failedCount = images.filter(
    (img) => imageStatuses[img.name]?.status === "failed"
  ).length;

  return (
    <section className="animate-fade-in rounded-xl border border-zinc-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          3
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Results</h2>
        {images.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto space-x-2">
            <span>{completedCount} captioned</span>
            {failedCount > 0 && <span className="text-zinc-400">&middot; {failedCount} failed</span>}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Caption progress — shown while processing */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">
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
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 shrink-0">
                  {captionProgressPercent}%
                </span>
                <button
                  onClick={onAbortCaption}
                  className="shrink-0 px-2 py-1 text-[11px] font-medium rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 transition-colors flex items-center gap-1"
                  aria-label="Abort"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Abort
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-700 transition-all duration-400 ease-out rounded-full"
                style={{ width: `${captionProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Image grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {images.map((img) => (
            <ResultCard
              key={img.name}
              img={img}
              status={imageStatuses[img.name]}
              croppedPreview={croppedPreviews?.[img.name]}
              onPreview={onPreview}
            />
          ))}
        </div>

        {/* Done actions — shown when job complete */}
        {!isProcessing && captionProgress.total > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-700">
                  {captionProgress.completed} captioned
                </span>
                {captionProgress.failed > 0 && (
                  <span className="text-zinc-400">
                    &middot; {captionProgress.failed} failed
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartOver}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                  confirmReset
                    ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                {confirmReset ? "Confirm?" : "Start over"}
              </button>
              <button
                onClick={onDownloadZip}
                disabled={isDownloading}
                className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  isDownloading
                    ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                    : "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0l-4.5-4.5M12 16.5V3" />
                </svg>
                Download ZIP
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
