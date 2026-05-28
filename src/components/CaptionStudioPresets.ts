// ---------------------------------------------------------------------------
// Preset definitions — one per model type
// Each preset carries its own system prompt, user prompt template, and field requirements.
// ---------------------------------------------------------------------------

export type PresetId = "flux1-dev";

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
];

/** Get a preset definition by ID. */
export function getPreset(id: PresetId): PresetDefinition {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}
