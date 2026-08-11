/**
 * Shared SSE stream factory for caption routes.
 *
 * Returns a tuple of [stream, sendEvent, closeStream] with consistent formatting.
 */

/**
 * Create an SSE ReadableStream with helpers to send events and close.
 *
 * @returns [stream, sendEvent, closeStream]
 */
export function createSseStream(): [
  ReadableStream<Uint8Array>,
  (type: string, data: unknown) => void,
  () => void,
] {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const sendEvent = (type: string, data: unknown) => {
    if (controller) {
      const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(line));
    }
  };

  const closeStream = () => {
    if (controller) {
      try {
        controller.close();
      } catch {
        // Already closed - idempotent no-op
      }
    }
  };

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  return [stream, sendEvent, closeStream];
}
