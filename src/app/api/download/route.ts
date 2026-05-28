/**
 * ZIP export endpoint - packages all images with their caption text files.
 * POST /api/download
 */

import archiver from "archiver";
import { getJob, deleteJob } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const { jobId } = body;

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // Create a stream that we'll pipe archiver output into
  const chunks: Buffer[] = [];
  let archiveResolve: () => void;
  const archiveDone = new Promise<void>((resolve) => {
    archiveResolve = resolve;
  });

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  archive.on("end", () => {
    archiveResolve();
  });

  archive.on("error", (err: Error) => {
    console.error("Archive error:", err);
  });

  // Build a map of basename -> count to detect caption filename collisions.
  // e.g. "1.png" and "1.jpg" both want "1.txt" → second becomes "1 (1).txt".
  const basenameCounts = new Map<string, number>();
  for (const filename of job.images.keys()) {
    const base = filename.replace(/\.[^.]+$/, "");
    basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
  }

  // Track which caption names we've already used (in case a count-suffixed
  // name collides with another entry's plain caption name).
  const usedCaptionNames = new Set<string>();

  // Running index per basename so we assign unique suffixes.
  const basenameIndex = new Map<string, number>();

  // Add each image and its caption to the zip
  // Images are already cropped at job creation time
  for (const [filename, entry] of job.images.entries()) {
    const base = filename.replace(/\.[^.]+$/, "");
    const ext = filename.replace(/.*\./, "");
    const count = basenameCounts.get(base) ?? 1;
    const idx = basenameIndex.get(base) ?? 0;
    basenameIndex.set(base, idx + 1);

    // When multiple images share the same base name (e.g. "1.png" + "1.jpg"),
    // suffix both the image and its caption so they stay paired.
    // First occurrence keeps the original name; subsequent ones get (1), (2), etc.
    let imageFile = filename;
    let captionFile = `${base}.txt`;
    if (count > 1 && idx > 0) {
      imageFile = `${base} (${idx}).${ext}`;
      captionFile = `${base} (${idx}).txt`;
    }

    // Safety: if this name somehow collides with an entry that already
    // owns it, keep bumping the suffix.
    let safetyIdx = idx + 1;
    while (usedCaptionNames.has(captionFile)) {
      imageFile = `${base} (${safetyIdx}).${ext}`;
      captionFile = `${base} (${safetyIdx}).txt`;
      safetyIdx++;
    }
    usedCaptionNames.add(captionFile);

    archive.append(entry.data, { name: imageFile });
    const captionContent = entry.caption ?? "(caption failed)";
    archive.append(captionContent, { name: captionFile });
  }

  await archive.finalize();
  await archiveDone;

  // Cleanup job from memory after download
  deleteJob(jobId);

  const buffer = Buffer.concat(chunks);

  const presetName = job.presetName.trim();
  const safeName = job.triggerWord.trim() || "Untitled";
  const filename = presetName
    ? `${presetName}_${safeName}.zip`
    : `Captions.zip`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
