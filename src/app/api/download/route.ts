/**
 * ZIP export endpoint - packages all images with their caption text files.
 * POST /api/download
 */

import archiver from "archiver";
import { getJob, deleteJob } from "@/lib/store";

// ---------------------------------------------------------------------------
// Filename collision resolver — shared by single and multi-job downloads
// ---------------------------------------------------------------------------

/**
 * Resolve filename collisions within a set of images.
 * Returns a map of original filename -> { imageFile, captionFile }.
 */
function resolveFilenameCollisions(filenames: string[]): Map<string, { imageFile: string; captionFile: string }> {
  // Build basename -> count map
  const basenameCounts = new Map<string, number>();
  for (const filename of filenames) {
    const base = filename.replace(/\.[^.]+$/, "");
    basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
  }

  const resolved = new Map<string, { imageFile: string; captionFile: string }>();
  const usedCaptionNames = new Set<string>();
  const basenameIndex = new Map<string, number>();

  for (const filename of filenames) {
    const base = filename.replace(/\.[^.]+$/, "");
    const ext = filename.replace(/.*\./, "");
    const count = basenameCounts.get(base) ?? 1;
    const idx = basenameIndex.get(base) ?? 0;
    basenameIndex.set(base, idx + 1);

    let imageFile = filename;
    let captionFile = `${base}.txt`;
    if (count > 1 && idx > 0) {
      imageFile = `${base} (${idx}).${ext}`;
      captionFile = `${base} (${idx}).txt`;
    }

    let safetyIdx = idx + 1;
    while (usedCaptionNames.has(captionFile)) {
      imageFile = `${base} (${safetyIdx}).${ext}`;
      captionFile = `${base} (${safetyIdx}).txt`;
      safetyIdx++;
    }
    usedCaptionNames.add(captionFile);

    resolved.set(filename, { imageFile, captionFile });
  }

  return resolved;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { jobId, jobIds } = body;

  // Multi-job mode (multi-preset captioning)
  if (Array.isArray(jobIds)) {
    return handleMultiJobDownload(jobIds);
  }

  // Single-job mode (existing behavior)
  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return handleSingleJobDownload(job);
}

// ---------------------------------------------------------------------------
// Single-job download (existing behavior)
// ---------------------------------------------------------------------------

async function handleSingleJobDownload(job: ReturnType<typeof getJob>) {
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const archive = createArchive();
  const resolved = resolveFilenameCollisions(Array.from(job.images.keys()));

  for (const [filename, entry] of job.images.entries()) {
    const { imageFile, captionFile } = resolved.get(filename) ?? { imageFile: filename, captionFile: `${filename.replace(/\.[^.]+$/, "")}.txt` };
    archive.append(entry.data, { name: imageFile });
    const captionContent = entry.caption ?? "(caption failed)";
    archive.append(captionContent, { name: captionFile });
  }

  await archive.finalize();
  await archive.done;
  deleteJob(job.id);

  const buffer = Buffer.concat(archive.chunks);
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

// ---------------------------------------------------------------------------
// Multi-job download (multi-preset captioning)
// ---------------------------------------------------------------------------

async function handleMultiJobDownload(jobIds: string[]) {
  if (jobIds.length === 0) {
    return Response.json({ error: "Missing jobIds — no jobs provided" }, { status: 400 });
  }

  // Validate all jobs exist
  const jobs = jobIds.map((id) => getJob(id)).filter(Boolean) as NonNullable<ReturnType<typeof getJob>>[];
  if (jobs.length !== jobIds.length) {
    return Response.json({ error: "One or more jobs not found" }, { status: 404 });
  }

  const archive = createArchive();

  // Each preset gets its own folder in the ZIP
  for (const job of jobs) {
    const presetFolder = job.presetName.trim() || "Captions";
    const resolved = resolveFilenameCollisions(Array.from(job.images.keys()));

    for (const [filename, entry] of job.images.entries()) {
      const { imageFile, captionFile } = resolved.get(filename) ?? { imageFile: filename, captionFile: `${filename.replace(/\.[^.]+$/, "")}.txt` };
      archive.append(entry.data, { name: `${presetFolder}/${imageFile}` });
      const captionContent = entry.caption ?? "(caption failed)";
      archive.append(captionContent, { name: `${presetFolder}/${captionFile}` });
    }
  }

  await archive.finalize();
  await archive.done;

  // Delete all jobs
  for (const jobId of jobIds) {
    deleteJob(jobId);
  }

  const buffer = Buffer.concat(archive.chunks);
  const safeName = jobs[0]?.triggerWord.trim() || "Untitled";
  const filename = `AllPresets_${safeName}.zip`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Archive factory — creates archiver instance with accumulated chunks
// ---------------------------------------------------------------------------

function createArchive() {
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

  return {
    append: archive.append.bind(archive),
    finalize: archive.finalize.bind(archive),
    done: archiveDone,
    chunks,
  };
}
