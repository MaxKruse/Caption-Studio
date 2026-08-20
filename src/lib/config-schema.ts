import { z } from "zod";

/** Strict UUIDv4 - same shape temp-files requires for session ids. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Base config fields shared across modes */
const baseConfig = z.object({
  serverUrl: z.string().url(),
  model: z.string().min(1),
  systemPrompt: z.string().optional().default(""),
  userPrompt: z.string().optional().default(""),
  triggerWordPerson: z.string().optional().default(""),
  triggerWordOther: z.string().optional().default(""),
  /**
   * Max image dimension (px) before client-side downscaling.
   * Defaults to the 1536px lib default when omitted; raise it (with a
   * matching --image-max-tokens on the server) for more detail.
   */
  maxImageDimension: z
    .number()
    .int()
    .min(256)
    .max(4096)
    .optional(),
  // ------------------------------------------------------------------
  // Chunked upload protocol (large batches).
  // All four fields are present together: chunk 0 of a chunked upload
  // opens the SSE stream under the client-generated sessionId and the
  // remaining chunks POST to the same route for a JSON ack.
  // ------------------------------------------------------------------
  /** Client-generated session UUID (chunked uploads only). */
  sessionId: z.string().regex(UUID_V4).optional(),
  /** Total images the client will send across all chunks. */
  expectedImageCount: z.number().int().min(1).max(10_000).optional(),
  /** 0-based index of this chunk; 0 opens the stream, >0 is an ack. */
  chunkIndex: z.number().int().min(0).max(10_000).optional(),
  /** Images per chunk (fixed except the last, which may be shorter). */
  chunkSize: z.number().int().min(1).max(200).optional(),
});

/** Krea 2 mode requires character description */
export const krea2ConfigSchema = baseConfig.extend({
  characterDescription: z.string().min(1, "characterDescription is required for Krea 2 mode"),
});

/** For Anima mode config (currently identical to the base fields) */
export const forAnimaConfigSchema = baseConfig;

export type Krea2Config = z.infer<typeof krea2ConfigSchema>;
export type ForAnimaConfig = z.infer<typeof forAnimaConfigSchema>;
