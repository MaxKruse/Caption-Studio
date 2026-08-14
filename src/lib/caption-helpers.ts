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
 * Uses AbortSignal.timeout where available.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();

  const onAbort = () => controller.abort();
  timeoutSignal.addEventListener("abort", onAbort, { once: true });
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  // Immediate abort if already aborted
  if (timeoutSignal.aborted || externalSignal?.aborted) {
    controller.abort();
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    timeoutSignal.removeEventListener("abort", onAbort);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Fetch with exponential backoff retry for 5xx and 429 responses.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw new Error("Aborted");
    }

    try {
      const response = await fetchWithTimeout(url, options, timeoutMs, externalSignal);
      // Retry on 429 or 5xx
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt === maxRetries) {
          throw new Error(`HTTP ${response.status} after ${maxRetries + 1} attempts`);
        }
        // Wait with exponential backoff
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

/**
 * Stream an API response and emit SSE token events (deltas only).
 * Returns the full caption, reasoning content, and the prompt-token
 * stats from the final usage chunk (total prompt tokens and how many
 * llama.cpp reused from its KV cache).
 */
export async function streamResponse(
  response: Response,
  phase: string,
  index: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<{
  caption: string;
  reasoningContent: string;
  cachedTokens: number;
  promptTokens: number;
} | null> {
  let caption = "";
  let reasoningContent = "";
  let cachedTokens = 0;
  let promptTokens = 0;
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
          });
        }
        if (delta?.content) {
          caption += delta.content;
          sendEvent("token", {
            type: "caption",
            phase,
            index,
            content: delta.content,
          });
        }
        // Final chunk (stream_options.include_usage) or non-streaming bodies
        // report how many prompt tokens came from the KV cache.
        const usage = chunk?.usage;
        if (usage?.prompt_tokens_details?.cached_tokens !== undefined) {
          cachedTokens = usage.prompt_tokens_details.cached_tokens;
        } else if (chunk?.timings?.cache_n !== undefined) {
          cachedTokens = chunk.timings.cache_n;
        }
        if (typeof usage?.prompt_tokens === "number") {
          promptTokens = usage.prompt_tokens;
        }
      } catch {
        // skip malformed
      }
    }
  }

  return {
    caption: caption.trim(),
    reasoningContent: reasoningContent.trim(),
    cachedTokens,
    promptTokens,
  };
}
