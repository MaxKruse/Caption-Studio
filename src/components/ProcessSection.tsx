export function ProcessSection({
  isDownloading,
  onDownloadZip,
}: {
  isDownloading: boolean;
  onDownloadZip: () => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          3
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Download</h2>
      </div>

      <div className="p-5">
        <button
          onClick={onDownloadZip}
          disabled={isDownloading}
          className="w-full px-4 py-3 text-sm font-medium bg-zinc-900 text-zinc-100 rounded hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isDownloading ? "Preparing..." : "Download ZIP"}
        </button>
      </div>
    </section>
  );
}
