import type { ToastState } from "./CaptionStudioTypes";

// ---------------------------------------------------------------------------
// ToastNotification — fixed top-right toast message
// ---------------------------------------------------------------------------

export function ToastNotification({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
        toast.visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-sm bg-zinc-900 text-zinc-100 rounded shadow-lg border border-zinc-700">
        <svg
          className="w-4 h-4 text-zinc-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <span className="max-w-xs">{toast.message}</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-lg leading-none flex-shrink-0"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
