// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

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
