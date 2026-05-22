import type { ProgressState } from "./CaptionStudioTypes";

// ---------------------------------------------------------------------------
// FloatingActionBar — fixed bottom bar with caption button + progress
// ---------------------------------------------------------------------------

export function FloatingActionBar({
  imagesCount,
  canCaption,
  isProcessing,
  jobId,
  progress,
  progressPercent,
  selectedModel,
  onStartCaptioning,
  onAbort,
}: {
  imagesCount: number;
  canCaption: boolean;
  isProcessing: boolean;
  jobId: string | null;
  progress: ProgressState;
  progressPercent: number;
  selectedModel: string;
  onStartCaptioning: () => void;
  onAbort: () => void;
}) {
  // Nothing to show — no images and no job
  if (imagesCount === 0 && !jobId) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-md border-t border-zinc-200">
      <div className="max-w-7xl mx-auto px-6 py-3">
        {/* Caption button (shown when not processing and job not done) */}
        {!jobId && imagesCount > 0 && (
          <div className="flex items-center gap-4">
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

            {!canCaption && (
              <div className="flex items-center gap-3 text-xs text-zinc-400 shrink-0">
                <span className={`flex items-center gap-1.5 ${selectedModel ? "text-zinc-600" : ""}`}>
                  <svg className={`w-3.5 h-3.5 ${selectedModel ? "text-zinc-700" : "text-zinc-300"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    {selectedModel ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : (
                      <circle cx="12" cy="12" r="10" />
                    )}
                  </svg>
                  Model
                </span>
                <span className="flex items-center gap-1.5 text-zinc-600">
                  <svg className="w-3.5 h-3.5 text-zinc-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {imagesCount} image{imagesCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Processing progress */}
        {jobId && (
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
                title="Abort processing (queued images will be skipped)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Abort
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
