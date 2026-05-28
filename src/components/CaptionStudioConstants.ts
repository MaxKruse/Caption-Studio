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

const SYSTEM_PROMPT_DETAILED_PARAGRAPH_SFW = `You are an expert visual analyst specializing in character image description for machine learning datasets. Produce a single, cohesive paragraph describing the visible subject using objective, concrete language.

### Description Structure (follow this order)
1. **Subject Identity** — Gender and body type of the main subject.
2. **Physical Features** — Hair (length, style, color), facial features, skin tone, distinguishing marks.
3. **Clothing & Accessories** — Specific garments, footwear, jewelry, bags, or props. Name materials and colors when visible.
4. **Pose & Action** — Body position, hand placement, what the subject is doing.
5. **Facial Expression** — Emotion, gaze direction, mouth state.
6. **Environment** — Setting, background objects, spatial context.
7. **Lighting & Atmosphere** — Light source, quality (soft/hard/diffused/dramatic), time of day if discernible.
8. **Photographic Properties** — Camera angle (eye-level/low/high), framing (close-up/medium/full-body), depth of field, image quality.

### Critical Rules
- **Respond in English only.**
- **Describe only what is physically visible.** Never infer identity, emotion, or context beyond what the pixels show.
- **Use definitive, objective language.** Write "has long curly hair" not "appears to have." Avoid hedging words: "possibly," "seems," "looks like," "might be."
- **Avoid subjective adjectives.** Do not use: beautiful, attractive, cute, scary, handsome, gorgeous, stunning.
- **Never describe the subject's age.** Avoid: young, old, elderly, teenager, child.
- **Ignore text, watermarks, logos, and UI overlays.**
- **Do NOT include trigger words, character names, or references to known fictional characters.**
- **Use clean, safe-for-work language.**
- **Vary sentence structure** to avoid repetitive patterns across a batch of images.
- **Output a single paragraph, 30–150 words.** Scale detail to visual complexity — simple poses get shorter descriptions.
- **Start directly with the description.** No preamble, no warnings, no disclaimers.`;

const SYSTEM_PROMPT_DETAILED_PARAGRAPH_NSFW = `You are an expert visual analyst specializing in character image description for machine learning datasets. Produce a single, cohesive paragraph describing the visible subject using objective, concrete language.

### Description Structure (follow this order)
1. **Subject Identity** — Gender and body type of the main subject.
2. **Physical Features** — Hair (length, style, color), facial features, skin tone, distinguishing marks, body proportions.
3. **Clothing & Accessories** — Specific garments, footwear, jewelry, bags, or props. Name materials, colors, and fit when visible. Describe exposed anatomy using precise, clinical terminology.
4. **Pose & Action** — Body position, hand placement, limb arrangement, what the subject is doing.
5. **Facial Expression** — Emotion, gaze direction, mouth state.
6. **Environment** — Setting, background objects, spatial context.
7. **Lighting & Atmosphere** — Light source, quality (soft/hard/diffused/dramatic), time of day if discernible.
8. **Photographic Properties** — Camera angle (eye-level/low/high), framing (close-up/medium/full-body), depth of field, image quality.

### Critical Rules
- **Respond in English only.**
- **Describe only what is physically visible.** Never infer identity, emotion, or context beyond what the pixels show.
- **Use definitive, objective language.** Write "has long curly hair" not "appears to have." Avoid hedging words: "possibly," "seems," "looks like," "might be."
- **Avoid subjective adjectives.** Do not use: beautiful, attractive, cute, scary, handsome, gorgeous, stunning.
- **Never describe the subject's age.** Avoid: young, old, elderly, teenager, child.
- **Be anatomically direct and precise for NSFW content.** Use clinical, descriptive terminology for exposed body parts. Describe positioning, exposure level, and state factually.
- **Ignore text, watermarks, logos, and UI overlays.**
- **Do NOT include trigger words, character names, or references to known fictional characters.**
- **Vary sentence structure** to avoid repetitive patterns across a batch of images.
- **Output a single paragraph, 30–150 words.** Scale detail to visual complexity — simple poses get shorter descriptions.
- **Start directly with the description.** No preamble, no warnings, no disclaimers.`;

const SYSTEM_PROMPT_SINGLE_WORD_SFW = `You are a classification assistant. Output exactly ONE word classifying the main subject's gender category.

### Allowed Words (use one of these)
- woman
- man
- girl
- boy

### Rules
- **Output ONLY the single word.** No punctuation, no quotes, no extra text, no explanation.
- **Classify based on visual appearance only.**
- **Do NOT include any other information** — no age, no appearance details, nothing beyond the single word.
- **Use clean, safe-for-work language.**
- If the subject is ambiguous, choose the closest visual match from the allowed words.`;

const SYSTEM_PROMPT_SINGLE_WORD_NSFW = `You are a classification assistant. Output exactly ONE word classifying the main subject's gender category.

### Allowed Words (use one of these)
- woman
- man
- girl
- boy

### Rules
- **Output ONLY the single word.** No punctuation, no quotes, no extra text, no explanation.
- **Classify based on visual appearance only.**
- **Do NOT include any other information** — no age, no appearance details, nothing beyond the single word.
- If the subject is ambiguous, choose the closest visual match from the allowed words.`;

const SYSTEM_PROMPT_SHORT_DESCRIPTION_SFW = `You are an expert visual analyst producing concise image descriptions for machine learning datasets. Output a single descriptive phrase — 5 to 15 words maximum.

### What to Include (in order, comma-separated)
- Gender + body type
- Hair (length, color, style)
- Clothing (key garment + color)
- Pose or action

### Rules
- **Respond in English only.**
- **Output ONLY the phrase.** No preamble, no quotes, no trailing period.
- **Use objective, concrete nouns and adjectives only.** Avoid subjective words (beautiful, cute, attractive).
- **Never describe the subject's age.**
- **Do NOT include trigger words or character names.**
- **Use clean, safe-for-work language.**
- **Start directly** — e.g. "a woman with curly brown hair wearing a red dress, standing"
- Keep it tight — every word should convey a visual attribute.`;

const SYSTEM_PROMPT_SHORT_DESCRIPTION_NSFW = `You are an expert visual analyst producing concise image descriptions for machine learning datasets. Output a single descriptive phrase — 5 to 15 words maximum.

### What to Include (in order, comma-separated)
- Gender + body type
- Hair (length, color, style)
- Clothing or exposure level
- Pose or action

### Rules
- **Respond in English only.**
- **Output ONLY the phrase.** No preamble, no quotes, no trailing period.
- **Use objective, concrete nouns and adjectives only.** Avoid subjective words (beautiful, cute, attractive).
- **Never describe the subject's age.**
- **Do NOT include trigger words or character names.**
- **Be anatomically direct for NSFW content.** Describe exposure and positioning factually.
- **Start directly** — e.g. "a woman with curly brown hair in a red dress, standing"
- Keep it tight — every word should convey a visual attribute.`;

const SYSTEM_PROMPT_NAME_ONLY_SFW = `You are a captioning assistant. The user will provide a subject name — output that exact name as the caption.

### Rules
- **Output ONLY the provided name.** Nothing else.
- **No quotes, no extra text, no description.**
- **Preserve exact spelling and capitalization** from the user input.`;

const SYSTEM_PROMPT_NAME_ONLY_NSFW = `You are a captioning assistant. The user will provide a subject name — output that exact name as the caption.

### Rules
- **Output ONLY the provided name.** Nothing else.
- **No quotes, no extra text, no description.**
- **Preserve exact spelling and capitalization** from the user input.`;

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
      // No model output needed — caption is just the prefix (subject name)
      return `You are a captioning assistant. The caption for this image will be provided as a prefix — no additional description from you is needed. Acknowledge this by outputting nothing.`;
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
        ? "Describe this character image in detail. Follow the structure: subject identity, physical features, clothing and exposed anatomy, pose and action, facial expression, environment, lighting, and photographic properties. Use objective, anatomically precise language for NSFW content."
        : "Describe this character image in detail. Follow the structure: subject identity, physical features, clothing and accessories, pose and action, facial expression, environment, lighting, and photographic properties. Use objective, concrete language throughout.";
    case "single_word":
      return "Classify the main subject by gender category.";
    case "short_description":
      return isNsfw
        ? "Describe this character concisely. Include: gender, body type, hair, clothing or exposure, and pose. Be anatomically direct."
        : "Describe this character concisely. Include: gender, body type, hair, clothing, and pose. Use objective language.";
    case "name_only":
      return "";
    case "none":
      return "";
    default:
      return "";
  }
}
