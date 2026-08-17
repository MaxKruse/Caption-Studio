/**
 * Proxy endpoint to fetch available models from the configured OpenAI-compatible server.
 * GET /api/models?serverUrl=<url>
 */

import { NextRequest } from "next/server";

import type { ModelInfo } from "@/lib/types";
import { fetchModels, parseParallelArgs } from "@/lib/model-utils";
import { RateLimiter } from "@/lib/rate-limiter";

// Allow 10 requests per minute per IP for model discovery
const modelRateLimiter = new RateLimiter(10, 60_000);

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!modelRateLimiter.check(ip)) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const serverUrl = searchParams.get("serverUrl");

  if (!serverUrl) {
    return Response.json(
      { error: "Missing serverUrl query parameter" },
      { status: 400 }
    );
  }

  // 15s budget: this is a user-initiated discovery call, not background
  const result = await fetchModels(serverUrl, 15_000);

  if (!result.ok) {
    if (result.kind === "http") {
      // Server answered with an error status: pass it through
      return Response.json({ error: result.error }, { status: result.status });
    }
    // Network failure or malformed 2xx body
    const prefix = result.kind === "network" ? "Failed to connect to server: " : "";
    return Response.json({ error: `${prefix}${result.error}` }, { status: 502 });
  }

  // Attach the --parallel value from status.args to each model
  const modelsWithParallel: ModelInfo[] = result.models.map((m) => ({
    id: m.id as string,
    owned_by: m.owned_by as string | undefined,
    parallel: parseParallelArgs(
      (m.status as Record<string, unknown> | undefined)?.args
    ),
    architecture: m.architecture as ModelInfo["architecture"],
    input_modalities: m.input_modalities as string[] | undefined,
  }));

    // Filter to vision models only (input_modalities must contain both "text" and "image")
    // This metadata is provided by llama.cpp servers. If no models match (e.g. vllm, other
    // OpenAI-compatible servers), return all models and trust the user to pick correctly.
    const visionModels = modelsWithParallel.filter(
      (m: ModelInfo) =>
        m?.architecture?.input_modalities?.includes("image") &&
        m?.architecture?.input_modalities?.includes("text")
    );

  return Response.json({ models: visionModels.length > 0 ? visionModels : modelsWithParallel });
}
