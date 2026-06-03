// ---------------------------------------------------------------------------
// PageFooter — version number and tech stack badges at page bottom
// ---------------------------------------------------------------------------

export function PageFooter() {
  return (
    <footer className="mt-8 pt-6 border-t border-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-400">
        <span>
          Caption Studio v{APP_VERSION}
        </span>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-500">
            Next.js 16
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-500">
            React 19
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-500">
            TypeScript
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-500">
            Tailwind v4
          </span>
        </div>
      </div>
    </footer>
  );
}

const APP_VERSION = "0.1.0";
