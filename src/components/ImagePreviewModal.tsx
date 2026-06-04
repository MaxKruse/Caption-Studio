import { useEffect, useRef, useState } from "react";

import { ImageFile, ImageStatus } from "./CaptionStudioTypes";

// ---------------------------------------------------------------------------
// StatusBadge - small inline status indicator
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-zinc-200 text-zinc-500",
    processing: "bg-zinc-400 text-zinc-900 animate-pulse",
    completed: "bg-zinc-700 text-zinc-100",
    failed: "bg-zinc-500 text-zinc-200",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded uppercase tracking-wide ${styles[status] || styles.queued}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ImagePreviewModal - full-size image and caption details dialog
// ---------------------------------------------------------------------------

export function ImagePreviewModal({
  img,
  status,
  onClose,
  allImages,
  currentIndex,
  onNavigate,
  autoOpened,
}: {
  img: ImageFile;
  status: ImageStatus;
  onClose: () => void;
  allImages: ImageFile[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  autoOpened?: boolean;
}) {
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allImages.length - 1;

  const isStreaming = status.status === "processing" && !!status.prompt;

  // Collapsible sections — auto-expand when streaming (autoOpened)
  const [showPrompt, setShowPrompt] = useState(autoOpened ?? false);
  const [showReasoning, setShowReasoning] = useState(autoOpened ?? false);

  // Load the original file as a data URL to avoid blob URL lifecycle issues
  // (blob URLs get revoked by effect cleanup, especially under Strict Mode)
  const [fullQualitySrc, setFullQualitySrc] = useState<string | null>(null);
  const loadingRef = useRef(true);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadingRef.current = true;
    const reader = new FileReader();
    reader.onload = () => {
      loadingRef.current = false;
      setFullQualitySrc(reader.result as string);
    };
    reader.readAsDataURL(img.file);
  }, [img.file]);

  // Auto-scroll to bottom when streaming content updates
  useEffect(() => {
    if (isStreaming && detailsRef.current) {
      detailsRef.current.scrollTop = detailsRef.current.scrollHeight;
    }
  }, [isStreaming, status.partialCaption, status.partialReasoning]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Prompt for ${img.name}`}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-zinc-900/70 text-zinc-200 rounded-full text-lg hover:bg-zinc-900 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Image with nav arrows — max 66vh */}
        <div className="flex-shrink-0 bg-zinc-100 flex items-center justify-center relative">
          {/* Previous button */}
          {hasPrev && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(currentIndex - 1);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center bg-zinc-900/60 text-zinc-200 rounded-full hover:bg-zinc-900/80 transition-colors"
              aria-label="Previous image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {fullQualitySrc ? (
            /* eslint-disable-next-line @next/next/no-img-element -- user-uploaded file via data URL */
            <img
              src={fullQualitySrc}
              alt={img.name}
              className="max-h-[66vh] w-full object-contain"
            />
          ) : (
            <div className="max-h-[66vh] w-full flex items-center justify-center py-20">
              <div className="w-8 h-8 skeleton rounded-full" />
            </div>
          )}

          {/* Next button */}
          {hasNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(currentIndex + 1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center bg-zinc-900/60 text-zinc-200 rounded-full hover:bg-zinc-900/80 transition-colors"
              aria-label="Next image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Details section */}
        <div ref={detailsRef} className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{img.name}</h3>
            <StatusBadge status={status.status} />
            {allImages.length > 1 && (
              <span className="text-xs text-zinc-400 ml-auto">
                {currentIndex + 1} / {allImages.length}
              </span>
            )}
          </div>

          {/* Prompt — always shown when streaming */}
          {status.prompt && (
            <div className="space-y-1.5">
              <button
                onClick={() => setShowPrompt((p) => !p)}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showPrompt ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Prompt
              </button>
              {showPrompt && (
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                  {status.prompt}
                </div>
              )}
            </div>
          )}

          {/* Reasoning — streams in as model thinks */}
          {(status.reasoningContent || status.partialReasoning) && (
            <div className="space-y-1.5">
              <button
                onClick={() => setShowReasoning((p) => !p)}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showReasoning ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Reasoning
                {isStreaming && !status.reasoningContent && (
                  <span className="ml-1 animate-pulse text-amber-500">●</span>
                )}
              </button>
              {showReasoning && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                  {status.partialReasoning ?? status.reasoningContent}
                  {isStreaming && !status.reasoningContent && (
                    <span className="inline-block w-0.5 h-4 bg-amber-500 animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Generated Caption — streams in as model generates */}
          {(status.caption || status.partialCaption) && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Generated Caption
                {isStreaming && !status.caption && (
                  <span className="ml-1 animate-pulse text-zinc-500">●</span>
                )}
              </h4>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {status.partialCaption ?? status.caption}
                {isStreaming && !status.caption && (
                  <span className="inline-block w-0.5 h-4 bg-zinc-500 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
            </div>
          )}

          {/* Processing indicator — shown when image is being processed but no content yet */}
          {status.status === "processing" && !status.prompt && (
            <div className="flex items-center gap-2 py-3 text-sm text-zinc-400">
              <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
              <span>Processing image...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
