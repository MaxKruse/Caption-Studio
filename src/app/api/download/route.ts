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

  // Add each image and its caption to the zip
  for (const [filename, entry] of job.images.entries()) {
    // Add the original image
    archive.append(entry.data, { name: filename });

    // Add caption text file (same name, .txt extension)
    const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
    const captionFile = `${nameWithoutExt}.txt`;
    const captionContent = entry.caption ?? "(caption failed)";
    archive.append(captionContent, { name: captionFile });
  }

  await archive.finalize();
  await archiveDone;

  // Cleanup job from memory after download
  deleteJob(jobId);

  const buffer = Buffer.concat(chunks);

  const safeName = job.captionName.trim() || "Untitled";
  const filename = `Captions${safeName}.zip`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
