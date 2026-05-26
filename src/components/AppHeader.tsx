// ---------------------------------------------------------------------------
// AppHeader — page title and description
// ---------------------------------------------------------------------------

export function AppHeader() {
  return (
    <header className="border-b border-zinc-200 pb-6">
      <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
        Character Captioning Studio
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Configure API &amp; ruleset → upload images → detect faces/bodies → crop → caption → download.
      </p>
    </header>
  );
}
