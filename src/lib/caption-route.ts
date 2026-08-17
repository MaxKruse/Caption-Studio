/**
 * Shared route preamble for the caption and detection endpoints.
 *
 * parseCaptionRequest() validates the multipart body (content type,
 * JSON config via a Zod schema, image list, optional imageNames) and
 * returns either the parsed payload or a ready-to-return 400 Response.
 *
 * handleSessionAbort() is the DELETE handler both caption routes use:
 * abort a registered session by id.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { abortSession } from "@/lib/session-registry";

// ---------------------------------------------------------------------------
// POST preamble
// ---------------------------------------------------------------------------

export type CaptionRequestResult<T> =
  | {
      ok: true;
      config: T;
      imageFiles: File[];
      imageNames: string[];
      /** File arrays for each extra field name requested (empty if absent). */
      extraFiles: Record<string, File[]>;
    }
  | { ok: false; response: Response };

/**
 * Parse and validate a caption/detection POST request.
 *
 * Accepts multipart/form-data with:
 * - `config` (JSON string, validated by `schema`)
 * - `images` (one or more File parts)
 * - `imageNames` (optional JSON string array; falls back to file names)
 * - any extra file field names passed via `extraFileFields`
 *
 * Returns the parsed payload, or a 400 Response describing the problem.
 */
export async function parseCaptionRequest<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  extraFileFields: string[] = []
): Promise<CaptionRequestResult<T>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: false,
      response: Response.json(
        { error: "Only multipart/form-data is supported" },
        { status: 400 }
      ),
    };
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid multipart body" }, { status: 400 }),
    };
  }

  const configRaw = formData.get("config");
  if (!configRaw || typeof configRaw !== "string") {
    return {
      ok: false,
      response: Response.json({ error: "Missing config" }, { status: 400 }),
    };
  }

  let config: T;
  try {
    const parsed: unknown = JSON.parse(configRaw);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        response: Response.json(
          { error: "Invalid config", details: result.error.flatten() },
          { status: 400 }
        ),
      };
    }
    config = result.data;
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid config JSON" }, { status: 400 }),
    };
  }

  const imageFiles = formData.getAll("images") as File[];
  if (imageFiles.length === 0) {
    return {
      ok: false,
      response: Response.json({ error: "No images provided" }, { status: 400 }),
    };
  }

  // Use client-provided names when present, otherwise fall back to file names
  const configNames = formData.get("imageNames");
  let imageNames: string[];
  if (configNames && typeof configNames === "string") {
    let names: unknown;
    try {
      names = JSON.parse(configNames);
    } catch {
      names = undefined;
    }
    if (!Array.isArray(names)) {
      return {
        ok: false,
        response: Response.json({ error: "Invalid imageNames JSON" }, { status: 400 }),
      };
    }
    imageNames = names as string[];
  } else {
    imageNames = imageFiles.map((f) => f.name);
  }

  const extraFiles: Record<string, File[]> = {};
  for (const field of extraFileFields) {
    extraFiles[field] = formData.getAll(field) as File[];
  }

  return { ok: true, config, imageFiles, imageNames, extraFiles };
}

// ---------------------------------------------------------------------------
// DELETE - session abort
// ---------------------------------------------------------------------------

/**
 * DELETE handler: abort a registered caption session.
 * 400 missing sessionId, 404 unknown session, 200 { ok: true } otherwise.
 */
export function handleSessionAbort(request: NextRequest): Response {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  if (!abortSession(sessionId)) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
