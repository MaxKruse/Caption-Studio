/**
 * Client-side download helper shared by both captioning modes.
 *
 * Browser-only: uses fetch, URL.createObjectURL, and the DOM anchor
 * click pattern. Not importable from server components or route handlers.
 */

"use client";

/**
 * Trigger a ZIP download of a caption session from the server temp files.
 *
 * @param sessionId - Session ID returned by the caption API (first SSE event)
 */
export async function triggerDownload(sessionId: string | null): Promise<void> {
  if (!sessionId) return;

  try {
    const response = await fetch(`/api/download?sessionId=${sessionId}`);
    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Silently fail - download is a convenience feature
  }
}
