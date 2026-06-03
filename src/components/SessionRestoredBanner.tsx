"use client";

// ---------------------------------------------------------------------------
// SessionRestoredBanner — brief "Welcome back" banner when config restored
// from localStorage. Appears for 3 seconds then fades out.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export function SessionRestoredBanner({ restored }: { restored: boolean }) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!restored) return;

    // Small delay so the banner appears after initial render
    const showTimer = setTimeout(() => setVisible(true), 300);
    const hideTimer = setTimeout(() => {
      setFading(true);
    }, 3300);
    const removeTimer = setTimeout(() => setVisible(false), 3700);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [restored]);

  if (!visible) return null;

  return (
    <div
      className={`
        animate-fade-in
        ${fading ? "animate-fade-out" : ""}
        rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5
        text-xs text-zinc-500 flex items-center gap-2
      `}
      role="status"
    >
      <svg
        className="w-3.5 h-3.5 text-zinc-400 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>Welcome back — your settings are restored</span>
    </div>
  );
}
