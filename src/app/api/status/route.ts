/**
 * GET /api/status?jobId=<id> - Returns current status of all images in a job.
 */

import { NextRequest } from "next/server";
import { buildStatusMap, getJob } from "@/lib/store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const statuses = buildStatusMap(job);

  return Response.json({ statuses });
}
