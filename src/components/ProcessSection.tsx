import { ProgressState } from "./CaptionStudioTypes";

export function ProcessSection({
  images,
  selectedModel,
  serverUrl,
  jobId,
  isProcessing,
  isDownloading,
  progress,
  progressPercent,
  canCaption,
  jobDone,
  onStartCaptioning,
  onDownloadZip,
}: {
  images: string[]; // just need the length
  selectedModel: string;
  serverUrl: string;
  jobId: string | null;
  isProcessing: boolean;
  isDownloading: boolean;
  progress: ProgressState;
  progressPercent: number;
  canCaption: boolean;
  jobDone: boolean;
  onStartCaptioning: () => void;
  onDownloadZip: () => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          3
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">
          {jobDone ? "Download" : isProcessing ? "Processing" : "Generate"}
        </h2>
        {jobDone && (
          <span className="text-xs text-zinc-400 ml-auto">
            {progress.completed} done
            {progress.failed > 0 ? `, ${progress.failed} failed` : ""}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Caption All button */}
        {!jobDone && (
          <div className="space-y-3">
            <button
              onClick={onStartCaptioning}
              disabled={!canCaption}
              className={`w-full px-4 py-3 text-sm font-medium rounded transition-colors ${
                canCaption
                  ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              }`}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Processing {images.length} image{images.length !== 1 ? "s" : ""}...
                </span>
              ) : (
                `Caption ${images.length} Image${images.length !== 1 ? "s" : ""}`
              )}
            </button>

            {!canCaption && !isProcessing && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
                <span className={`flex items-center gap-1.5 ${selectedModel ? "text-zinc-600" : ""}`}>
                  <svg className={`w-3.5 h-3.5 ${selectedModel ? "text-zinc-700" : "text-zinc-300"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    {selectedModel ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : (
                      <circle cx="12" cy="12" r="10" />
                    )}
                  </svg>
                  Model selected
                </span>
                <span className={`flex items-center gap-1.5 ${images.length > 0 ? "text-zinc-600" : ""}`}>
                  <svg className={`w-3.5 h-3.5 ${images.length > 0 ? "text-zinc-700" : "text-zinc-300"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    {images.length > 0 ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : (
                      <circle cx="12" cy="12" r="10" />
                    )}
                  </svg>
                  Images uploaded
                </span>
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        {jobId && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="space-x-2">
                <span>{progress.completed} done</span>
                {progress.failed > 0 && (
                  <span className="text-zinc-400">
                    &middot; {progress.failed} failed
                  </span>
                )}
                {progress.processing > 0 && (
                  <span className="text-zinc-400">
                    &middot; {progress.processing} processing
                  </span>
                )}
              </span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-700 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Download button */}
        {jobDone && (
          <button
            onClick={onDownloadZip}
            disabled={isDownloading}
            className="w-full px-4 py-3 text-sm font-medium bg-zinc-900 text-zinc-100 rounded hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isDownloading ? "Preparing..." : "Download ZIP"}
          </button>
        )}
      </div>
    </section>
  );
}
