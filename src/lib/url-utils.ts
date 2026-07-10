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

/**
 * Translates a client-facing server URL to one resolvable from the server's
 * network. When the `DOCKER_HOST_INTERNAL` env var is set (e.g. in Docker),
 * replaces `localhost` or `127.0.0.1` with that hostname so outbound requests
 * reach the host machine. No-op when the env var is not set (local dev).
 */
export function toDockerHostUrl(url: string): string {
  const hostOverride = process.env.DOCKER_HOST_INTERNAL;
  if (!hostOverride) return url;
  return url.replace(
    /^(https?:\/\/)(localhost|127\.0\.0\.1)(?::(\d+))?/,
    `$1${hostOverride}:$3`
  );
}
