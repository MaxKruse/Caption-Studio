/**
 * Health check endpoint.
 * GET /api/health
 *
 * Returns service health status including temp directory writability
 * and session cleanup status.
 */

import fs from "fs";
import path from "path";

const TEMP_BASE = "/tmp/caption-studio";

export async function GET() {
  let tempDirWritable = false;
  try {
    if (!fs.existsSync(TEMP_BASE)) {
      fs.mkdirSync(TEMP_BASE, { recursive: true });
    }
    const testFile = path.join(TEMP_BASE, ".health-check");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    tempDirWritable = true;
  } catch {
    tempDirWritable = false;
  }

  // Sessions count is not exposed directly; return placeholder
  const health = {
    ok: tempDirWritable,
    tempDirWritable,
    tempDir: TEMP_BASE,
    sessionsCount: 0,
    cleanupIntervalMs: 5 * 60 * 1000,
    uptime: process.uptime(),
    timestamp: Date.now(),
  };

  return Response.json(health, { status: tempDirWritable ? 200 : 503 });
}
