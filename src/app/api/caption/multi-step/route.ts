/**
 * Multi-step mode caption endpoint.
 * For each image: chains multiple API calls, appending context from each step.
 * Different images are processed in parallel.
 * Images stored as temp files; captions written as .txt alongside.
 * POST /api/caption/multi-step - accepts FormData, returns SSE stream
 * DELETE /api/caption/multi-step?sessionId=<id> - aborts an active session
 */

import { NextRequest } from "next/server";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";
import { prepareForApi } from "@/lib/image-utils";
import { buildUserPrompt } from "@/lib/prompt-utils";
import {
  createSession,
  saveImage,
  writeCaption,
  touchSession,
} from "@/lib/temp-files";

// ---------------------------------------------------------------------------
// Active session tracking for explicit abort
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, AbortController>();

/** Cleanup stale sessions. */
setInterval(() => {
  for (const [sessionId, ac] of activeSessions.entries()) {
    if (ac.signal.aborted) {
      activeSessions.delete(sessionId);
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageTask {
  index: number;
  serverName: string;
  originalName: string;
  imageBuffer: Buffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace variable placeholders in prompt text. */
function replaceVariables(
  text: string,
  imageName: string,
  index: number,
  total: number
): string {
  return text
    .replace(/{image_name}/g, imageName)
    .replace(/{index}/g, String(index + 1))
    .replace(/{total}/g, String(total));
}

/** Extract image buffer from a File object. */
async function readFileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

const API_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_CONCURRENCY = 8;

/**
 * Fetch with timeout + external abort signal support.
 */
async function fetchWithTimeout(
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
// API call with streaming
// ---------------------------------------------------------------------------

/**
 * Call the vision API with streaming and accumulate content + reasoning_content.
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
    API_TIMEOUT_MS,
    abortSignal
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
      if (abortSignal.aborted) {
        reader.cancel();
        return { content, reasoningContent, aborted: true };
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

// ---------------------------------------------------------------------------
// Multi-step image processing
// ---------------------------------------------------------------------------

/**
 * Process a single image through all its multi-step chain.
 * Writes caption .txt file on completion.
 */
async function processImageMultiStep(
  task: ImageTask,
  sessionId: string,
  normalizedUrl: string,
  model: string,
  systemPrompt: string,
  userMessages: string[],
  triggerWordPerson: string,
  triggerWordOther: string,
  total: number,
  sendEvent: (type: string, data: unknown) => void,
  abortSignal: AbortSignal
): Promise<void> {
  if (abortSignal.aborted) return;

  sendEvent("image_start", { index: task.index, name: task.originalName });

  try {
    const { buffer: apiBuffer, mimeType } = await prepareForApi(
      task.originalName,
      task.imageBuffer
    );
    const base64 = apiBuffer.toString("base64");

    const messages: Array<Record<string, unknown>> = [];

    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }

    const firstUserMsgWithContext = buildUserPrompt(
      userMessages[0],
      triggerWordPerson,
      triggerWordOther
    );
    const firstUserMsg = replaceVariables(
      firstUserMsgWithContext,
      task.originalName,
      task.index,
      total
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

    for (let stepIdx = 0; stepIdx < userMessages.length; stepIdx++) {
      if (abortSignal.aborted) return;

      sendEvent("step_start", {
        imageIndex: task.index,
        stepIndex: stepIdx,
        totalSteps: userMessages.length,
      });

      const { content, reasoningContent, aborted } = await callApiWithStream(
        normalizedUrl,
        model,
        messages,
        (type, delta, full) => {
          sendEvent("token", {
            imageIndex: task.index,
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

      messages.push({
        role: "assistant",
        content: [
          reasoningContent ? `Thinking: ${reasoningContent}\n\n` : "",
          content,
        ].join(""),
      });

      if (stepIdx < userMessages.length - 1) {
        const nextUserMsg = replaceVariables(
          userMessages[stepIdx + 1],
          task.originalName,
          task.index,
          total
        );
        messages.push({ role: "user", content: nextUserMsg });
      }

      sendEvent("step_complete", {
        imageIndex: task.index,
        stepIndex: stepIdx,
        content,
        reasoningContent,
      });
    }

    if (!abortSignal.aborted) {
      const trimmedCaption = finalCaption.trim();

      // Write caption file to disk
      if (trimmedCaption) {
        writeCaption(sessionId, task.serverName, trimmedCaption);
      }

      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "completed",
        caption: trimmedCaption,
        reasoningContent: finalReasoning.trim(),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!abortSignal.aborted) {
      sendEvent("image_complete", {
        index: task.index,
        name: task.originalName,
        status: "failed",
        error: message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// POST - Start processing and return SSE stream
// Accepts FormData (images as files + config as JSON string) or JSON (legacy)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  let config: {
    serverUrl: string;
    model: string;
    systemPrompt: string;
    userMessages: string[];
    triggerWordPerson: string;
    triggerWordOther: string;
  };
  let imageFiles: File[];
  let imageNames: string[];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const configRaw = formData.get("config");
    if (!configRaw || typeof configRaw !== "string") {
      return Response.json({ error: "Missing config" }, { status: 400 });
    }

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(configRaw);
    } catch {
      return Response.json({ error: "Invalid config JSON" }, { status: 400 });
    }

    config = {
      serverUrl: parsedConfig.serverUrl ?? "",
      model: parsedConfig.model ?? "",
      systemPrompt: parsedConfig.systemPrompt ?? "",
      userMessages: parsedConfig.userMessages ?? [],
      triggerWordPerson: parsedConfig.triggerWordPerson ?? "",
      triggerWordOther: parsedConfig.triggerWordOther ?? "",
    };

    imageFiles = formData.getAll("images") as File[];
    if (imageFiles.length === 0) {
      return Response.json({ error: "No images provided" }, { status: 400 });
    }

    const configNames = formData.get("imageNames");
    imageNames = configNames && typeof configNames === "string"
      ? JSON.parse(configNames) as string[]
      : imageFiles.map((f) => f.name);
  } else {
    // Legacy JSON mode
    const body = await request.json();
    const {
      serverUrl,
      model,
      systemPrompt,
      userMessages,
      triggerWordPerson,
      triggerWordOther,
      images,
    } = body as {
      serverUrl: string;
      model: string;
      systemPrompt: string;
      userMessages: string[];
      triggerWordPerson?: string;
      triggerWordOther?: string;
      images: Array<{ imageDataUrl: string; imageName: string }>;
    };

    config = {
      serverUrl,
      model,
      systemPrompt: systemPrompt ?? "",
      userMessages: userMessages ?? [],
      triggerWordPerson: triggerWordPerson ?? "",
      triggerWordOther: triggerWordOther ?? "",
    };

    if (!images || images.length === 0) {
      return Response.json({ error: "No images provided" }, { status: 400 });
    }

    // For JSON mode, throw a synthetic error to handle below
    const jsonSession = createSession();
    throw new Error(
      JSON.stringify({
        mode: "json",
        sessionId: jsonSession.id,
        images: images.map((img) => ({
          dataUrl: img.imageDataUrl,
          name: img.imageName,
        })),
      })
    );
  }

  const person = config.triggerWordPerson?.trim() ?? "";
  const other = config.triggerWordOther?.trim() ?? "";

  if (!config.serverUrl || !config.model) {
    return Response.json(
      { error: "serverUrl and model are required" },
      { status: 400 }
    );
  }

  if (!config.userMessages || config.userMessages.length === 0) {
    return Response.json(
      { error: "At least one user message is required" },
      { status: 400 }
    );
  }

  // Create session and save images
  const session = createSession();
  const sessionId = session.id;
  const usedBases = new Set<string>();
  const tasks: ImageTask[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const buffer = await readFileBuffer(imageFiles[i]);
    const serverName = saveImage(
      sessionId,
      imageNames[i] || `image-${i}.jpg`,
      buffer,
      usedBases
    );

    if (serverName) {
      tasks.push({
        index: i,
        serverName,
        originalName: imageNames[i] || `image-${i}.jpg`,
        imageBuffer: buffer,
      });
    }
  }

  if (tasks.length === 0) {
    return Response.json(
      { error: "No valid images to process" },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeServerUrl(toDockerHostUrl(config.serverUrl));
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

  const sessionAbort = new AbortController();
  activeSessions.set(sessionId, sessionAbort);

  request.signal.addEventListener("abort", () => {
    sessionAbort.abort();
  });

  sendEvent("session", { sessionId });

  // Process images in parallel
  (async () => {
    try {
      const concurrency = Math.min(MAX_CONCURRENCY, tasks.length);
      const queue = [...tasks];

      async function processNext(): Promise<void> {
        while (queue.length > 0 && !sessionAbort.signal.aborted) {
          const task = queue.shift()!;
          touchSession(sessionId);

          await processImageMultiStep(
            task,
            sessionId,
            normalizedUrl,
            config.model,
            config.systemPrompt,
            config.userMessages,
            person,
            other,
            tasks.length,
            sendEvent,
            sessionAbort.signal
          );
        }
      }

      const workers = Array.from({ length: concurrency }, () => processNext());
      await Promise.all(workers);

      if (!sessionAbort.signal.aborted) {
        sendEvent("done", { allComplete: true });
      }
      closeStream();
    } catch (error) {
      if (!sessionAbort.signal.aborted) {
        sendEvent("error", { error: String(error) });
      }
      closeStream();
    } finally {
      activeSessions.delete(sessionId);
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

// ---------------------------------------------------------------------------
// DELETE - Abort an active session
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionAbort = activeSessions.get(sessionId);
  if (!sessionAbort) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  sessionAbort.abort();
  activeSessions.delete(sessionId);
  return Response.json({ ok: true });
}
