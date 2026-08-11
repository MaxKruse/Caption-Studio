import { z } from "zod";

/** Base config fields shared across modes */
const baseConfig = z.object({
  serverUrl: z.string().url(),
  model: z.string().min(1),
  systemPrompt: z.string().optional().default(""),
  userPrompt: z.string().optional().default(""),
  triggerWordPerson: z.string().optional().default(""),
  triggerWordOther: z.string().optional().default(""),
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
