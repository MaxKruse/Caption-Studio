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
      {/* Outer wrapper — holds glow (no overflow clip so glow bleeds out) */}
      <div
        className="relative cursor-pointer select-none"
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
        {/* Glow — behind everything */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-500 ${
            isSfw
              ? "shadow-[0_0_20px_4px_rgba(34,197,94,0.45)]"
              : "shadow-[0_0_20px_4px_rgba(239,68,68,0.45)]"
          }`}
        />

        {/* Inner track — clips knob edges, sits on glow */}
        <div className="relative flex rounded-full overflow-hidden border border-zinc-500 bg-zinc-800">
          {/* Sliding translucent knob — behind text */}
          <div
            className={`absolute top-[2px] bottom-[2px] w-1/2 rounded-full transition-all duration-300 ease-out ${
              isSfw
                ? "left-[2px] bg-green-500/30"
                : "left-1/2 bg-red-500/30"
            }`}
          />

          {/* Labels — on top */}
          <div
            className={`relative flex z-10 flex-1 px-5 py-2.5 text-sm font-semibold text-center transition-colors duration-300 pointer-events-none ${
              isSfw ? "text-zinc-200" : "text-zinc-500"
            }`}
          >
            SFW
          </div>
          <div
            className={`relative flex z-10 flex-1 px-5 py-2.5 text-sm font-semibold text-center transition-colors duration-300 pointer-events-none ${
              !isSfw ? "text-zinc-200" : "text-zinc-500"
            }`}
          >
            NSFW
          </div>
        </div>
      </div>
      <p className="text-[11px] text-zinc-400 -mt-1">
        {isSfw
          ? "Safe-for-work prompts — clean descriptions"
          : "Unfiltered prompts — explicit descriptions"}
      </p>
    </div>
  );
}
