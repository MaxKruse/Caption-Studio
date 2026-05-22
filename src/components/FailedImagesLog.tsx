import type { ImageFile, ImageStatus } from "./CaptionStudioTypes";

// ---------------------------------------------------------------------------
// FailedImagesLog — collapsible error log for failed images after job completion
// ---------------------------------------------------------------------------

export function FailedImagesLog({
  failedImages,
  isOpen,
  onToggle,
}: {
  failedImages: Array<{ img: ImageFile; status: ImageStatus | undefined }>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (failedImages.length === 0) return null;

  return (
    <div className="rounded border border-zinc-300 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-3 text-sm bg-zinc-100 hover:bg-zinc-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-zinc-600">
          <svg
            className="w-4 h-4 text-zinc-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          {failedImages.length} image(s) failed — {isOpen ? "Hide" : "Show"}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 bg-white">
          {failedImages.map(({ img, status }) => (
            <div key={img.name} className="px-3 py-2 flex items-start gap-2">
              <span className="text-xs font-medium text-zinc-700 flex-1 truncate">
                {img.name}
              </span>
              <span className="text-[11px] text-zinc-400 break-all">
                {status?.error ?? "Unknown error"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
