import { useEffect } from "react";

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
}: {
  img: ImageFile;
  status: ImageStatus;
  onClose: () => void;
  allImages: ImageFile[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}) {
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allImages.length - 1;

  // Keyboard navigation: arrow keys + escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onNavigate(currentIndex - 1);
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNavigate(currentIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, hasPrev, hasNext, onNavigate]);

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

        {/* Image with nav arrows */}
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

          <img
            src={img.preview}
            alt={img.name}
            className="max-h-80 w-full object-contain"
          />

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
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{img.name}</h3>
            <StatusBadge status={status.status} />
            {allImages.length > 1 && (
              <span className="text-xs text-zinc-400 ml-auto">
                {currentIndex + 1} / {allImages.length}
              </span>
            )}
          </div>

          {status.prompt && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Prompt
              </h4>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {status.prompt}
              </div>
            </div>
          )}

          {status.reasoningContent && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Reasoning
              </h4>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                {status.reasoningContent}
              </div>
            </div>
          )}

          {status.caption && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Generated Caption
              </h4>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {status.caption}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
