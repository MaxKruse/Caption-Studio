/**
 * Multi-step mode caption endpoint.
 * For each image: chains multiple API calls, appending context from each step.
 * POST /api/caption/multi-step - starts processing and returns SSE stream
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl } from "@/lib/url-utils";
import { prepareForApi } from "@/lib/image-utils";

interface MultiStepCaptionRequest {
  serverUrl: string;
  model: string;
  systemPrompt: string;
  userMessages: string[]; // Chain of user messages
  images: Array<{ imageDataUrl: string; imageName: string }>;
}

/** Replace variable placeholders in prompt text. */
function replaceVariables(
  text: string,
  imageName: string,
  index: number,
  total: number
): string {
  return text
    .replace(/{trigger}/g, "")
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

/**
 * Call the vision API with streaming and accumulate content + reasoning_content.
 */
async function callApiWithStream(
  baseUrl: string,
  model: string,
  messages: Array<Record<string, unknown>>,
  onToken: (type: "caption" | "reasoning", delta: string, full: string) => void
): Promise<{ content: string; reasoningContent: string }> {
  const response = await fetchWithTimeout(
    `${baseUrl}/v1/chat/completions`,
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

  let content = "";
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
          onToken("reasoning", delta.reasoning_content, reasoningContent);
        }
        if (delta?.content) {
          content += delta.content;
          onToken("caption", delta.content, content);
        }
      } catch {
        // skip malformed
      }
    }
  }

  return { content, reasoningContent };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    serverUrl,
    model,
    systemPrompt,
    userMessages,
    images,
  } = body as MultiStepCaptionRequest;

  if (!serverUrl || !model || !images || images.length === 0) {
    return Response.json(
      { error: "serverUrl, model, and images are required" },
      { status: 400 }
    );
  }

  if (!userMessages || userMessages.length === 0) {
    return Response.json(
      { error: "At least one user message is required" },
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
      for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
        const { imageDataUrl, imageName } = images[imgIdx];

        sendEvent("image_start", { index: imgIdx, name: imageName });

        try {
          const { buffer: rawBuffer } = parseDataUrl(imageDataUrl);
          const { buffer: apiBuffer, mimeType } = await prepareForApi(
            imageName,
            rawBuffer
          );
          const base64 = apiBuffer.toString("base64");

          // Build conversation history for this image
          // Message order: system -> user (image + first prompt)
          const messages: Array<Record<string, unknown>> = [];

          if (systemPrompt.trim()) {
            messages.push({ role: "system", content: systemPrompt.trim() });
          }

          const firstUserMsg = replaceVariables(
            userMessages[0],
            imageName,
            imgIdx,
            images.length
          );

          messages.push({
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              { type: "text", text: firstUserMsg },
            ],
          });

          let finalCaption = "";
          let finalReasoning = "";

          // Process each step in the chain
          for (let stepIdx = 0; stepIdx < userMessages.length; stepIdx++) {
            sendEvent("step_start", {
              imageIndex: imgIdx,
              stepIndex: stepIdx,
              totalSteps: userMessages.length,
            });

            const { content, reasoningContent } = await callApiWithStream(
              normalizedUrl,
              model,
              messages,
              (type, delta, full) => {
                sendEvent("token", {
                  imageIndex: imgIdx,
                  stepIndex: stepIdx,
                  type,
                  content: delta,
                  full,
                });
              }
            );

            finalCaption = content;
            finalReasoning = reasoningContent;

            // Append assistant response to conversation
            messages.push({
              role: "assistant",
              content: [
                reasoningContent ? `Thinking: ${reasoningContent}\n\n` : "",
                content,
              ].join(""),
            });

            // If not the last step, append next user message
            if (stepIdx < userMessages.length - 1) {
              const nextUserMsg = replaceVariables(
                userMessages[stepIdx + 1],
                imageName,
                imgIdx,
                images.length
              );
              messages.push({ role: "user", content: nextUserMsg });
            }

            sendEvent("step_complete", {
              imageIndex: imgIdx,
              stepIndex: stepIdx,
              content,
              reasoningContent,
            });
          }

          sendEvent("image_complete", {
            index: imgIdx,
            name: imageName,
            status: "completed",
            caption: finalCaption.trim(),
            reasoningContent: finalReasoning.trim(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendEvent("image_complete", {
            index: imgIdx,
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
