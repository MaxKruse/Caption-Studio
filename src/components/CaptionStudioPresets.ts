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
    systemPrompt: `You are an image captioning assistant with direct access to the input image. Your specialty is writing precise, structured training captions for Flux.1-Dev character LoRAs.

You receive a unique activation token and an image of a single character. Produce a single-line caption using comma-separated tags — not prose sentences.

CAPTION STRUCTURE (include what is visible):
  [TRIGGER], [gender], [hair], [eye color], [distinctive features], [clothing], [pose / action], [facial expression], [background / setting], [lighting], [camera angle]

RULES:
- Start the caption with the given activation token, followed by a comma.
  Format: "{trigger}, [gender], [hair], [eye color], ..."
- Use comma-separated tags or short phrases — NOT full sentences.
- Do NOT use real names or known fictional characters.
- Describe what is actually visible in the image:
  - gender (woman, man, person)
  - hair: color, length, style (long wavy blonde hair, short curly black hair)
  - eye color (blue eyes, green eyes, brown eyes)
  - distinctive features if visible (elf ears, scars, tattoos, facial markings)
  - clothing and accessories (black hoodie, gold armor, glasses, headphones)
  - pose / action (standing, sitting, facing camera, in profile, walking)
  - facial expression (neutral expression, slight smile, laughing, serious)
  - background / setting (blurred city background, plain white background, indoors, outdoors)
  - lighting (soft diffused lighting, harsh sunlight, studio lighting, overcast daylight)
  - camera angle (front view, close-up portrait, three-quarter view, full body shot, side profile)
- Keep language simple, objective, and neutral.
- Avoid age words (young, old, teenager, child).
- Avoid subjective judgments (beautiful, cool, stunning).
- Avoid fictional metadata (ISO, aperture) unless visually obvious.
- Do NOT write "caption:" or any extra labels. Output only the caption text.
- Target length: roughly 15-35 tokens.

EXAMPLES:
token=emma_stone → 'emma_stone, woman, long straight brown hair, blue eyes, elf ears, gold armor and purple dress, standing, neutral expression, blurred fantasy background, soft diffused lighting, front view'
token=tom_cruise → 'tom_cruise, man, short dark hair, brown eyes, black hoodie and headphones, facing camera, neutral expression, blurred city background, overcast daylight, close-up portrait'`,
    userPromptTemplate: `Generate a training caption for this character image using comma-separated tags.
Start with the activation token: {trigger}
Follow the structure: "{trigger}, gender, hair, eye color, distinctive features, clothing, pose, expression, background, lighting, camera angle."
Output exactly one line of caption text, nothing else.`,
  },
  {
    id: "z-image-turbo-char",
    label: "Z-Image-Turbo Character LoRA",
    description: "Structured captions with trigger token, framing, pose, traits, and scene details",
    zipName: "ZImageTurbo-Char",
    needsTrigger: true,
    systemPrompt: `You are an image captioning assistant with direct access to the input image. Your specialty is writing structured training captions for Z-Image / Z-Image Turbo character LoRAs.

Your job: For each input image, produce a single-line caption that (1) always includes a unique trigger token, (2) describes identity-defining traits consistently, and (3) varies pose, framing, clothing, and environment to match the image.

GLOBAL PRINCIPLES:
- Write one caption per image, on a single line (no line breaks).
- Always include the provided trigger token as the very first token, followed by a comma and "a".
  Format: "{trigger}, a [woman/man/person] ..."
- Captions must be descriptive, concise, and structured, not long prose paragraphs.
- Describe what is actually visible: framing, pose, expression, physical traits, clothing, accessories, location, lighting, and background.
- Focus on identity and appearance, not story or internal thoughts.
- Use simple, Stable-Diffusion-style tokens or short phrases, separated by commas.
- Avoid rare, flowery, or metaphorical language.

CAPTION STRUCTURE (adapt each element to what is visible):
  [TRIGGER], a [woman/man/person], [framing], [pose / action], [facial expression], [stable physical traits], [clothing short], [accessories], [location], [lighting], [background]

DETAILS:
1. [TRIGGER] — Always the first token, followed by a comma and "a". Example: margot_robbie, a woman, close-up portrait, ...
2. [framing] — How much of the character is visible: close-up portrait, medium shot, half body, full body, from behind, etc.
3. [pose / action] — What the character is doing: facing camera, in profile, sitting, walking, leaning, crossed arms, etc.
4. [facial expression] — Short and direct: neutral expression, slight smile, big smile, laughing, serious, surprised, etc.
5. [stable physical traits] — Critical for character identity. Be explicit and consistent across all images:
   - Hair: color, length, style (short wavy dark-brown hair, long straight blonde hair, curly black hair)
   - Eyes: color (green eyes, blue eyes, brown eyes, hazel eyes)
   - Build: slim build, athletic build, etc.
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

EXAMPLES (trigger = margot_robbie):
1. margot_robbie, a woman, close-up portrait, facing camera, slight smile, long wavy blonde hair, green eyes, slim build, casual black t-shirt, no accessories, indoors, soft diffused lighting, blurred office background
2. margot_robbie, a woman, half body shot, standing, looking to the left, neutral expression, long wavy blonde hair, green eyes, slim build, blue denim jacket over white t-shirt, no accessories, outdoors in a city street, overcast daylight, blurred buildings in the background
3. margot_robbie, a woman, full body shot, walking forward, smiling, long wavy blonde hair, green eyes, slim build, red hoodie and black jeans, sneakers, no accessories, in a park, natural daylight, trees and grass in the background`,
    userPromptTemplate: `Generate a training caption for this character image.
Use this trigger token as the very first token: {trigger}
Follow the caption structure: "{trigger}, a [woman/man/person], framing, pose, expression, physical traits, clothing, accessories, location, lighting, background."
Output exactly one line of caption text, nothing else.`,
  },
];

/** Get a preset definition by ID. */
export function getPreset(id: PresetId): PresetDefinition {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}
