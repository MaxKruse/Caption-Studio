import type { ProgressState } from "./CaptionStudioTypes";

// ---------------------------------------------------------------------------
// FloatingActionBar — fixed bottom bar with actions for all job states
// ---------------------------------------------------------------------------

export function FloatingActionBar({
  imagesCount,
  canCaption,
  isProcessing,
  jobId,
  progress,
  progressPercent,
  onStartCaptioning,
  onAbort,
  onAddMore,
  onClearAll,
  onDownloadZip,
  jobDone,
}: {
  imagesCount: number;
  canCaption: boolean;
  isProcessing: boolean;
  jobId: string | null;
  progress: ProgressState;
  progressPercent: number;
  onStartCaptioning: () => void;
  onAbort: () => void;
  onAddMore: () => void;
  onClearAll: () => void;
  onDownloadZip: () => void;
  jobDone: boolean;
}) {
  // Nothing to show — no images and no job
  if (imagesCount === 0 && !jobId) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-md border-t border-zinc-200">
      <div className="max-w-7xl mx-auto px-6 py-3">
        {/* ----------------------------------------------------------------- */}
        {/* READY — images uploaded, no job started yet                       */}
        {/* ----------------------------------------------------------------- */}
        {!jobId && imagesCount > 0 && (
          <div className="flex items-center gap-3">
            {/* Primary: Caption button */}
            <button
              onClick={onStartCaptioning}
              disabled={!canCaption}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                canCaption
                  ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              }`}
            >
              Caption {imagesCount} Image{imagesCount !== 1 ? "s" : ""}
            </button>

            {/* Secondary: Add more images */}
            <button
              onClick={onAddMore}
              className="shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
              aria-label="Add more images"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add more
            </button>

            {/* Secondary: Clear all */}
            <button
              onClick={onClearAll}
              className="shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-1.5"
              aria-label="Clear all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* PROCESSING — job running, show progress + abort                   */}
        {/* ----------------------------------------------------------------- */}
        {jobId && !jobDone && (
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                <span className="space-x-2 truncate">
                  <span>{progress.completed} done</span>
                  {progress.failed > 0 && (
                    <span className="text-zinc-400">&middot; {progress.failed} failed</span>
                  )}
                  {progress.processing > 0 && (
                    <span className="text-zinc-400">&middot; {progress.processing} processing</span>
                  )}
                </span>
                <span className="font-medium shrink-0">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-700 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {isProcessing && (
              <button
                onClick={onAbort}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
                aria-label="Abort"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Abort
              </button>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* DONE — job completed, show results + download + start over        */}
        {/* ----------------------------------------------------------------- */}
        {jobDone && (
          <div className="flex items-center gap-3">
            {/* Completion summary */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <svg className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium text-zinc-700">
                  {progress.completed} completed
                </span>
                {progress.failed > 0 && (
                  <span className="text-zinc-400">&middot; {progress.failed} failed</span>
                )}
              </div>
            </div>

            {/* Primary: Download ZIP */}
            <button
              onClick={onDownloadZip}
              className="shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0l-4.5-4.5M12 16.5V3" />
              </svg>
              Download ZIP
            </button>

            {/* Secondary: Start over */}
            <button
              onClick={onClearAll}
              className="shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
              aria-label="Start over"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
