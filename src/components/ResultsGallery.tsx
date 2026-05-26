"use client";

import { ImageFile, ImageStatus } from "./CaptionStudioTypes";
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
  return (
    <div className="relative group border border-zinc-200 rounded overflow-hidden bg-white">
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
      </button>

      <div className="absolute bottom-0 inset-x-0 bg-zinc-900/70 px-2 py-1 flex items-center justify-between gap-1">
        <span className="text-[11px] text-zinc-200 truncate flex-1">
          {img.name}
        </span>
        {status && <StatusBadge status={status.status} />}
      </div>

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
}: {
  images: ImageFile[];
  imageStatuses: Record<string, ImageStatus>;
  croppedPreviews?: Record<string, string>;
  onPreview: (img: ImageFile) => void;
}) {
  const completedCount = images.filter(
    (img) => imageStatuses[img.name]?.status === "completed"
  ).length;
  const failedCount = images.filter(
    (img) => imageStatuses[img.name]?.status === "failed"
  ).length;

  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          4
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Results</h2>
        {images.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto space-x-2">
            <span>{completedCount} captioned</span>
            {failedCount > 0 && <span className="text-zinc-400">&middot; {failedCount} failed</span>}
          </span>
        )}
      </div>

      <div className="p-5">
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
      </div>
    </section>
  );
}
