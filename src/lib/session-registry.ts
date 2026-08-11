/**
 * Shared session registry for active caption jobs.
 *
 * Provides a single source of truth for tracking AbortControllers
 * across all caption routes, enabling explicit abort and cleanup.
 */

// ---------------------------------------------------------------------------
// Internal store
// ---------------------------------------------------------------------------

export const activeSessions = new Map<string, AbortController>();

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

/**
 * Register an active session.
 */
export function registerSession(sessionId: string, abortController: AbortController): void {
  activeSessions.set(sessionId, abortController);
}

/**
 * Unregister a session without aborting.
 */
export function unregisterSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

/**
 * Abort and remove a session.
 * @returns true if session existed and was aborted
 */
export function abortSession(sessionId: string): boolean {
  const ac = activeSessions.get(sessionId);
  if (!ac) return false;
  ac.abort();
  activeSessions.delete(sessionId);
  return true;
}

/**
 * Get the AbortController for a session, if registered.
 */
export function getSession(sessionId: string): AbortController | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Remove all sessions whose AbortController has been aborted externally.
 * Intended for periodic cleanup interval.
 */
export function cleanupAbortedSessions(): void {
  for (const [sessionId, ac] of activeSessions.entries()) {
    if (ac.signal.aborted) {
      activeSessions.delete(sessionId);
    }
  }
}

/**
 * Clear all sessions. Exported for tests only.
 */
export function clearAll(): void {
  activeSessions.clear();
}
