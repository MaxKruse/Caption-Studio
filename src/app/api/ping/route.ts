/**
 * Lightweight ping endpoint to check if an OpenAI-compatible server is reachable.
 * GET /api/ping?serverUrl=<url>
 *
 * Returns 200 with { ok: true } if the server responds to /v1/models.
 * Returns 502 with { ok: false, error: "..." } if unreachable.
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl } from "@/lib/url-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serverUrl = searchParams.get("serverUrl");

  if (!serverUrl) {
    return Response.json(
      { ok: false, error: "Missing serverUrl query parameter" },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeServerUrl(serverUrl);

  try {
    const response = await fetch(`${normalizedUrl}/v1/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000), // 3s timeout for ping
    });

    if (!response.ok) {
      return Response.json(
        { ok: false, error: `Server responded with ${response.status}` },
        { status: 502 }
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: "Server not reachable" },
      { status: 502 }
    );
  }
}
