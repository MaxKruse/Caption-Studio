/**
 * ZIP download endpoint for captioned images.
 * GET  /api/download?sessionId=<id> - zips temp dir and streams it
 * POST /api/download                - legacy base64 mode (kept for compat)
 */

import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import { ZipArchive } from "archiver";
import { getSession, touchSession } from "@/lib/temp-files";
import { baseAndExt } from "@/lib/string-utils";

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

/**
 * Create a streaming ZIP archive from a temp directory.
 * Returns a Node.js Readable stream that can be piped to HTTP response.
 * Preserves the original file layout (image + .txt pairs).
 */
function streamDirectory(dirPath: string): NodeJS.ReadableStream {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  const files = fs.readdirSync(dirPath);
  const processed = new Set<string>();

  for (const file of files) {
    if (processed.has(file)) continue;

    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;

    // Stream file instead of buffering entire file into memory
    archive.append(fs.createReadStream(filePath), { name: `img/${file}`, stats: stat });
    processed.add(file);

    const { base, ext } = baseAndExt(file);
    if (ext === "") continue;

    const txtFile = `${base}.txt`;
    const txtPath = path.join(dirPath, txtFile);

    if (fs.existsSync(txtPath) && !processed.has(txtFile)) {
      const txtStat = fs.statSync(txtPath);
      archive.append(fs.createReadStream(txtPath), { name: `img/${txtFile}`, stats: txtStat });
      processed.add(txtFile);
    }
  }

  archive.finalize();
  return passThrough;
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
    const zipStream = streamDirectory(meta.dir);

    // Convert Node.js stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        zipStream.on("data", (chunk) => controller.enqueue(chunk));
        zipStream.on("end", () => controller.close());
        zipStream.on("error", (err) => controller.error(err));
      },
    });

    return new Response(webStream, {
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
    const ext = baseAndExt(item.name).ext || ".jpg";
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
