/**
 * URL normalization utilities for OpenAI-compatible server endpoints.
 */

/**
 * Strips trailing slashes and the `/v1` suffix from a server URL.
 * E.g. "http://localhost:8080/v1/" → "http://localhost:8080"
 */
export function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "");
}
