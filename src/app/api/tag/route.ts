/**
 * Proxy to the WD Tagger microservice.
 * POST /api/tag - tag a single image
 */

import { NextRequest } from "next/server";

const TAG_SERVICE_URL = process.env.TAG_SERVICE_URL ?? "http://localhost:8801";

// ---------------------------------------------------------------------------
// POST /api/tag - Tag a single image
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { image, minProbability, maxTags, customTags, tagsToEncourage, tagsToExclude } = body as {
    image: string;
    minProbability?: number;
    maxTags?: number;
    customTags?: string;
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
        customTags,
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
