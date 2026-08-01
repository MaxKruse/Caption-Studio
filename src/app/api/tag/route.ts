/**
 * Proxy to the WD Tagger microservice.
 * POST /api/tag - tag a single image
 * POST /api/tag/batch - tag multiple images
 * GET  /api/tag/health - health check
 */

import { NextRequest } from "next/server";

const TAG_SERVICE_URL = process.env.TAG_SERVICE_URL ?? "http://localhost:8801";

// ---------------------------------------------------------------------------
// GET /api/tag/health - Health check
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const check = searchParams.get("check");

  if (check === "health") {
    try {
      const res = await fetch(`${TAG_SERVICE_URL}/health`, { cache: "no-store" });
      const data = await res.json();
      return Response.json(data);
    } catch {
      return Response.json({ ok: false, modelLoaded: false });
    }
  }

  return Response.json({ error: "Use ?check=health for health check" }, { status: 400 });
}

// ---------------------------------------------------------------------------
// POST /api/tag - Tag a single image
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const path = new URL(request.url).pathname;

  // Route to batch endpoint
  if (path === "/api/tag/batch") {
    return handleBatch(request);
  }

  return handleSingle(request);
}

async function handleSingle(request: NextRequest) {
  const body = await request.json();
  const { image, minProbability, maxTags, tagsToEncourage, tagsToExclude } = body as {
    image: string;
    minProbability?: number;
    maxTags?: number;
    tagsToEncourage?: string;
    tagsToExclude?: string;
  };

  if (!image) {
    return Response.json({ error: "Missing 'image' field" }, { status: 400 });
  }

  try {
    const res = await fetch(`${TAG_SERVICE_URL}/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        minProbability,
        maxTags,
        tagsToEncourage,
        tagsToExclude,
      }),
      cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Tag service unavailable: ${message}` }, { status: 502 });
  }
}

async function handleBatch(request: NextRequest) {
  const body = await request.json();
  const { images, minProbability, maxTags, tagsToEncourage, tagsToExclude } = body as {
    images: string[];
    minProbability?: number;
    maxTags?: number;
    tagsToEncourage?: string;
    tagsToExclude?: string;
  };

  if (!images || !Array.isArray(images) || images.length === 0) {
    return Response.json({ error: "'images' must be a non-empty array" }, { status: 400 });
  }

  try {
    const res = await fetch(`${TAG_SERVICE_URL}/tag-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images,
        minProbability,
        maxTags,
        tagsToEncourage,
        tagsToExclude,
      }),
      cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Tag service unavailable: ${message}` }, { status: 502 });
  }
}
