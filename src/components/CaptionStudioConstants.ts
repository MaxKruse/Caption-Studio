// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const TOAST_DURATION = 4000;

// ---------------------------------------------------------------------------
// Image count guidance for character captioning (LoRA training)
// ---------------------------------------------------------------------------

/** Sweet spot range for character dataset images. */
export const IMAGE_COUNT_SWEET_SPOT_MIN = 10;
export const IMAGE_COUNT_SWEET_SPOT_MAX = 20;

/** Warning threshold — shown when user exceeds this count. */
export const IMAGE_COUNT_WARNING_THRESHOLD = 25;

/** Recommended portrait vs full-body ratio (80% portrait / 20% body). */
export const PORTRAIT_RATIO_PERCENT = 80;

// ---------------------------------------------------------------------------
// Caption type definitions
// ---------------------------------------------------------------------------

export type CaptionTypeId =
  | "detailed"
  | "detailed_with_trigger"
  | "short"
  | "short_with_trigger"
  | "name";

export interface CaptionTypeDefinition {
  id: CaptionTypeId;
  label: string;
  description: string;
  /** What the system prompt should produce (guidance for the model). */
  outputStyle: string;
  /** Fields the user must fill in (beyond system/user prompt). */
  needsTrigger: boolean;
  needsName: boolean;
}

export const CAPTION_TYPES: CaptionTypeDefinition[] = [
  {
    id: "detailed",
    label: "Detailed paragraph",
    description: "A full description paragraph of the subject",
    outputStyle: "detailed_paragraph",
    needsTrigger: false,
    needsName: false,
  },
  {
    id: "detailed_with_trigger",
    label: "Detailed + trigger word",
    description: "Trigger word prepended to a full description paragraph",
    outputStyle: "detailed_paragraph",
    needsTrigger: true,
    needsName: false,
  },
  {
    id: "short",
    label: "Short description",
    description: "A concise 5-15 word descriptive phrase",
    outputStyle: "short_description",
    needsTrigger: false,
    needsName: false,
  },
  {
    id: "short_with_trigger",
    label: "Short + trigger word",
    description: "Trigger word prepended to a short descriptive phrase",
    outputStyle: "short_description",
    needsTrigger: true,
    needsName: false,
  },
  {
    id: "name",
    label: "Subject name only",
    description: "Just the subject's name — no model output needed",
    outputStyle: "none",
    needsTrigger: false,
    needsName: true,
  },
];

/** Get a caption type definition by ID. */
export function getCaptionType(id: CaptionTypeId): CaptionTypeDefinition {
  return CAPTION_TYPES.find((t) => t.id === id) ?? CAPTION_TYPES[0];
}

// ---------------------------------------------------------------------------
// System prompts per output style
// ---------------------------------------------------------------------------

/**
 * System prompts that guide the model to produce the right caption style.
 * These are used for SFW mode. NSFW variants add explicit language guidance.
 */

const SYSTEM_PROMPT_DETAILED_PARAGRAPH_SFW = `You are an expert character image captioning assistant. Produce a single, cohesive paragraph describing the visible subject.

Follow this structure:
1. **Subject Specification** — Identify the main subject: gender, distinctive physical features, body type, hair, skin tone, facial expression, and what they are doing.
2. **Clothing & Appearance** — Describe attire, accessories, and styling with specific details.
3. **Environmental Context** — Establish the setting, lighting, and background elements.
4. **Visual Style** — Note camera angle, framing, depth of field, and overall mood.

Rules:
- Describe only what is physically visible. Do not speculate.
- Use definitive language. Avoid "appears to be," "possibly," or "seems."
- Ignore text, watermarks, and UI elements.
- Do NOT include trigger words or names — only describe what you see.
- Use clean, appropriate, safe-for-work language.
- Do NOT describe the subject's age (e.g., avoid "young," "old").
- Vary sentence structure. Avoid repetitive patterns.
- Output a single paragraph, 30-150 words depending on visual complexity.
- No preamble, no warnings, no disclaimers. Start directly with the description.`;

const SYSTEM_PROMPT_DETAILED_PARAGRAPH_NSFW = `You are an expert character image captioning assistant. Produce a single, cohesive paragraph describing the visible subject.

Follow this structure:
1. **Subject Specification** — Identify the main subject: gender, distinctive physical features, body type, hair, skin tone, facial expression, and what they are doing.
2. **Clothing & Appearance** — Describe attire, accessories, and styling with specific details.
3. **Environmental Context** — Establish the setting, lighting, and background elements.
4. **Visual Style** — Note camera angle, framing, depth of field, and overall mood.

Rules:
- Describe only what is physically visible. Do not speculate.
- Use definitive language. Avoid "appears to be," "possibly," or "seems."
- Ignore text, watermarks, and UI elements.
- Do NOT include trigger words or names — only describe what you see.
- Be explicit and anatomically direct for NSFW content. Use precise terminology.
- Do NOT describe the subject's age (e.g., avoid "young," "old").
- Vary sentence structure. Avoid repetitive patterns.
- Output a single paragraph, 30-150 words depending on visual complexity.
- No preamble, no warnings, no disclaimers. Start directly with the description.`;

const SYSTEM_PROMPT_SINGLE_WORD_SFW = `You are an expert character image captioning assistant. Output exactly ONE generic word describing the main subject's gender identity — like "woman", "man", "girl", or "boy".

Rules:
- Output ONLY the single word. Nothing else.
- No punctuation, no quotes, no extra text.
- Do NOT describe age, appearance, or anything beyond the gender word.
- Use clean, safe-for-work language.`;

const SYSTEM_PROMPT_SINGLE_WORD_NSFW = `You are an expert character image captioning assistant. Output exactly ONE generic word describing the main subject's gender identity — like "woman", "man", "girl", or "boy".

Rules:
- Output ONLY the single word. Nothing else.
- No punctuation, no quotes, no extra text.
- Do NOT describe age, appearance, or anything beyond the gender word.`;

const SYSTEM_PROMPT_SHORT_DESCRIPTION_SFW = `You are an expert character image captioning assistant. Produce a concise descriptive phrase about the visible subject — 5 to 15 words maximum.

Focus on: gender, distinctive features (hair, build), clothing, and pose.

Rules:
- Output ONLY the descriptive phrase. No preamble, no quotes.
- Do NOT include trigger words or names — only describe what you see.
- Do NOT describe the subject's age.
- Use clean, safe-for-work language.
- Start directly with the description (e.g., "a woman with short brown hair wearing a blue shirt").`;

const SYSTEM_PROMPT_SHORT_DESCRIPTION_NSFW = `You are an expert character image captioning assistant. Produce a concise descriptive phrase about the visible subject — 5 to 15 words maximum.

Focus on: gender, distinctive features (hair, build), clothing, and pose.

Rules:
- Output ONLY the descriptive phrase. No preamble, no quotes.
- Do NOT include trigger words or names — only describe what you see.
- Do NOT describe the subject's age.
- Be explicit and anatomically direct for NSFW content.
- Start directly with the description (e.g., "a woman with short brown hair wearing a blue shirt").`;

const SYSTEM_PROMPT_NAME_ONLY_SFW = `You are an expert character image captioning assistant. The user will provide a name — output that name exactly as given.

Rules:
- Output ONLY the name. Nothing else.
- No quotes, no extra text.`;

const SYSTEM_PROMPT_NAME_ONLY_NSFW = `You are an expert character image captioning assistant. The user will provide a name — output that name exactly as given.

Rules:
- Output ONLY the name. Nothing else.
- No quotes, no extra text.`;

/** Get system prompt for a caption type and content mode. */
export function getSystemPrompt(
  captionTypeId: CaptionTypeId,
  contentMode: "sfw" | "nsfw"
): string {
  const type = getCaptionType(captionTypeId);
  const isNsfw = contentMode === "nsfw";

  switch (type.outputStyle) {
    case "detailed_paragraph":
      return isNsfw
        ? SYSTEM_PROMPT_DETAILED_PARAGRAPH_NSFW
        : SYSTEM_PROMPT_DETAILED_PARAGRAPH_SFW;
    case "single_word":
      return isNsfw
        ? SYSTEM_PROMPT_SINGLE_WORD_NSFW
        : SYSTEM_PROMPT_SINGLE_WORD_SFW;
    case "short_description":
      return isNsfw
        ? SYSTEM_PROMPT_SHORT_DESCRIPTION_NSFW
        : SYSTEM_PROMPT_SHORT_DESCRIPTION_SFW;
    case "name_only":
      return isNsfw
        ? SYSTEM_PROMPT_NAME_ONLY_NSFW
        : SYSTEM_PROMPT_NAME_ONLY_SFW;
    case "none":
      // No model output needed — caption is just the prefix
      return `You are a captioning assistant. The caption for this image will be provided as a prefix — no additional description is needed.`;
    default:
      return isNsfw
        ? SYSTEM_PROMPT_DETAILED_PARAGRAPH_NSFW
        : SYSTEM_PROMPT_DETAILED_PARAGRAPH_SFW;
  }
}

/**
 * Legacy caption type migration — maps old IDs to new ones.
 * Existing jobs with old captionTypeId values will still work.
 */
const LEGACY_CAPTION_TYPE_MAP: Record<string, CaptionTypeId> = {
  generic_single: "detailed",
  generic_with_trigger: "detailed_with_trigger",
  strict_crop_trigger: "name",
  strict_crop_generic: "detailed",
  name_only: "name",
  name_with_generic: "name",
  name_with_trigger: "name",
  short_with_trigger: "short_with_trigger",
  short_with_generic: "short",
  short_only: "short",
};

/** Resolve a caption type ID, migrating legacy IDs if needed. */
export function resolveCaptionTypeId(id: string): CaptionTypeId {
  if (CAPTION_TYPES.some((t) => t.id === id)) return id as CaptionTypeId;
  return LEGACY_CAPTION_TYPE_MAP[id] ?? "detailed";
}

/** Get default user prompt for a caption type and content mode. */
export function getUserPrompt(
  captionTypeId: CaptionTypeId,
  contentMode: "sfw" | "nsfw"
): string {
  const type = getCaptionType(captionTypeId);
  const isNsfw = contentMode === "nsfw";

  switch (type.outputStyle) {
    case "detailed_paragraph":
      return isNsfw
        ? "Generate a detailed caption for this character image. Focus on the subject's appearance, clothing, pose, expression, and environment. Be explicit and direct with NSFW content. Keep it to one paragraph, 30-150 words."
        : "Generate a detailed caption for this character image. Focus on the subject's appearance, clothing, pose, expression, and environment. Include lighting and photographic style details. Keep it to one paragraph, 30-150 words. Use clean, safe-for-work language.";
    case "single_word":
      return "Output a single generic word for this subject.";
    case "short_description":
      return isNsfw
        ? "Describe this character in a short phrase (5-15 words). Be explicit for NSFW content."
        : "Describe this character in a short phrase (5-15 words). Use clean, safe-for-work language.";
    case "name_only":
      return "Output the name for this subject.";
    case "none":
      return "";
    default:
      return "";
  }
}
