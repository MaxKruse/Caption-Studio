import { formatDuration } from "./CaptionStudioTypes";

// ---------------------------------------------------------------------------
// TimeEstimator — floating badge shown during processing
// ---------------------------------------------------------------------------

export function TimeEstimator({
  estimatedRemainingMs,
  avgTimeMs,
  remaining,
  isDone,
}: {
  estimatedRemainingMs?: number;
  avgTimeMs?: number;
  remaining: number;
  isDone: boolean;
}) {
  if (remaining < 0) return null;

  return (
    <div className="fixed bottom-[56px] left-4 z-50 min-w-[260px] px-3 py-2 bg-zinc-900/90 backdrop-blur-sm text-zinc-100 rounded-lg shadow-lg border border-zinc-700/50 text-xs space-y-0.5">
      {isDone ? (
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Done!</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
          </svg>
          <span className="text-zinc-300">Est. remaining:</span>
          {estimatedRemainingMs != null ? (
            <span className="font-semibold">{formatDuration(estimatedRemainingMs)}</span>
          ) : (
            <span className="font-semibold text-zinc-400">Waiting...</span>
          )}
        </div>
      )}
      {avgTimeMs != null && (
        <div className="flex items-center gap-1.5 pl-5">
          <span className="text-zinc-500">~{formatDuration(Math.round(avgTimeMs))} per image</span>
        </div>
      )}
      {!isDone && remaining > 0 && (
        <div className="flex items-center gap-1.5 pl-5">
          <span className="text-zinc-500">{remaining} image{remaining !== 1 ? "s" : ""} left</span>
        </div>
      )}
    </div>
  );
}
