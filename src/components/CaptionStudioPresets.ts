// ---------------------------------------------------------------------------
// Preset definitions — one per model type
// Each preset carries its own system prompt, user prompt template, and field requirements.
// ---------------------------------------------------------------------------

export type PresetId = "flux1-dev" | "z-image-turbo-char" | "anima";

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
    description: "Natural language captions for Flux T5-XXL encoder",
    zipName: "Flux1-Dev",
    needsTrigger: true,
    systemPrompt: `You generate training captions for Flux.1-Dev LoRA fine-tuning. Flux uses dual text encoders (T5-XXL + CLIP-L) that process natural language with high contextual understanding — not tags, not comma-separated lists, not keyword stuffing. Write exactly ONE paragraph of complete, descriptive sentences. Describe only what is visually present in the image. Be precise and specific: facial features, clothing details, pose, expression, background elements, lighting quality and direction, and camera framing. Use proper grammar and varied sentence structure. Maintain consistent descriptive patterns across all captions in the dataset. No markdown, no bullet points, no section headers, no newlines.`,
    userPromptTemplate: `Write a detailed training caption for this image as a single natural language paragraph. Start with "{trigger}." Then describe the subject systematically in full sentences:

1. Physical appearance: face shape, jawline, cheekbones, forehead, eyebrows, eyes (shape, color, spacing), nose, lips, mouth, facial hair, ears, and hair (color, length, style, density).
2. Clothing and accessories: type, color, fit, notable details.
3. Pose and expression: body position, hand placement, facial expression, gaze direction.
4. Environment: background elements, setting, props.
5. Technical: lighting quality and direction (soft, harsh, natural, studio, backlight), shot type (close-up, headshot, medium shot, full body), and camera angle.

Use complete sentences with proper grammar. Be specific — "wearing a red button-down shirt" is better than "wearing a shirt." Describe only what is visually present. No markdown, no bullet points, no section headers, no newlines.`,
  },
  {
    id: "z-image-turbo-char",
    label: "Z-Image-Turbo Character LoRA",
    description: "Minimal natural language captions for S3-DiT encoder",
    zipName: "ZImageTurbo-Char",
    needsTrigger: true,
    systemPrompt: `You generate training captions for Z-Image-Turbo LoRA fine-tuning. Z-Image-Turbo uses an S3-DiT architecture that reads prompts as natural language sentences — not comma-separated tags. Over-captioning is the most common mistake and actively degrades training results. Produce minimal, clean captions: 1 to 2 short sentences maximum. Focus only on stable, important features that should be learned by the LoRA. No markdown, no bullet points, no section headers, no newlines.`,
    userPromptTemplate: `Generate a minimal training caption for this image. Start with "{trigger}," then add 1-2 short natural language sentences describing only the most important visual features. Include: a brief subject descriptor (e.g., "a young woman with long dark hair"), clothing type, setting/background, and lighting. Keep the entire caption under 20 words. Examples of good captions:

"{trigger}, a portrait photo of a woman with short blonde hair, studio lighting"
"{trigger}, outdoor portrait of a man with curly dark hair, wearing a black jacket, natural light"

Do NOT use comma-separated tag lists. Do NOT describe every detail. Less is more. No markdown, no bullet points, no section headers, no newlines.`,
  },
  {
    id: "anima",
    label: "Anima Anime LoRA",
    description: "Danbooru-style tag captions for Anima's hybrid tag encoder",
    zipName: "Anima",
    needsTrigger: true,
    systemPrompt: `You generate training captions for Anima LoRA fine-tuning. Anima is a Danbooru-trained anime image model. Output ONLY a comma-separated tag list — no sentences, no markdown, no newlines. Tag rules: all lowercase; use spaces not underscores (except score_ quality tags). Tag order: quality prefix → subject count (1girl/1boy) → character tags → appearance (hair, eyes) → clothing → pose/expression → background/meta.`,
    userPromptTemplate: `Generate a Danbooru-style training caption for this image. Output ONLY a flat comma-separated tag list. Use lowercase and spaces instead of underscores (score_ tags are the exception).

Tag order:
1. Quality prefix (always): masterpiece, best quality, score_7
2. Subject count: 1girl or 1boy (whichever applies)
3. Character trigger: {trigger}
4. Hair: color + length + style (e.g. long brown hair, straight hair, twin tails)
5. Eyes: color + style (e.g. blue eyes, large eyes)
6. Clothing: garment names (e.g. school uniform, white shirt, black skirt, hair ribbon)
7. Pose and expression (e.g. smile, standing, looking at viewer, arms crossed)
8. Background/meta (e.g. simple background, white background, outdoors, solo)

Output ONLY the tag list. No sentences, no explanation, no markdown, no newlines.`,
  },
];

/** Get a preset definition by ID. */
export function getPreset(id: PresetId): PresetDefinition {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}
