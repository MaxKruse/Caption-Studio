/**
 * Multi-step mode caption endpoint.
 * For each image: chains multiple API calls, appending context from each step.
 * Different images are processed in parallel.
 * POST /api/caption/multi-step - starts processing and returns SSE stream
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";
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
  total: number,
  triggerWord: string
): string {
  return text
    .replace(/{trigger}/g, triggerWord)
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
const MAX_CONCURRENCY = 8;

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
 * Respects abortSignal - returns early if aborted.
 */
async function callApiWithStream(
  baseUrl: string,
  model: string,
  messages: Array<Record<string, unknown>>,
  onToken: (type: "caption" | "reasoning", delta: string, full: string) => void,
  abortSignal: AbortSignal
): Promise<{ content: string; reasoningContent: string; aborted: boolean }> {
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
    if (abortSignal.aborted) {
      reader.cancel();
      return { content: "", reasoningContent: "", aborted: true };
    }

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

  return { content, reasoningContent, aborted: false };
}

/**
 * Process a single image through all its multi-step chain.
 */
async function processImageMultiStep(
  imgIdx: number,
  imageDataUrl: string,
  imageName: string,
  normalizedUrl: string,
  model: string,
  systemPrompt: string,
  userMessages: string[],
  triggerWord: string,
  total: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: imgIdx, name: imageName });

  try {
    const { buffer: rawBuffer } = parseDataUrl(imageDataUrl);
    const { buffer: apiBuffer, mimeType } = await prepareForApi(imageName, rawBuffer);
    const base64 = apiBuffer.toString("base64");

    // Build conversation history for this image
    const messages: Array<Record<string, unknown>> = [];

    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }

    const firstUserMsg = replaceVariables(
      userMessages[0],
      imageName,
      imgIdx,
      total,
      triggerWord
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

    // Process each step in the chain (sequential within one image)
    for (let stepIdx = 0; stepIdx < userMessages.length; stepIdx++) {
      if (abortSignal.aborted) return;

      sendEvent("step_start", {
        imageIndex: imgIdx,
        stepIndex: stepIdx,
        totalSteps: userMessages.length,
      });

      const { content, reasoningContent, aborted } = await callApiWithStream(
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
        },
        abortSignal
      );

      if (aborted) return;

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
          total,
          triggerWord
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

    if (!abortSignal.aborted) {
      sendEvent("image_complete", {
        index: imgIdx,
        name: imageName,
        status: "completed",
        caption: finalCaption.trim(),
        reasoningContent: finalReasoning.trim(),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!abortSignal.aborted) {
      sendEvent("image_complete", {
        index: imgIdx,
        name: imageName,
        status: "failed",
        error: message,
      });
    }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    serverUrl,
    model,
    systemPrompt,
    userMessages,
    triggerWordPerson,
    triggerWordOther,
    images,
  } = body as MultiStepCaptionRequest & {
    triggerWordPerson?: string;
    triggerWordOther?: string;
  };

  // Build combined trigger word string
  const triggerParts = [triggerWordPerson, triggerWordOther].filter((p) => p?.trim());
  const triggerWord = triggerParts.length > 0 ? `${triggerParts.join(" ")} - ` : "";

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

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(serverUrl));
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

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

  // Use the request's abort signal to detect client disconnects
  const abortSignal = request.signal;

  // Process images in parallel with concurrency limit
  (async () => {
    try {
      const concurrency = Math.min(MAX_CONCURRENCY, images.length);
      const queue = images.map((img, i) => ({ ...img, index: i }));

      async function processNext(): Promise<void> {
        while (queue.length > 0 && !abortSignal.aborted) {
          const item = queue.shift()!;

          await processImageMultiStep(
            item.index,
            item.imageDataUrl,
            item.imageName,
            normalizedUrl,
            model,
            systemPrompt,
            userMessages,
            triggerWord,
            images.length,
            sendEvent,
            abortSignal
          );
        }
      }

      // Launch worker pool
      const workers = Array.from(
        { length: concurrency },
        () => processNext()
      );

      await Promise.all(workers);

      if (!abortSignal.aborted) {
        sendEvent("done", { allComplete: true });
      }
      closeStream();
    } catch (error) {
      if (!abortSignal.aborted) {
        sendEvent("error", { error: String(error) });
      }
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
