/**
 * Manages temporary image files for caption sessions.
 * Each session gets its own directory under /tmp/caption-studio/.
 * Directories are auto-cleaned 30 minutes after last activity.
 */

import fs from "fs";
import fsp from "fs/promises";
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

/** Maximum size per image (10 MB). */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of images per session. */
const MAX_IMAGES_PER_SESSION = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMeta {
  id: string;
  dir: string;
  createdAt: number;
  lastActivityAt: number;
  imageCount: number;
}

// ---------------------------------------------------------------------------
// In-memory session tracking
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionMeta>();

/** Ensure the base temp directory exists. */
async function ensureBaseDir(): Promise<void> {
  try {
    await fsp.mkdir(TEMP_BASE, { recursive: true });
  } catch {
    // ignore
  }
}

/** Generate a short random session ID. */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 12);
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a filename to prevent path traversal and unsafe characters.
 * Replaces path separators with underscores, removes .. segments,
 * strips dangerous characters, and normalizes whitespace.
 */
export function sanitizeFileName(originalName: string): string {
  // Extract basename to prevent path traversal
  let name = path.basename(originalName.replace(/\\/g, "/"));

  // Strip dangerous characters
  name = name.replace(/[<>:"|?*]/g, "");

  // Normalize whitespace
  name = name.trim().replace(/\s+/g, "_");

  // Collapse multiple dots and remove leading dots
  name = name.replace(/\.{2,}/g, ".");
  name = name.replace(/^\.+/g, "");

  // Ensure non-empty
  if (!name) {
    name = "unnamed";
  }

  return name;
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
// Image validation
// ---------------------------------------------------------------------------

/**
 * Validate image buffer by checking magic bytes.
 * Supports PNG, JPEG, GIF, WEBP.
 */
export function isValidImageBuffer(data: Buffer): boolean {
  if (!data || data.length < 4) return false;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4E &&
    data[3] === 0x47
  ) {
    return true;
  }

  // JPEG: FF D8 FF
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return true;
  }

  // GIF: 47 49 46 38
  if (
    data.length >= 6 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38
  ) {
    return true;
  }

  // WEBP: RIFF....WEBP
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new session directory and return session metadata.
 */
export async function createSession(): Promise<SessionMeta> {
  await ensureBaseDir();

  let sessionId: string;
  let dir: string;

  // Ensure unique session ID
  while (true) {
    sessionId = generateSessionId();
    dir = path.join(TEMP_BASE, sessionId);
    try {
      await fsp.access(dir);
      // exists, try again
    } catch {
      // doesn't exist, good
      break;
    }
  }

  await fsp.mkdir(dir, { recursive: true });

  const meta: SessionMeta = {
    id: sessionId,
    dir,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    imageCount: 0,
  };

  sessions.set(sessionId, meta);
  return meta;
}

/**
 * Save an image buffer to the session directory.
 * Returns the server-assigned filename (may be deduplicated).
 */
export async function saveImage(
  sessionId: string,
  originalName: string,
  data: Buffer,
  usedBases: Set<string>
): Promise<string | null> {
  const meta = sessions.get(sessionId);
  if (!meta) return null;

  // Enforce per-session image count limit
  if (meta.imageCount >= MAX_IMAGES_PER_SESSION) {
    return null;
  }

  // Enforce per-image size limit
  if (data.length > MAX_IMAGE_SIZE_BYTES) {
    return null;
  }

  // Validate image by magic bytes, not just extension
  if (!isValidImageBuffer(data)) {
    return null;
  }

  const sanitizedName = sanitizeFileName(originalName);
  const serverName = deduplicateFileName(sanitizedName, usedBases);
  const filePath = path.join(meta.dir, serverName);

  await fsp.writeFile(filePath, data);
  meta.lastActivityAt = Date.now();
  meta.imageCount++;

  return serverName;
}

/**
 * Write a caption text file next to an image in the session directory.
 */
export async function writeCaption(
  sessionId: string,
  imageServerName: string,
  caption: string
): Promise<boolean> {
  const meta = sessions.get(sessionId);
  if (!meta) return false;

  const lastDot = imageServerName.lastIndexOf(".");
  const base = lastDot === -1 ? imageServerName : imageServerName.slice(0, lastDot);
  const captionPath = path.join(meta.dir, `${base}.txt`);

  await fsp.writeFile(captionPath, caption);
  meta.lastActivityAt = Date.now();
  return true;
}

/**
 * Write a tags-only text file next to an image in the session directory.
 * Used for embedding clean (tags-only) metadata into LoRA files.
 */
export async function writeTags(
  sessionId: string,
  imageServerName: string,
  tags: string
): Promise<boolean> {
  const meta = sessions.get(sessionId);
  if (!meta) return false;

  const lastDot = imageServerName.lastIndexOf(".");
  const base = lastDot === -1 ? imageServerName : imageServerName.slice(0, lastDot);
  const tagsPath = path.join(meta.dir, `${base}.tags`);

  await fsp.writeFile(tagsPath, tags);
  meta.lastActivityAt = Date.now();
  return true;
}

/**
 * Read a caption text file from the session directory.
 * Returns null if the session or caption file not found.
 */
export async function readCaption(
  sessionId: string,
  imageServerName: string
): Promise<string | null> {
  const meta = sessions.get(sessionId);
  if (!meta) return null;

  const lastDot = imageServerName.lastIndexOf(".");
  const base = lastDot === -1 ? imageServerName : imageServerName.slice(0, lastDot);
  const captionPath = path.join(meta.dir, `${base}.txt`);

  try {
    const data = await fsp.readFile(captionPath, "utf-8");
    return data;
  } catch {
    return null;
  }
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
export async function listSessionFiles(sessionId: string): Promise<string[] | null> {
  const meta = getSession(sessionId);
  if (!meta) return null;
  try {
    return await fsp.readdir(meta.dir);
  } catch {
    return null;
  }
}

/**
 * Delete a session directory and remove from tracking.
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const meta = sessions.get(sessionId);
  if (!meta) return false;

  try {
    await fsp.rm(meta.dir, { recursive: true, force: true });
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
async function cleanupStaleSessions(): Promise<void> {
  const now = Date.now();

  for (const [sessionId, meta] of sessions.entries()) {
    if (now - meta.lastActivityAt > CLEANUP_AFTER_MS) {
      try {
        await fsp.rm(meta.dir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
      sessions.delete(sessionId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(() => { cleanupStaleSessions().catch(() => {}); }, CLEANUP_INTERVAL_MS);

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
