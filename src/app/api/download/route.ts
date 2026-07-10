/**
 * ZIP download endpoint for LoRA training datasets.
 * Produces a flat `img/` folder with <uuid>.<ext> + <uuid>.txt pairs.
 * POST /api/download
 */

import { ZipArchive } from "archiver";

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

// ---------------------------------------------------------------------------
// POST - Create and return a ZIP file
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

  // Collect chunks from the streaming archive
  const chunks: Uint8Array[] = [];
  const archive = new ZipArchive({ zlib: { level: 6 } });

  archive.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });

  // Add each image + caption pair as <uuid>.<ext> + <uuid>.txt inside img/
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

  // Wait for all data to flush
  await new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", (err: Error) => reject(err));
  });

  // Concatenate chunks into a single Buffer
  const zipBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));


  const uuid = crypto.randomUUID();

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${uuid}.zip"`,
    },
  });
}
