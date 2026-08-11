/**
 * Shared caption helper utilities extracted from route files.
 * Provides common file reading, fetch with timeout, and SSE streaming logic.
 */

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

/**
 * Extract image buffer from a File object.
 */
export async function readFileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Fetch utilities
// ---------------------------------------------------------------------------

/**
 * Fetch with timeout + external abort signal support.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

/**
 * Stream an API response and emit SSE token events.
 * Returns the full caption and reasoning content on completion.
 */
export async function streamResponse(
  response: Response,
  phase: string,
  index: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<{ caption: string; reasoningContent: string } | null> {
  let caption = "";
  let reasoningContent = "";
  const body = response.body;
  if (!body) throw new Error("No response body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  while (true) {
    if (abortSignal.aborted) {
      reader.cancel();
      return null;
    }

    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (abortSignal.aborted) {
        reader.cancel();
        return null;
      }

      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") continue;

      try {
        const chunk = JSON.parse(dataStr);
        const delta = chunk?.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          sendEvent("token", {
            type: "reasoning",
            phase,
            index,
            content: delta.reasoning_content,
            full: reasoningContent,
          });
        }
        if (delta?.content) {
          caption += delta.content;
          sendEvent("token", {
            type: "caption",
            phase,
            index,
            content: delta.content,
            full: caption,
          });
        }
      } catch {
        // skip malformed
      }
    }
  }

  return { caption: caption.trim(), reasoningContent: reasoningContent.trim() };
}
