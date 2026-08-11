/**
 * Health check endpoint.
 * GET /api/health
 *
 * Returns service health status including temp directory writability
 * and session cleanup status.
 */

import fs from "fs";
import path from "path";
import { generateRequestId, logStructured } from "@/lib/logger";

const TEMP_BASE = "/tmp/caption-studio";

export async function GET() {
  const requestId = generateRequestId();
  logStructured("info", "health check", { requestId });
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
    requestId,
  };

  logStructured("info", "health response", { requestId, ok: tempDirWritable });
  return Response.json(health, { status: tempDirWritable ? 200 : 503 });
}
