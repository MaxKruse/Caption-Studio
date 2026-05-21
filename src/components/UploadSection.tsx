import { ImageFile, ImageStatus } from "./CaptionStudioTypes";
import { StatusBadge } from "./ImagePreviewModal";

// ---------------------------------------------------------------------------
// ImageCard - single image thumbnail with status
// ---------------------------------------------------------------------------

function ImageCard({
  img,
  status,
  onRemove,
  disabled,
  onPreview,
}: {
  img: ImageFile;
  status?: ImageStatus;
  onRemove: (name: string) => void;
  disabled: boolean;
  onPreview: (img: ImageFile) => void;
}) {
  return (
    <div className="relative group border border-zinc-200 rounded overflow-hidden bg-white">
      <button
        onClick={() => onPreview(img)}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer hover:opacity-90 transition-opacity"
        title="Click to view details"
      >
        <img
          src={img.preview}
          alt={img.name}
          className="w-full h-28 object-cover"
        />
      </button>

      <div className="absolute bottom-0 inset-x-0 bg-zinc-900/70 px-2 py-1 flex items-center justify-between gap-1">
        <span className="text-[11px] text-zinc-200 truncate flex-1">
          {img.name}
        </span>
        {status && <StatusBadge status={status.status} />}
      </div>

      {!disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(img.name);
          }}
          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-zinc-900/60 text-zinc-200 rounded text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-900/80 z-10"
          aria-label={`Remove ${img.name}`}
        >
          &times;
        </button>
      )}

      {status?.prompt && (
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-zinc-900/70 rounded text-[9px] text-zinc-300 font-medium">
          &#9998; prompt
        </div>
      )}

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
// UploadSection - Step 2: drag-drop zone + image gallery
// ---------------------------------------------------------------------------

export function UploadSection({
  images,
  imageStatuses,
  dragOver,
  galleryOpen,
  onGalleryToggle,
  clearAllConfirm,
  onClearAllToggle,
  isProcessing,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemoveImage,
  onPreview,
  fileInputRef,
}: {
  images: ImageFile[];
  imageStatuses: Record<string, ImageStatus>;
  dragOver: boolean;
  galleryOpen: boolean;
  onGalleryToggle: () => void;
  clearAllConfirm: boolean;
  onClearAllToggle: () => void;
  isProcessing: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (name: string) => void;
  onPreview: (img: ImageFile) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          2
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Upload Images</h2>
        {images.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {images.length} image{images.length !== 1 ? "s" : ""} ready
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 border-2 border-dashed rounded cursor-pointer transition-colors ${
            dragOver
              ? "border-zinc-500 bg-zinc-100"
              : "border-zinc-300 hover:border-zinc-400"
          } ${isProcessing ? "pointer-events-none opacity-50" : ""}`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
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
            <span className="text-sm text-zinc-500">
              Click to upload or drag &amp; drop
            </span>
            <span className="text-xs text-zinc-400">
              PNG, JPG, JPEG, WebP, GIF
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif"
            onChange={onFileChange}
            className="hidden"
          />
        </div>

        {/* Gallery */}
        {images.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={onGalleryToggle}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    galleryOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  />
                </svg>
                {galleryOpen ? "Hide" : "Show"} images
              </button>
              {!isProcessing && (
                <button
                  onClick={onClearAllToggle}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full transition-colors ${
                    clearAllConfirm
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:border-red-300"
                  }`}
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                  {clearAllConfirm ? "Are you sure?" : "Clear all"}
                </button>
              )}
            </div>

            {galleryOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {images.map((img) => (
                  <ImageCard
                    key={img.name}
                    img={img}
                    status={imageStatuses[img.name]}
                    onRemove={onRemoveImage}
                    disabled={isProcessing}
                    onPreview={onPreview}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
