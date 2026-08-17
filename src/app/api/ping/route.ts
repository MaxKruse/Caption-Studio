/**
 * Lightweight ping endpoint to check if an OpenAI-compatible server is reachable.
 * GET /api/ping?serverUrl=<url>
 *
 * Returns 200 with { ok: true } if the server responds to /v1/models.
 * Returns 502 with { ok: false, error: "..." } if unreachable.
 */

import { NextRequest } from "next/server";
import { fetchModels } from "@/lib/model-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serverUrl = searchParams.get("serverUrl");

  if (!serverUrl) {
    return Response.json(
      { ok: false, error: "Missing serverUrl query parameter" },
      { status: 400 }
    );
  }

  // 15s budget: same as the models discovery call
  const result = await fetchModels(serverUrl, 15_000);

  if (result.ok) {
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: result.error }, { status: 502 });
}
