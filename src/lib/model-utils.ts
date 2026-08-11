// ---------------------------------------------------------------------------
// Model capability helpers
// ---------------------------------------------------------------------------

import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";

/**
 * Fetch the `--parallel` value for a specific model from the llama.cpp server.
 * Returns undefined if the server doesn't support it or the model isn't found.
 */
export async function getModelParallel(
  serverUrl: string,
  modelId: string
): Promise<number | undefined> {
  // Translate localhost → host.docker.internal for server-side calls from Docker
  const dockerUrl = toDockerHostUrl(serverUrl);
  const normalizedUrl = normalizeServerUrl(dockerUrl);

  try {
    const response = await fetch(`${normalizedUrl}/v1/models`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000), // 15s timeout for model discovery
    });

    if (!response.ok) return undefined;

    const data = await response.json();
    if (!data?.data || !Array.isArray(data.data)) return undefined;

    const model = data.data.find((m: Record<string, unknown>) => m.id === modelId);
    if (!model) return undefined;

    const args = model.status?.args;
    if (!Array.isArray(args)) return undefined;

    const idx = args.indexOf("--parallel");
    if (idx < 0 || idx + 1 >= args.length) return undefined;

    const parsed = parseInt(args[idx + 1], 10);
    return isNaN(parsed) || parsed < 1 ? undefined : parsed;
  } catch {
    return undefined;
  }
}
