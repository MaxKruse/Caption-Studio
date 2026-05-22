/**
 * Proxy endpoint to fetch available models from the configured OpenAI-compatible server.
 * GET /api/models?serverUrl=<url>
 */

import { NextRequest } from "next/server";

import type { ModelInfo } from "@/components/CaptionStudioTypes";
import { normalizeServerUrl } from "@/lib/url-utils";

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
  const normalizedUrl = normalizeServerUrl(serverUrl);

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

    // Filter to vision models only (input_modalities must contain both "text" and "image")
    // This metadata is provided by llama.cpp servers. If no models match (e.g. vllm, other
    // OpenAI-compatible servers), return all models and trust the user to pick correctly.
    const visionModels = data.data.filter(
      (m: ModelInfo) =>
        m?.architecture?.input_modalities?.includes("image") &&
        m?.architecture?.input_modalities?.includes("text")
    );

    return Response.json({ models: visionModels.length > 0 ? visionModels : data.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to connect to server: ${message}` },
      { status: 502 }
    );
  }
}
