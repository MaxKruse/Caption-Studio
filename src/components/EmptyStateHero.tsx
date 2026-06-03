"use client";

// ---------------------------------------------------------------------------
// EmptyStateHero — large inviting upload area shown when no images uploaded
// ---------------------------------------------------------------------------

export function EmptyStateHero({
  onClick,
  dragOver,
  isProcessing,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onClick: () => void;
  dragOver: boolean;
  isProcessing: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`
        relative flex flex-col items-center justify-center gap-4 px-6 py-16 sm:py-24
        border-2 border-dashed rounded-b-xl cursor-pointer transition-colors
        ${dragOver ? "border-zinc-500 bg-zinc-100" : "border-zinc-300 hover:border-zinc-400 bg-white"}
        ${isProcessing ? "pointer-events-none opacity-50" : ""}
      `}
    >
      {/* Upload icon */}
      <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-1">
        <svg
          className="w-8 h-8 text-zinc-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32A3 3 0 0121 12v7.5a3 3 0 01-3 3H6.75z"
          />
        </svg>
      </div>

      {/* Headline */}
      <div className="text-center space-y-1.5">
        <h2 className="text-base font-semibold text-zinc-700">
          Upload your images
        </h2>
        <p className="text-sm text-zinc-400 max-w-sm mx-auto">
          Click to upload or drag &amp; drop images here.
        </p>
        <span className="text-xs text-zinc-400">
          PNG, JPG, JPEG, WebP, GIF
        </span>
      </div>

      {/* Tip badges */}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-500">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.702 2.808a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          15–30 images recommended
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-500">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.574 48.574 0 00-5.839 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          </svg>
          Mix portraits &amp; full-body
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-500">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Full resolution preserved
        </span>
      </div>
    </div>
  );
}
