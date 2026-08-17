import { z } from "zod";

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
});

/** Krea 2 mode requires character description */
export const krea2ConfigSchema = baseConfig.extend({
  characterDescription: z.string().min(1, "characterDescription is required for Krea 2 mode"),
});

/** For Anima mode config */
export const forAnimaConfigSchema = baseConfig.extend({
  // For Anima may have additional optional fields
  // e.g., useExistingCaptions boolean
  useExistingCaptions: z.boolean().optional().default(false),
});

export type Krea2Config = z.infer<typeof krea2ConfigSchema>;
export type ForAnimaConfig = z.infer<typeof forAnimaConfigSchema>;

// ---------------------------------------------------------------------------
// Detection config
// ---------------------------------------------------------------------------

export const detectConfigSchema = z.object({
  serverUrl: z.string().url(),
  model: z.string().min(1),
  /** Prompt style: "sfw" or "nsfw" (default nsfw). */
  contentMode: z.enum(["sfw", "nsfw"]).default("nsfw"),
  /** Max concurrent detection requests (defaults to the server's --parallel). */
  parallelRequests: z.number().int().min(1).max(8).optional(),
});

export type DetectConfig = z.infer<typeof detectConfigSchema>;
