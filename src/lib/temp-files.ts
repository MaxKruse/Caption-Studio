/**
 * Manages temporary image files for caption sessions.
 * Each session gets its own directory under /tmp/caption-studio/.
 * Directories are auto-cleaned 30 minutes after last activity.
 */

import fsp from "fs/promises";
import path from "path";
import { baseAndExt } from "./string-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base directory for all temp files. */
const TEMP_BASE = path.join("/tmp", "caption-studio");

/** Session index file for resilient cleanup after restart. */
const SESSION_INDEX_PATH = path.join(TEMP_BASE, "sessions.json");

/** Auto-cleanup threshold (30 minutes after last activity). */
const CLEANUP_AFTER_MS = 30 * 60 * 1000;

/** Cleanup check interval (every 5 minutes). */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum size per image (10 MB). */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum number of images per session.
 * Large-batch workflow (700+ images) is a core use case; the cap is a
 * backstop against pathological accumulation, not a product limit.
 */
export const MAX_IMAGES_PER_SESSION = 5000;

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

// Load existing sessions from index on startup for resilience
(async () => {
  try {
    const data = await fsp.readFile(SESSION_INDEX_PATH, "utf-8");
    const arr = JSON.parse(data) as { id: string; dir: string; lastActivityAt: number }[];
    for (const entry of arr) {
      sessions.set(entry.id, {
        id: entry.id,
        dir: entry.dir,
        createdAt: Date.now(),
        lastActivityAt: entry.lastActivityAt,
        imageCount: 0,
      });
    }
  } catch {
    // No index yet
  }
})();

/** Ensure the base temp directory exists. */
async function ensureBaseDir(): Promise<void> {
  try {
    await fsp.mkdir(TEMP_BASE, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Generate a session ID using a cryptographically secure UUIDv4.
 * Session directories are reachable via unauthenticated
 * /api/download?sessionId=, so predictable IDs (Math.random) would
 * let a network peer enumerate and download other users' results.
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/** Persist session index to disk for resilient cleanup. */
async function saveSessionIndex(): Promise<void> {
  try {
    const data = Array.from(sessions.values()).map(m => ({
      id: m.id,
      dir: m.dir,
      lastActivityAt: m.lastActivityAt,
    }));
    await fsp.writeFile(SESSION_INDEX_PATH, JSON.stringify(data), "utf-8");
  } catch {
    // Best effort
  }
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
  const { base, ext } = baseAndExt(originalName);

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
 * Supports PNG, JPEG, GIF, WEBP, AVIF, TIFF.
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

  // AVIF / HEIC family: ISO BMFF container (ftyp box) with an AVIF brand.
  // HEIC brands are deliberately NOT accepted: sharp's prebuilt libvips
  // decodes the container but not the HEVC payload.
  if (
    data.length >= 12 &&
    data[4] === 0x66 && // "ftyp"
    data[5] === 0x74 &&
    data[6] === 0x79 &&
    data[7] === 0x70 &&
    (
      (data[8] === 0x61 && data[9] === 0x76 && data[10] === 0x69 && data[11] === 0x66) || // "avif"
      (data[8] === 0x61 && data[9] === 0x76 && data[10] === 0x69 && data[11] === 0x73) // "avis"
    )
  ) {
    return true;
  }

  // TIFF: little-endian "II*\0" or big-endian "MM\0*"
  if (
    (data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0x00) ||
    (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2a)
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Rejection reasons
// ---------------------------------------------------------------------------

/** Why an image was rejected at upload time. */
export type ImageRejectionReason = "oversized" | "invalid-format" | "session-full";

const IMAGE_REJECTION_MESSAGES: Record<ImageRejectionReason, string> = {
  oversized: `rejected at upload: exceeds the ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB per-image limit`,
  "invalid-format":
    "rejected at upload: unsupported image format (PNG, JPEG, GIF, WEBP, AVIF, or TIFF required)",
  "session-full": "rejected at upload: session image limit reached",
};

/** Human-readable rejection message for per-image events and warnings. */
export function imageRejectionMessage(reason: ImageRejectionReason): string {
  return IMAGE_REJECTION_MESSAGES[reason];
}

/**
 * Check a single image buffer against the upload constraints (size, magic
 * bytes). Returns the rejection reason, or null when the buffer is
 * acceptable. Does not account for the per-session image cap.
 */
export function imageRejectionReason(
  data: Buffer
): "oversized" | "invalid-format" | null {
  if (data.length > MAX_IMAGE_SIZE_BYTES) return "oversized";
  if (!isValidImageBuffer(data)) return "invalid-format";
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Strict UUIDv4 - the only shape accepted for client-provided session ids. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Create a new session directory and return session metadata.
 *
 * @param clientId Optional client-generated UUIDv4. Chunked uploads name
 *   the session from the client so it knows the id before the stream
 *   opens. Because the id becomes a directory name, only strict UUIDv4
 *   strings are accepted (anything else is a path-traversal vector).
 */
export async function createSession(clientId?: string): Promise<SessionMeta> {
  await ensureBaseDir();

  let dir: string;
  let sessionId: string;

  if (clientId !== undefined) {
    if (!UUID_V4_RE.test(clientId)) {
      throw new Error("Invalid client session id");
    }
    sessionId = clientId;
    dir = path.join(TEMP_BASE, sessionId);
    try {
      await fsp.mkdir(dir);
    } catch {
      throw new Error("Session already exists");
    }
  } else {
    // Generate a unique session ID
    for (;;) {
      sessionId = generateSessionId();
      dir = path.join(TEMP_BASE, sessionId);
      try {
        await fsp.access(dir);
        // exists, try again
        continue;
      } catch {
        // doesn't exist, good
        break;
      }
    }
    await fsp.mkdir(dir, { recursive: true });
  }

  const meta: SessionMeta = {
    id: sessionId,
    dir,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    imageCount: 0,
  };

  sessions.set(sessionId, meta);
  await saveSessionIndex();
  return meta;
}

/**
 * Validate a single image for saving and reserve its deduplicated name.
 * Returns the server-assigned filename, or null if the image is rejected
 * (oversized or not a valid image). Side effect: reserves the name in
 * usedBases when returning a name.
 */
function validateImageForSave(
  originalName: string,
  data: Buffer,
  usedBases: Set<string>
): string | null {
  if (imageRejectionReason(data) !== null) return null;
  return deduplicateFileName(sanitizeFileName(originalName), usedBases);
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

  const serverName = validateImageForSave(originalName, data, usedBases);
  if (!serverName) return null;

  const filePath = path.join(meta.dir, serverName);

  await fsp.writeFile(filePath, data);
  meta.lastActivityAt = Date.now();
  meta.imageCount++;

  return serverName;
}

/** One item for saveImagesBatch. */
export interface BatchSaveItem {
  originalName: string;
  data: Buffer;
}

/**
 * One result from saveImagesBatch: the saved server name, or the rejection
 * reason when the image was not saved.
 */
export interface BatchSaveResult {
  name: string | null;
  reason?: ImageRejectionReason;
}

/**
 * Validate and save multiple images to a session, writing in parallel.
 *
 * Preserves saveImage semantics: results map 1:1 to input order, base names
 * are deduplicated in input order, rejected items report the reason
 * ("oversized" / "invalid-format"), and the per-session image cap rejects
 * everything beyond the first MAX_IMAGES_PER_SESSION valid images as
 * "session-full".
 */
export async function saveImagesBatch(
  sessionId: string,
  items: BatchSaveItem[],
  usedBases: Set<string>
): Promise<BatchSaveResult[]> {
  const meta = sessions.get(sessionId);
  if (!meta) return items.map(() => ({ name: null }));

  const allowed = MAX_IMAGES_PER_SESSION - meta.imageCount;
  const results: BatchSaveResult[] = new Array(items.length).fill(null as unknown as BatchSaveResult);
  const toWrite: { i: number; serverName: string; data: Buffer }[] = [];

  // Validate sequentially so name deduplication and the image cap keep
  // input-order semantics, then write concurrently.
  items.forEach((item, i) => {
    if (toWrite.length >= allowed) {
      results[i] = { name: null, reason: "session-full" };
      return;
    }
    const bufferReason = imageRejectionReason(item.data);
    if (bufferReason) {
      results[i] = { name: null, reason: bufferReason };
      return;
    }
    const serverName = deduplicateFileName(sanitizeFileName(item.originalName), usedBases);
    toWrite.push({ i, serverName, data: item.data });
  });

  await Promise.all(
    toWrite.map(async ({ i, serverName, data }) => {
      await fsp.writeFile(path.join(meta.dir, serverName), data);
      results[i] = { name: serverName };
    })
  );

  if (toWrite.length > 0) {
    meta.imageCount += toWrite.length;
    meta.lastActivityAt = Date.now();
  }

  return results;
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

  const { base } = baseAndExt(imageServerName);
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

  const { base } = baseAndExt(imageServerName);
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

  const { base } = baseAndExt(imageServerName);
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
  await saveSessionIndex();
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

// Run cleanup every 5 minutes. Sessions are keyed in sessions.json so the
// next process start also adopts and eventually reaps them.
setInterval(() => { cleanupStaleSessions().catch(() => {}); }, CLEANUP_INTERVAL_MS);
//
// Note: we intentionally do NOT delete session dirs on process exit. A
// Docker rebuild restarts the process and would destroy finished (or
// in-progress) results the user has not downloaded yet. The 30-minute
// stale TTL is the only deletion path.
