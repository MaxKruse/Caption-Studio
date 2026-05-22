// ---------------------------------------------------------------------------
// JobErrorMessage — inline error banner with dismiss button
// ---------------------------------------------------------------------------

export function JobErrorMessage({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-2 p-3 text-sm bg-zinc-100 text-zinc-600 rounded border border-zinc-200">
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
      >
        &times;
      </button>
    </div>
  );
}
