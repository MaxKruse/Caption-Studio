/**
 * Shared SSE stream factory for caption routes.
 *
 * Returns a tuple of [stream, sendEvent, closeStream] with consistent
 * formatting. Emits a periodic SSE comment (": keepalive") so runtimes
 * and proxies do not drop the connection while the stream is idle
 * (e.g. during image prefill or Krea-2 phase transitions, when no
 * tokens are produced for a long time).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default keepalive interval. Must stay well under BUN_CONFIG_HTTP_IDLE_TIMEOUT. */
const DEFAULT_KEEPALIVE_MS = 15_000;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SseStreamOptions {
  /**
   * Keepalive interval in milliseconds. A ": keepalive" SSE comment is
   * enqueued every interval so idle connections are not dropped.
   * Set to 0 to disable. Defaults to 15000.
   */
  keepaliveMs?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an SSE ReadableStream with helpers to send events and close.
 *
 * @param options Optional keepalive configuration (see SseStreamOptions).
 * @returns [stream, sendEvent, closeStream]
 */
export function createSseStream(
  options: SseStreamOptions = {}
): [
  ReadableStream<Uint8Array>,
  (type: string, data: unknown) => void,
  () => void,
] {
  const encoder = new TextEncoder();
  const keepaliveMs = options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  let keepaliveInterval: ReturnType<typeof setInterval> | undefined;

  const sendRaw = (line: string): void => {
    if (controller && !closed) {
      try {
        controller.enqueue(encoder.encode(line));
      } catch {
        // Controller already closed - treat as closed
        closed = true;
      }
    }
  };

  const sendEvent = (type: string, data: unknown): void => {
    sendRaw(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const stopKeepalive = (): void => {
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = undefined;
    }
  };

  const closeStream = (): void => {
    stopKeepalive();
    if (controller && !closed) {
      try {
        controller.close();
      } catch {
        // Already closed - idempotent no-op
      }
      closed = true;
    }
  };

  const stream = new ReadableStream({
    start(c) {
      controller = c;
      if (keepaliveMs > 0) {
        keepaliveInterval = setInterval(() => {
          sendRaw(": keepalive\n\n");
        }, keepaliveMs);
        // Do not let the keepalive timer keep the process alive
        (keepaliveInterval as { unref?: () => void }).unref?.();
      }
    },
    cancel() {
      // Consumer went away (client disconnect) - stop the timer
      stopKeepalive();
      closed = true;
    },
  });

  return [stream, sendEvent, closeStream];
}
