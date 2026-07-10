/**
 * Simple mode caption endpoint.
 * Processes one image at a time with a single system + user prompt.
 * POST /api/caption/simple - starts processing and returns SSE stream
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl } from "@/lib/url-utils";
import { prepareForApi } from "@/lib/image-utils";

/** Replace variable placeholders in prompt text. */
function replaceVariables(
  text: string,
  imageName: string,
  index: number,
  total: number
): string {
  return text
    .replace(/{trigger}/g, "") // trigger word not used in guided mode yet
    .replace(/{image_name}/g, imageName)
    .replace(/{index}/g, String(index + 1))
    .replace(/{total}/g, String(total));
}

/** Extract image buffer and mime type from a data URL. */
function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  return {
    buffer: Buffer.from(match[2], "base64"),
    mimeType: match[1],
  };
}

/** Max time allowed per API call. */
const API_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    serverUrl,
    model,
    systemPrompt,
    userPrompt,
    images, // Array of { imageDataUrl, imageName }
  } = body as {
    serverUrl: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    images: Array<{ imageDataUrl: string; imageName: string }>;
  };

  if (!serverUrl || !model || !images || images.length === 0) {
    return Response.json(
      { error: "serverUrl, model, and images are required" },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeServerUrl(serverUrl);
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined = undefined;

  const sendEvent = (type: string, data: unknown) => {
    if (controller) {
      const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(line));
    }
  };

  const closeStream = () => {
    if (controller) controller.close();
  };

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  // Process images sequentially
  (async () => {
    try {
      for (let i = 0; i < images.length; i++) {
        const { imageDataUrl, imageName } = images[i];

        sendEvent("image_start", { index: i, name: imageName });

        try {
          const { buffer: rawBuffer } = parseDataUrl(imageDataUrl);
          const { buffer: apiBuffer, mimeType } = await prepareForApi(
            imageName,
            rawBuffer
          );
          const base64 = apiBuffer.toString("base64");

          const resolvedPrompt = replaceVariables(
            userPrompt,
            imageName,
            i,
            images.length
          );

          // Message order: system -> user (image + text)
          const messages: Array<Record<string, unknown>> = [];

          if (systemPrompt.trim()) {
            messages.push({ role: "system", content: systemPrompt.trim() });
          }

          messages.push({
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              { type: "text", text: resolvedPrompt },
            ],
          });

          const response = await fetchWithTimeout(
            `${normalizedUrl}/v1/chat/completions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                messages,
                stream: true,
                stream_options: { include_usage: true },
              }),
              cache: "no-store",
            },
            API_TIMEOUT_MS
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API ${response.status}: ${errorText}`);
          }

          let caption = "";
          let reasoningContent = "";
          const body = response.body;
          if (!body) throw new Error("No response body");

          const reader = body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() ?? "";

            for (const line of lines) {
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
                    index: i,
                    content: delta.reasoning_content,
                    full: reasoningContent,
                  });
                }
                if (delta?.content) {
                  caption += delta.content;
                  sendEvent("token", {
                    type: "caption",
                    index: i,
                    content: delta.content,
                    full: caption,
                  });
                }
              } catch {
                // skip malformed
              }
            }
          }

          sendEvent("image_complete", {
            index: i,
            name: imageName,
            status: "completed",
            caption: caption.trim(),
            reasoningContent: reasoningContent.trim(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendEvent("image_complete", {
            index: i,
            name: imageName,
            status: "failed",
            error: message,
          });
        }
      }

      sendEvent("done", { allComplete: true });
      closeStream();
    } catch (error) {
      sendEvent("error", { error: String(error) });
      closeStream();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
