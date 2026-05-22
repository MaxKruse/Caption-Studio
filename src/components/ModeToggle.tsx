"use client";

// ---------------------------------------------------------------------------
// ModeToggle — sliding SFW / NSFW toggle with glow effect
// ---------------------------------------------------------------------------

export function ModeToggle({
  mode,
  onModeChange,
  disabled,
}: {
  mode: "sfw" | "nsfw";
  onModeChange: (mode: "sfw" | "nsfw") => void;
  disabled?: boolean;
}) {
  const isSfw = mode === "sfw";

  return (
    <div className="space-y-2">
      <label className="block text-xs text-zinc-400">
        Content Mode
      </label>
      <div
        className="relative flex rounded-full cursor-pointer select-none"
        onClick={() => {
          if (disabled) return;
          onModeChange(isSfw ? "nsfw" : "sfw");
        }}
        role="switch"
        aria-checked={!isSfw}
        aria-label="Content mode toggle"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) onModeChange(isSfw ? "nsfw" : "sfw");
          }
        }}
      >
        {/* Glow layer — behind the track */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-500 ${
            isSfw
              ? "shadow-[0_0_20px_4px_rgba(34,197,94,0.45)]"
              : "shadow-[0_0_20px_4px_rgba(239,68,68,0.45)]"
          }`}
        />

        {/* Track background */}
        <div className="relative flex rounded-full overflow-hidden border border-zinc-300 bg-zinc-100">
          {/* Left — SFW */}
          <div
            className={`flex-1 px-5 py-2.5 text-sm font-semibold text-center transition-colors duration-300 ${
              isSfw
                ? "text-green-950"
                : "text-zinc-400"
            }`}
          >
            SFW
          </div>
          {/* Right — NSFW */}
          <div
            className={`flex-1 px-5 py-2.5 text-sm font-semibold text-center transition-colors duration-300 ${
              !isSfw
                ? "text-red-950"
                : "text-zinc-400"
            }`}
          >
            NSFW
          </div>
        </div>

        {/* Sliding knob */}
        <div
          className={`absolute top-[2px] bottom-[2px] w-1/2 rounded-full transition-all duration-300 ease-out ${
            isSfw
              ? "left-[2px] bg-green-400/30 shadow-[0_0_12px_2px_rgba(34,197,94,0.3)]"
              : "left-1/2 bg-red-400/30 shadow-[0_0_12px_2px_rgba(239,68,68,0.3)]"
          }`}
        />
      </div>
      <p className="text-[11px] text-zinc-400 -mt-1">
        {isSfw
          ? "Safe-for-work prompts — clean descriptions"
          : "Unfiltered prompts — explicit descriptions"}
      </p>
    </div>
  );
}
