/**
 * ZIP download endpoint for captioned images.
 * GET  /api/download?sessionId=<id> - zips temp dir and streams it
 * POST /api/download                - legacy base64 mode (kept for compat)
 */

import fs from "fs";
import path from "path";
import { ZipArchive } from "archiver";
import { getSession, touchSession } from "@/lib/temp-files";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DownloadItem {
  name: string;
  imageDataUrl: string;
  caption?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract image buffer from a data URL. */
function parseDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  return Buffer.from(match[1], "base64");
}

/** Extract file extension (with dot) from filename. */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return ".jpg";
  return filename.slice(lastDot);
}

/**
 * Create a ZIP archive from a temp directory and return as Buffer.
 * Preserves the original file layout (image + .txt pairs).
 */
async function zipDirectory(dirPath: string): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // Pipe to a writable stream adapter that collects chunks
  archive.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });

  // Must resume to start flowing data (ReadableStream starts paused)
  archive.resume();

  const files = fs.readdirSync(dirPath);

  // Group files: for each image, pair it with its .txt caption
  const processed = new Set<string>();

  for (const file of files) {
    if (processed.has(file)) continue;

    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;

    // Place files inside an img/ folder in the ZIP
    archive.append(fs.readFileSync(filePath), { name: `img/${file}` });
    processed.add(file);

    // Look for a matching .txt caption
    const lastDot = file.lastIndexOf(".");
    if (lastDot === -1) continue;

    const base = file.slice(0, lastDot);
    const txtFile = `${base}.txt`;
    const txtPath = path.join(dirPath, txtFile);

    if (fs.existsSync(txtPath) && !processed.has(txtFile)) {
      archive.append(fs.readFileSync(txtPath), { name: `img/${txtFile}` });
      processed.add(txtFile);
    }
  }

  await archive.finalize();

  // Wait for stream to finish
  await new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", (err: Error) => reject(err));
    // Safety timeout - if finalize was so fast that "end" already fired
    setTimeout(resolve, 2000);
  });

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

// ---------------------------------------------------------------------------
// GET - Zip and stream temp directory for a session
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json(
      { error: "sessionId query parameter is required" },
      { status: 400 }
    );
  }

  const meta = getSession(sessionId);
  if (!meta) {
    return Response.json(
      { error: "Session not found or expired" },
      { status: 404 }
    );
  }

  // Touch to extend session life
  touchSession(sessionId);

  const files = fs.readdirSync(meta.dir);
  if (files.length === 0) {
    return Response.json(
      { error: "Session directory is empty" },
      { status: 404 }
    );
  }

  try {
    const zipBuffer = await zipDirectory(meta.dir);

    return new Response(zipBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${sessionId}.zip"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to create ZIP: ${message}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST - Legacy mode: create ZIP from base64 data URLs (kept for compat)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const body = await request.json();
  const { items } = body as { items: DownloadItem[] };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return Response.json(
      { error: "items array is required and must not be empty" },
      { status: 400 }
    );
  }

  const chunks: Uint8Array[] = [];
  const archive = new ZipArchive({ zlib: { level: 6 } });

  archive.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });

  // Resume to start flowing data
  archive.resume();

  for (const item of items) {
    const uuid = crypto.randomUUID();
    const ext = getExtension(item.name);
    const imageBuffer = parseDataUrl(item.imageDataUrl);

    archive.append(imageBuffer, { name: `img/${uuid}${ext}` });

    if (item.caption && item.caption.trim()) {
      archive.append(item.caption.trim(), { name: `img/${uuid}.txt` });
    }
  }

  await archive.finalize();

  await new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", (err: Error) => reject(err));
    setTimeout(resolve, 2000);
  });

  const zipBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const uuid = crypto.randomUUID();

  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${uuid}.zip"`,
    },
  });
}
