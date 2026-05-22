/**
 * Batch captioning endpoint with SSE progress streaming.
 * POST /api/caption - starts the job and returns job ID
 * GET /api/caption?jobId=<id> - streams SSE progress updates
 */

import { NextRequest } from "next/server";
import {
  abortJob,
  buildStatusMap,
  createJob,
  getJob,
  getProgress,
  isJobDone,
  updateImageStatus,
  type CaptionJob,
  type ImageEntry,
} from "@/lib/store";
import { prepareForApi } from "@/lib/image-utils";
import { normalizeServerUrl } from "@/lib/url-utils";

// ---------------------------------------------------------------------------
// Job config shape — parsed from either FormData or JSON
// ---------------------------------------------------------------------------

interface JobConfig {
  serverUrl: string;
  model: string;
  systemPrompt: string;
  promptPrefix: string;
  userPrompt: string;
  captionName: string;
  includeNameInPrompt: boolean;
  parallelRequests: number;
  imageNames: string[];
}

function parseJobConfigFromFormData(formData: FormData): JobConfig | null {
  const configRaw = formData.get("config");
  if (!configRaw || typeof configRaw !== "string") return null;

  let config: {
    serverUrl: string;
    model: string;
    systemPrompt?: string;
    promptPrefix?: string;
    userPrompt?: string;
    captionName?: string;
    includeNameInPrompt?: boolean;
    parallelRequests?: number;
    imageNames: string[];
  };

  try {
    config = JSON.parse(configRaw);
  } catch {
    return null;
  }

  return {
    serverUrl: config.serverUrl,
    model: config.model,
    systemPrompt: config.systemPrompt ?? "",
    promptPrefix: config.promptPrefix ?? "",
    userPrompt: config.userPrompt ?? "",
    captionName: config.captionName ?? "",
    includeNameInPrompt: !!config.includeNameInPrompt,
    parallelRequests: config.parallelRequests ?? 4,
    imageNames: config.imageNames,
  };
}

function parseJobConfigFromBody(rest: Record<string, unknown>): JobConfig {
  return {
    serverUrl: (rest.serverUrl as string) ?? "",
    model: (rest.model as string) ?? "",
    systemPrompt: (rest.systemPrompt as string) ?? "",
    promptPrefix: (rest.promptPrefix as string) ?? "",
    userPrompt: (rest.userPrompt as string) ?? "",
    captionName: (rest.captionName as string) ?? "",
    includeNameInPrompt: !!(rest.includeNameInPrompt as boolean),
    parallelRequests: (rest.parallelRequests as number) ?? 4,
    imageNames: [],
  };
}

// ---------------------------------------------------------------------------
// Prompt building helpers — pure, testable functions
// ---------------------------------------------------------------------------

function buildPromptText(job: CaptionJob): string {
  const parts = [
    job.promptPrefix.trim() && job.captionName.trim() && job.includeNameInPrompt
      ? `${job.promptPrefix.trim()} '${job.captionName.trim()}'.`
      : job.promptPrefix.trim(),
    job.userPrompt.trim(),
  ].filter(Boolean);

  return parts.join(" ");
}

function buildApiMessages(
  job: CaptionJob,
  imageBase64: string,
  mimeType: string,
  userText: string
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];

  if (job.systemPrompt.trim()) {
    messages.push({
      role: "system",
      content: job.systemPrompt.trim(),
    });
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
        },
      },
      {
        type: "text",
        text: userText,
      },
    ],
  });

  return messages;
}

function buildDisplayPromptText(job: CaptionJob, userText: string): string {
  const parts = [
    job.systemPrompt.trim() ? `System: ${job.systemPrompt.trim()}` : null,
    userText ? `User: ${userText}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// POST - Start a new batch captioning job
// Accepts FormData (real uploads) or JSON (tests/legacy)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  let config: JobConfig | null;
  let decodedImages: { name: string; data: Buffer }[];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    config = parseJobConfigFromFormData(formData);
    if (!config) {
      return Response.json({ error: "Missing config" }, { status: 400 });
    }

    const imageFiles = formData.getAll("images") as File[];
    if (imageFiles.length === 0) {
      return Response.json({ error: "No images provided" }, { status: 400 });
    }

    decodedImages = await Promise.all(
      imageFiles.map(async (file, i) => ({
        name: config!.imageNames[i] ?? file.name,
        data: Buffer.from(await file.arrayBuffer()),
      }))
    );
  } else {
    const body = await request.json();

    const images = (body as Record<string, unknown>).images;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return Response.json({ error: "No images provided" }, { status: 400 });
    }

    const rest = Object.fromEntries(
      Object.entries(body as Record<string, unknown>).filter(([k]) => k !== "images")
    );
    config = parseJobConfigFromBody(rest as Record<string, unknown>);

    decodedImages = (images as Array<{ name: string; data: string }>).map(
      (img) => ({
        name: img.name,
        data: Buffer.from(img.data, "base64"),
      })
    );
  }

  if (!config.serverUrl || !config.model) {
    return Response.json(
      { error: "serverUrl and model are required" },
      { status: 400 }
    );
  }

  const jobId = createJob(
    decodedImages,
    config.serverUrl,
    config.model,
    config.systemPrompt || "",
    config.promptPrefix || "",
    config.userPrompt || "",
    config.captionName || "",
    !!config.includeNameInPrompt,
    Math.min(Math.max(Number(config.parallelRequests) || 4, 1), 8)
  );

  // Start async processing (fire and forget)
  void processJob(jobId);

  return Response.json({ jobId });
}

// ---------------------------------------------------------------------------
// DELETE - Abort a running job
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  const success = abortJob(jobId);
  if (!success) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
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
    const statuses = jobRef ? buildStatusMap(jobRef) : {};

    sendEvent({ ...progress, statuses, avgTimeMs: progress.avgTimeMs, estimatedRemainingMs: progress.estimatedRemainingMs });

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

  const normalizedUrl = normalizeServerUrl(job.serverUrl);
  const entries = Array.from(job.images.entries()); // [filename, entry][]

  // Process with concurrency limit from job settings
  const concurrency = job.parallelRequests;
  const queue = [...entries];

  async function processOne(): Promise<void> {
    while (queue.length > 0) {
      if (!job || job.abortSignal.signal.aborted) break;
      const [filename, entry] = queue.shift()!;
      if (!job || job.abortSignal.signal.aborted) break;
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

// ---------------------------------------------------------------------------
// Single-image captioning
// ---------------------------------------------------------------------------

/** Max time allowed per image API call (5 minutes). */
const API_TIMEOUT_MS = 5 * 60 * 1000;

/** Fetch with an abort timeout — cleans up the timeout in all cases. */
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

/** Caption a single image by calling the OpenAI-compatible API. */
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
    // Prepare image for API (format conversion if needed)
    const { buffer, mimeType } = await prepareForApi(filename, entry.data);
    const base64 = buffer.toString("base64");

    // Build prompt and messages
    const userText = buildPromptText(job);
    const messages = buildApiMessages(job, base64, mimeType, userText);
    const promptText = buildDisplayPromptText(job, userText);

    // Log the prompt being sent
    console.log(`[Caption] ${filename}`);
    if (job.systemPrompt.trim()) console.log(`  System: ${job.systemPrompt.trim()}`);
    if (userText) console.log(`  User:   ${userText}`);

    // Call the API
    const response = await fetchWithTimeout(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: job.model, messages }),
        cache: "no-store",
      },
      API_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    // Parse response
    const data = await response.json();
    const caption =
      (data?.choices?.[0]?.message?.content ?? "(empty response)").trim();
    const reasoningContent =
      data?.choices?.[0]?.message?.reasoning_content;

    updateImageStatus(
      jobId,
      filename,
      "completed",
      caption,
      undefined,
      promptText,
      reasoningContent
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === "AbortError") {
      updateImageStatus(
        jobId,
        filename,
        "failed",
        undefined,
        `API request timed out after ${API_TIMEOUT_MS / 1000 / 60} minute(s)`
      );
    } else {
      updateImageStatus(jobId, filename, "failed", undefined, message);
    }
  }
}
