// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

import { getExtension } from "@/lib/string-utils";

/**
 * Returns the file extension (lowercase, no dot) from a filename.
 * Re-exported from the shared string utilities for backward compatibility.
 */
export { getExtension as getFileExtension };

/** Format milliseconds to a compact human-readable duration string. */
export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs === 0) return "<1s";
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remainingSecs = secs % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSecs > 0 || parts.length === 0) parts.push(`${remainingSecs}s`);
  return parts.join(" ");
}
