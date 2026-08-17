// ---------------------------------------------------------------------------
// Model capability helpers
// ---------------------------------------------------------------------------

import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";

/**
 * Default budget for --parallel discovery (ms). Discovery is an
 * optimization: if the server can't answer quickly, callers should fall
 * back to MAX_CONCURRENCY rather than delay captioning startup.
 */
export const MODEL_DISCOVERY_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Shared /v1/models primitive
// ---------------------------------------------------------------------------

export type ModelsFetchResult =
  | { ok: true; models: Array<Record<string, unknown>> }
  | {
      ok: false;
      /** http = server answered non-2xx, network = no response, malformed = 2xx with bad shape. */
      kind: "http" | "network" | "malformed";
      error: string;
      /** Present for kind "http". */
      status?: number;
    };

/**
 * Fetch /v1/models from a llama.cpp server.
 *
 * Translates localhost → host.docker.internal for server-side calls from
 * Docker, normalizes the URL, and applies a timeout. Returns the parsed
 * model list, or a structured error (HTTP status, malformed shape, or
 * network failure) - never throws.
 */
export async function fetchModels(
  serverUrl: string,
  timeoutMs: number = MODEL_DISCOVERY_TIMEOUT_MS
): Promise<ModelsFetchResult> {
  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(serverUrl));

  let response: Response;
  try {
    response = await fetch(`${normalizedUrl}/v1/models`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      kind: "network",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      kind: "http",
      status: response.status,
      error: `Server responded with ${response.status}: ${errorBody}`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, kind: "malformed", error: "Unexpected response format from server" };
  }

  const list = (data as { data?: unknown })?.data;
  if (!Array.isArray(list)) {
    return { ok: false, kind: "malformed", error: "Unexpected response format from server" };
  }

  return { ok: true, models: list as Array<Record<string, unknown>> };
}

/**
 * Extract the --parallel value from a llama.cpp status.args list.
 * Returns undefined when the flag is missing or unparsable.
 */
export function parseParallelArgs(args: unknown): number | undefined {
  if (!Array.isArray(args)) return undefined;
  const idx = args.indexOf("--parallel");
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  const parsed = parseInt(String(args[idx + 1]), 10);
  return isNaN(parsed) || parsed < 1 ? undefined : parsed;
}

/**
 * Fetch the `--parallel` value for a specific model from the llama.cpp server.
 * Returns undefined if the server doesn't support it, is slow to answer
 * (slower than timeoutMs), or the model isn't found.
 */
export async function getModelParallel(
  serverUrl: string,
  modelId: string,
  timeoutMs: number = MODEL_DISCOVERY_TIMEOUT_MS
): Promise<number | undefined> {
  const result = await fetchModels(serverUrl, timeoutMs);
  if (!result.ok) return undefined;

  const model = result.models.find((m) => m.id === modelId);
  if (!model) return undefined;

  const status = model.status as Record<string, unknown> | undefined;
  return parseParallelArgs(status?.args);
}
