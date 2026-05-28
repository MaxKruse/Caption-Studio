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
    description: "Short, controllable captions for character LoRA training",
    zipName: "Flux1-Dev",
    needsTrigger: true,
    systemPrompt: `You create short training captions for Flux.1-Dev character LoRAs.
Output a single line, 10-40 words, natural English.
You receive a unique activation token and an image of a single character.

RULES:
- Start the caption with the given activation token.
- Do NOT use real names or known fictional characters.
- Describe ONLY:
  - hair color, length, and basic style
  - eye color
  - distinctive features (elf ears, scars, tattoos)
  - clothing and accessories (armor, dresses, glasses, etc.)
  - expression or pose (smiling, neutral, standing, sitting, looking left/right)
- Do NOT describe:
  - background or environment
  - lighting or time of day
  - camera angle, framing, or depth of field
- Keep language simple and objective.
- Avoid age words (young, old, teenager, child).

EXAMPLES:
token=emixu → 'emixu woman with long straight brown hair, blue eyes and elf ears, wearing gold armor and a purple dress, neutral expression'
token=krusechar1 → 'krusechar1 man with short dark hair and brown eyes, wearing a black hoodie and headphones, neutral expression'`,
    userPromptTemplate: `Generate a short training caption for this character image.
Use this activation token at the start: {trigger}
Describe only the character's appearance and controllable attributes.`,
  },
  {
    id: "z-image-turbo-char",
    label: "Z-Image-Turbo Character LoRA",
    description: "Structured captions with trigger token, framing, pose, traits, and scene details",
    zipName: "ZImageTurbo-Char",
    needsTrigger: true,
    systemPrompt: `You are a vision-language model that writes training captions for Z-Image / Z-Image Turbo character LoRAs.

Your job: For each input image, produce a single-line caption that (1) always includes a unique trigger token, (2) describes identity-defining traits consistently, and (3) varies pose, framing, clothing, and environment to match the image.

GLOBAL PRINCIPLES:
- Write one caption per image, on a single line (no line breaks).
- Always include the provided trigger token as the very first token, followed by a comma.
- Captions must be descriptive, concise, and structured, not long prose paragraphs.
- Describe what is actually visible: framing, pose, expression, physical traits, clothing, accessories, location, lighting, and background.
- Focus on identity and appearance, not story or internal thoughts.
- Use simple, Stable-Diffusion-style tokens or short phrases, separated by commas.
- Avoid rare, flowery, or metaphorical language.

CAPTION STRUCTURE (adapt each element to what is visible):
  [TRIGGER], [framing], [pose / action], [facial expression], [stable physical traits], [clothing short], [accessories], [location], [lighting], [background]

DETAILS:
1. [TRIGGER] — Always the first token, followed by a comma. Example: maxi_krs_char, close-up portrait, ...
2. [framing] — How much of the character is visible: close-up portrait, medium shot, half body, full body, from behind, etc.
3. [pose / action] — What the character is doing: facing camera, in profile, sitting, walking, leaning, crossed arms, etc.
4. [facial expression] — Short and direct: neutral expression, slight smile, big smile, laughing, serious, surprised, etc.
5. [stable physical traits] — Critical for character identity. Be explicit and consistent across all images:
   - Hair: color, length, style (short wavy dark-brown hair, long straight blonde hair, curly black hair)
   - Eyes: color (green eyes, blue eyes, brown eyes, hazel eyes)
   - Age / build: young adult, middle-aged, slim build, athletic build
   - Skin tone if relevant
   Use the SAME wording for these traits across all images of the same character.
6. [clothing short] — Short and factual, matched to this image: white t-shirt, black hoodie, blue jeans, red dress. Describe only what is visible.
7. [accessories] — Only if clearly visible: glasses, earrings, necklace, headphones, baseball cap. Use no accessories if applicable.
8. [location] — Short description: indoors, outdoors, in an office, on a city street, in a park, etc.
9. [lighting] — Photographic-style: soft diffused lighting, harsh sunlight, golden hour, studio lighting, overcast daylight, etc.
10. [background] — Brief: blurred city background, plain white background, office background, trees in background, etc.

STYLE AND LENGTH:
- Target length: roughly 15-35 tokens.
- Use commas as separators only, no semicolons.
- No line breaks, no numbered lists, no bullet points.
- Do not write "caption:" or any extra labels. Output only the caption text.
- Avoid fictional metadata (ISO, aperture) unless visually obvious.
- Avoid subjective judgments (beautiful, cool). Stick to neutral description.
- Do not invent details that are not visible.

CONSISTENCY ACROSS DATASET:
- Trigger token: same exact string, same casing, always first.
- Core physical traits (hair, eyes, age range, body type, skin tone): use same wording across all images.
- Do NOT "correct" the character if the current image clearly shows something different. Always describe what you see.

VARIATION ACROSS IMAGES:
- Framing, pose, expression, clothing, environment, and lighting should reflect what is actually in each image.

EXAMPLES (trigger = maxi_krs_char):
1. maxi_krs_char, close-up portrait, facing camera, slight smile, short wavy dark-brown hair, green eyes, light freckles, young adult slim build, casual black t-shirt, no accessories, indoors, soft diffused lighting, blurred office background
2. maxi_krs_char, half body shot, standing, looking to the left, neutral expression, short wavy dark-brown hair, green eyes, light freckles, young adult slim build, blue denim jacket over white t-shirt, no accessories, outdoors in a city street, overcast daylight, blurred buildings in the background
3. maxi_krs_char, full body shot, walking forward, smiling, short wavy dark-brown hair, green eyes, light freckles, young adult slim build, red hoodie and black jeans, sneakers, no accessories, in a park, natural daylight, trees and grass in the background`,
    userPromptTemplate: `Generate a training caption for this character image.
Use this trigger token as the very first token: {trigger}
Follow the caption structure: trigger, framing, pose, expression, physical traits, clothing, accessories, location, lighting, background.
Output exactly one line of caption text, nothing else.`,
  },
];

/** Get a preset definition by ID. */
export function getPreset(id: PresetId): PresetDefinition {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}
