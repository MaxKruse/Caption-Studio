// ---------------------------------------------------------------------------
// Preset definitions — one per model type
// Each preset carries its own system prompt, user prompt template, and field requirements.
// ---------------------------------------------------------------------------

export type PresetId = "flux1-dev" | "z-image-turbo-char";

export interface PresetDefinition {
  id: PresetId;
  /** Display label in the preset selector. */
  label: string;
  /** Short description shown as helper text. */
  description: string;
  /** Human-readable model/preset name used in ZIP filenames. */
  zipName: string;
  /** Whether the user must provide a trigger word (activation token). */
  needsTrigger: boolean;
  /** System prompt sent to the vision model. */
  systemPrompt: string;
  /** User prompt template — `{trigger}` is replaced with the trigger word at runtime. */
  userPromptTemplate: string;
}

export const CAPTION_PRESETS: PresetDefinition[] = [
  {
    id: "flux1-dev",
    label: "Flux.1-Dev Character LoRA",
    description: "BLIP-style captions for character LoRA training",
    zipName: "Flux1-Dev",
    needsTrigger: true,
    systemPrompt: `You generate training captions for Flux.1-Dev LoRA fine-tuning. Produce exactly ONE line of comma-separated descriptive phrases in BLIP format. Use lowercase throughout. No periods, no quotes, no bold, no markdown, no bullet points, no section headers, no newlines. Keep it under 200 characters.`,
    userPromptTemplate: `Generate a training caption for this image. Output exactly ONE line starting with "a photo of {trigger}," followed by comma-separated visual descriptors. Describe: hair color and style, eye color, skin tone, facial features, clothing, pose, expression, background, lighting, and shot type. Use lowercase. No periods, no quotes, no bold, no markdown, no bullet points, no section headers, no newlines. Keep it under 200 characters.`,
  },
  {
    id: "z-image-turbo-char",
    label: "Z-Image-Turbo Character LoRA",
    description: "Tag-style captions with trigger token for character LoRA training",
    zipName: "ZImageTurbo-Char",
    needsTrigger: true,
    systemPrompt: `You generate training captions for Z-Image-Turbo LoRA fine-tuning. Produce exactly ONE line of comma-separated tags. Use lowercase throughout. No periods, no quotes, no bold, no markdown, no bullet points, no section headers, no newlines. Keep it concise.`,
    userPromptTemplate: `Generate a training caption for this image. Output exactly ONE line starting with "{trigger}," followed by comma-separated visual descriptors. Describe: hair color and style, eye color, facial features, clothing, pose, expression, background, lighting, and shot type. Use lowercase. No periods, no quotes, no bold, no markdown, no bullet points, no section headers, no newlines. Keep it under 200 characters.`,
  },
];

/** Get a preset definition by ID. */
export function getPreset(id: PresetId): PresetDefinition {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}
