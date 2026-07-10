/**
 * Proxy endpoint to fetch available models from the configured OpenAI-compatible server.
 * GET /api/models?serverUrl=<url>
 */

import { NextRequest } from "next/server";

import type { ModelInfo } from "@/lib/types";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serverUrl = searchParams.get("serverUrl");

  if (!serverUrl) {
    return Response.json(
      { error: "Missing serverUrl query parameter" },
      { status: 400 }
    );
  }

  // Translate localhost → host.docker.internal for server-side calls from Docker
  const dockerUrl = toDockerHostUrl(serverUrl);
  // Normalize URL - strip trailing slash and /v1 suffix
  const normalizedUrl = normalizeServerUrl(dockerUrl);

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

    // Extract --parallel value from status.args and attach to each model
    const modelsWithParallel: ModelInfo[] = data.data.map((m: Record<string, unknown>) => {
      const status = m.status as Record<string, unknown> | undefined;
      const args = status?.args;
      let parallel: number | undefined;
      if (Array.isArray(args)) {
        const idx = args.indexOf("--parallel");
        if (idx >= 0 && idx + 1 < args.length) {
          const parsed = parseInt(args[idx + 1], 10);
          if (!isNaN(parsed) && parsed > 0) {
            parallel = parsed;
          }
        }
      }

      return {
        id: m.id as string,
        owned_by: m.owned_by as string | undefined,
        parallel,
        architecture: m.architecture as ModelInfo["architecture"],
        input_modalities: m.input_modalities as string[] | undefined,
      };
    });

    // Filter to vision models only (input_modalities must contain both "text" and "image")
    // This metadata is provided by llama.cpp servers. If no models match (e.g. vllm, other
    // OpenAI-compatible servers), return all models and trust the user to pick correctly.
    const visionModels = modelsWithParallel.filter(
      (m: ModelInfo) =>
        m?.architecture?.input_modalities?.includes("image") &&
        m?.architecture?.input_modalities?.includes("text")
    );

    return Response.json({ models: visionModels.length > 0 ? visionModels : modelsWithParallel });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to connect to server: ${message}` },
      { status: 502 }
    );
  }
}
