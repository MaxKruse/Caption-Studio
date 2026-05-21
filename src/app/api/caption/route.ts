/**
 * Batch captioning endpoint with SSE progress streaming.
 * POST /api/caption - starts the job and returns job ID
 * GET /api/caption?jobId=<id> - streams SSE progress updates
 */

import { NextRequest } from "next/server";
import {
  createJob,
  getJob,
  getProgress,
  isJobDone,
  updateImageStatus,
  type ImageEntry,
} from "@/lib/store";
import { ensureOpenaiCompatible } from "@/lib/image-utils";

// ---------------------------------------------------------------------------
// POST - Start a new batch captioning job
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json();

  const { images, serverUrl, model, systemPrompt, promptPrefix, userPrompt, captionName, includeNameInPrompt, parallelRequests } = body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return Response.json({ error: "No images provided" }, { status: 400 });
  }
  if (!serverUrl || !model) {
    return Response.json(
      { error: "serverUrl and model are required" },
      { status: 400 }
    );
  }

  // Decode base64 image data from the client
  const decodedImages = images.map((img: { name: string; data: string }) => ({
    name: img.name,
    data: Buffer.from(img.data, "base64"),
  }));

  const jobId = createJob(
    decodedImages,
    serverUrl,
    model,
    systemPrompt || "",
    promptPrefix || "",
    userPrompt || "",
    captionName || "",
    !!includeNameInPrompt,
    Math.min(Math.max(Number(parallelRequests) || 4, 1), 8)
  );

  // Start async processing (fire and forget)
  void processJob(jobId);

  return Response.json({ jobId });
}

// ---------------------------------------------------------------------------
// GET - SSE progress stream for an existing job
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // Create an SSE stream
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  // Send an SSE event
  const sendEvent = (data: unknown) => {
    if (controller) {
      const line = `data: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(line));
    }
  };

  sendEvent(getProgress(jobId));

  // Poll for updates every 500ms and send SSE events
  const interval = setInterval(() => {
    const progress = getProgress(jobId);
    const jobRef = getJob(jobId);

    // Build per-image status map
    const statuses: Record<string, { status: string; caption?: string; error?: string; prompt?: string; reasoningContent?: string }> = {};
    if (jobRef) {
      for (const [filename, entry] of jobRef.images.entries()) {
        statuses[filename] = {
          status: entry.status,
          caption: entry.caption,
          error: entry.error,
          prompt: entry.prompt,
          reasoningContent: entry.reasoningContent,
        };
      }
    }

    sendEvent({ ...progress, statuses });

    if (isJobDone(jobId)) {
      clearInterval(interval);
      sendEvent({ ...progress, statuses, done: true });
      controller?.close();
    }
  }, 500);

  // Cleanup on client disconnect
  request.signal.addEventListener("abort", () => {
    clearInterval(interval);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Async job processor - processes images with concurrency limit
// ---------------------------------------------------------------------------
async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const normalizedUrl = job.serverUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const entries = Array.from(job.images.entries()); // [filename, entry][]

  // Process with concurrency limit from job settings
  const concurrency = job.parallelRequests;
  const queue = [...entries];

  async function processOne(): Promise<void> {
    while (queue.length > 0) {
      const [filename, entry] = queue.shift()!;
      await captionImage(jobId, filename, entry, normalizedUrl, job);
    }
  }

  // Launch up to `concurrency` workers
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () =>
      processOne()
    )
  );
}

/** Caption a single image by calling the OpenAI-compatible API. */

/** Max time allowed per image API call (5 minutes). */
const API_TIMEOUT_MS = 5 * 60 * 1000;

async function captionImage(
  jobId: string,
  filename: string,
  entry: ImageEntry,
  baseUrl: string,
  job: ReturnType<typeof getJob>
): Promise<void> {
  if (!job) return;

  updateImageStatus(jobId, filename, "processing");

  try {
    // Ensure image is PNG or JPEG (OpenAI only accepts these formats)
    const { buffer, mimeType } = await ensureOpenaiCompatible(
      filename,
      entry.data
    );
    const base64 = buffer.toString("base64");

    const messages: Array<Record<string, unknown>> = [];

    // Add system prompt if provided
    if (job.systemPrompt.trim()) {
      messages.push({
        role: "system",
        content: job.systemPrompt.trim(),
      });
    }

    // Build user text content
    const userTextParts = [
      job.promptPrefix.trim() && job.captionName.trim() && job.includeNameInPrompt
        ? `${job.promptPrefix.trim()} ${job.captionName.trim()}.`
        : job.promptPrefix.trim(),
      job.userPrompt.trim(),
    ].filter(Boolean);

    const userText = userTextParts.join(" ");

    // Add user message with image
    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
          },
        },
        {
          type: "text",
          text: userText,
        },
      ],
    });

    // Build the full prompt text for display (system + user, no image data)
    const promptText = [
      job.systemPrompt.trim() ? `System: ${job.systemPrompt.trim()}` : null,
      userText ? `User: ${userText}` : null,
    ].filter(Boolean).join("\n");

    // Log the prompt being sent
    console.log(`[Caption] ${filename}`);
    if (job.systemPrompt.trim()) console.log(`  System: ${job.systemPrompt.trim()}`);
    if (userText) console.log(`  User:   ${userText}`);

    const requestBody = {
      model: job.model,
      messages,
    };

    // Create abort controller with 5-minute timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const caption =
        data?.choices?.[0]?.message?.content ?? "(empty response)";
      const reasoningContent =
        data?.choices?.[0]?.message?.reasoning_content;

      updateImageStatus(jobId, filename, "completed", caption, undefined, promptText, reasoningContent);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`API request timed out after ${API_TIMEOUT_MS / 1000 / 60} minute(s)`);
      }
      throw err;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateImageStatus(jobId, filename, "failed", undefined, message);
  }
}


