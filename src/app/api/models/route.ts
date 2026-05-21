/**
 * Proxy endpoint to fetch available models from the configured OpenAI-compatible server.
 * GET /api/models?serverUrl=<url>
 */

import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serverUrl = searchParams.get("serverUrl");

  if (!serverUrl) {
    return Response.json(
      { error: "Missing serverUrl query parameter" },
      { status: 400 }
    );
  }

  // Normalize URL - strip trailing slash and /v1 suffix
  const normalizedUrl = serverUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

  try {
    const response = await fetch(`${normalizedUrl}/v1/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // Do not cache model lists
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return Response.json(
        {
          error: `Server responded with ${response.status}: ${errorBody}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // OpenAI-compatible response: { data: [{ id, ... }, ...] }
    if (!data || !Array.isArray(data.data)) {
      return Response.json(
        { error: "Unexpected response format from server" },
        { status: 502 }
      );
    }

    // Return just the model list
    return Response.json({ models: data.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to connect to server: ${message}` },
      { status: 502 }
    );
  }
}
