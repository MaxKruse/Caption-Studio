/**
 * Manages temporary image files for caption sessions.
 * Each session gets its own directory under /tmp/caption-studio/.
 * Directories are auto-cleaned 30 minutes after last activity.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base directory for all temp files. */
const TEMP_BASE = path.join("/tmp", "caption-studio");

/** Auto-cleanup threshold (30 minutes after last activity). */
const CLEANUP_AFTER_MS = 30 * 60 * 1000;

/** Cleanup check interval (every 5 minutes). */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMeta {
  id: string;
  dir: string;
  createdAt: number;
  lastActivityAt: number;
}

// ---------------------------------------------------------------------------
// In-memory session tracking
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionMeta>();

/** Ensure the base temp directory exists. */
function ensureBaseDir(): void {
  if (!fs.existsSync(TEMP_BASE)) {
    fs.mkdirSync(TEMP_BASE, { recursive: true });
  }
}

/** Generate a short random session ID. */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 12);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Resolve a filename to a unique name within the session directory.
 * Deduplicates by base name (ignoring extension): "1.png" and "1.jpg" collide.
 * First occurrence keeps the original name. Subsequent get _1, _2, etc.
 */
export function deduplicateFileName(
  originalName: string,
  usedBases: Set<string>
): string {
  const lastDot = originalName.lastIndexOf(".");
  const ext = lastDot === -1 ? "" : originalName.slice(lastDot);
  const base = lastDot === -1 ? originalName : originalName.slice(0, lastDot);

  if (!usedBases.has(base)) {
    usedBases.add(base);
    return originalName;
  }

  // Collision - find next available suffix
  let suffix = 1;
  while (usedBases.has(`${base}_${suffix}`)) {
    suffix++;
  }
  const candidate = `${base}_${suffix}${ext}`;
  usedBases.add(`${base}_${suffix}`);
  return candidate;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new session directory and return session metadata.
 */
export function createSession(): SessionMeta {
  ensureBaseDir();

  let sessionId: string;
  let dir: string;

  // Ensure unique session ID
  do {
    sessionId = generateSessionId();
    dir = path.join(TEMP_BASE, sessionId);
  } while (fs.existsSync(dir));

  fs.mkdirSync(dir, { recursive: true });

  const meta: SessionMeta = {
    id: sessionId,
    dir,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  sessions.set(sessionId, meta);
  return meta;
}

/**
 * Save an image buffer to the session directory.
 * Returns the server-assigned filename (may be deduplicated).
 */
export function saveImage(
  sessionId: string,
  originalName: string,
  data: Buffer,
  usedBases: Set<string>
): string | null {
  const meta = sessions.get(sessionId);
  if (!meta) return null;

  const serverName = deduplicateFileName(originalName, usedBases);
  const filePath = path.join(meta.dir, serverName);

  fs.writeFileSync(filePath, data);
  meta.lastActivityAt = Date.now();

  return serverName;
}

/**
 * Write a caption text file next to an image in the session directory.
 */
export function writeCaption(
  sessionId: string,
  imageServerName: string,
  caption: string
): boolean {
  const meta = sessions.get(sessionId);
  if (!meta) return false;

  const lastDot = imageServerName.lastIndexOf(".");
  const base = lastDot === -1 ? imageServerName : imageServerName.slice(0, lastDot);
  const captionPath = path.join(meta.dir, `${base}.txt`);

  fs.writeFileSync(captionPath, caption);
  meta.lastActivityAt = Date.now();
  return true;
}

/**
 * Write a tags-only text file next to an image in the session directory.
 * Used for embedding clean (tags-only) metadata into LoRA files.
 */
export function writeTags(
  sessionId: string,
  imageServerName: string,
  tags: string
): boolean {
  const meta = sessions.get(sessionId);
  if (!meta) return false;

  const lastDot = imageServerName.lastIndexOf(".");
  const base = lastDot === -1 ? imageServerName : imageServerName.slice(0, lastDot);
  const tagsPath = path.join(meta.dir, `${base}.tags`);

  fs.writeFileSync(tagsPath, tags);
  meta.lastActivityAt = Date.now();
  return true;
}

/**
 * Read a caption text file from the session directory.
 * Returns null if the session or caption file not found.
 */
export function readCaption(
  sessionId: string,
  imageServerName: string
): string | null {
  const meta = sessions.get(sessionId);
  if (!meta) return null;

  const lastDot = imageServerName.lastIndexOf(".");
  const base = lastDot === -1 ? imageServerName : imageServerName.slice(0, lastDot);
  const captionPath = path.join(meta.dir, `${base}.txt`);

  if (!fs.existsSync(captionPath)) return null;

  return fs.readFileSync(captionPath, "utf-8");
}

/**
 * Get session metadata by ID. Touches the last-activity timestamp.
 */
export function getSession(sessionId: string): SessionMeta | null {
  const meta = sessions.get(sessionId);
  if (!meta) return null;
  meta.lastActivityAt = Date.now();
  return meta;
}

/**
 * Get all files in a session directory. Returns null if session not found.
 */
export function listSessionFiles(sessionId: string): string[] | null {
  const meta = getSession(sessionId);
  if (!meta) return null;
  return fs.readdirSync(meta.dir);
}

/**
 * Delete a session directory and remove from tracking.
 */
export function deleteSession(sessionId: string): boolean {
  const meta = sessions.get(sessionId);
  if (!meta) return false;

  try {
    fs.rmSync(meta.dir, { recursive: true, force: true });
  } catch {
    // Best effort - directory may already be gone
  }

  sessions.delete(sessionId);
  return true;
}

/**
 * Touch a session's last-activity timestamp (extend its life).
 */
export function touchSession(sessionId: string): void {
  const meta = sessions.get(sessionId);
  if (meta) {
    meta.lastActivityAt = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Auto-cleanup
// ---------------------------------------------------------------------------

/** Remove sessions whose last activity was more than CLEANUP_AFTER_MS ago. */
function cleanupStaleSessions(): void {
  const now = Date.now();

  for (const [sessionId, meta] of sessions.entries()) {
    if (now - meta.lastActivityAt > CLEANUP_AFTER_MS) {
      try {
        fs.rmSync(meta.dir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
      sessions.delete(sessionId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS);

// Also clean up on process exit (graceful shutdown)
process.on("exit", () => {
  for (const sessionId of sessions.keys()) {
    try {
      const meta = sessions.get(sessionId);
      if (meta) {
        fs.rmSync(meta.dir, { recursive: true, force: true });
      }
    } catch {
      // Best effort
    }
  }
});
