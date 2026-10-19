/**
 * MOSS-Image caption mode: prompt builder and output parser.
 *
 * Implements the recaptioning approach from the MOSS-Image user guide
 * (post-training section): the VLM returns exactly one JSON object with
 * long/medium/short captions, watermark boxes (normalized 0-1000
 * coordinates), and borders. The output is the caption format used to
 * post-train MOSS-Image-Base.
 */

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * The recaptioner prompt from the MOSS-Image user guide, minus its
 * reference-caption section: grounding (subject description and/or the
 * per-image reference caption) is appended by `buildMossCaptionPrompt`
 * only when present, so the prompt never carries a dangling "reference:
 * (none)" line.
 */
export const MOSS_CAPTION_PROMPT = `You are an image recaptioner. Return exactly one JSON object with this schema:
{
  "caption": {
    "long": "a detailed image description, including all non-watermark visible text",
    "medium": "a one-paragraph image description",
    "short": "a one-sentence image description"
  },
  "watermark": [
    {"box_2d": [y_min, x_min, y_max, x_max], "label": "watermark text"}
  ],
  "borders": ["none"]
}

Rules:
- caption.long:
    - Describe the composition, key subjects, actions, setting, colors, lighting, and artistic style in detail. Include only information visible in the image.
    - Preserve visible text exactly, excluding watermarks. Do not translate, paraphrase, romanize, or normalize image text.
    - Describe text layout as much as possible: line breaks, ordering, relative position, alignment, size hierarchy, font/style, color, spacing, and how text blocks are arranged.
- caption.medium: compress long into one paragraph.
- caption.short: summarize the main subject, action, or relationship in one sentence.
- Do not describe watermarks in any caption field. Record them only in watermark.
- watermark:
    - Use normalized 0-1000 [y_min, x_min, y_max, x_max] coordinates relative to the full image.
    - Set label to the visible watermark text, or a short description if unreadable.
    - Use [] if there are no watermarks.
- borders:
    - Record evident borders or margins using one or more of "left", "right", "up", and "down".
    - Use ["none"] if there are no evident borders or margins. Do not combine "none" with other directions.
- All three caption fields must be non-empty strings.
- Return only the JSON object, without Markdown or explanations.`;

/**
 * Build the per-image caption prompt: the base recaptioner prompt plus
 * optional grounding sections, appended only when present:
 *
 * - `subjectDescription` (batch-level): what the subject in the images
 *   is, so the model can name and describe it consistently.
 * - `reference` (per-image original caption): the guide's "treat it as
 *   a reference, correct unsupported claims" instruction travels with it.
 */
export function buildMossCaptionPrompt(
  subjectDescription: string,
  reference: string
): string {
  let prompt = MOSS_CAPTION_PROMPT;
  const subject = subjectDescription.trim();
  if (subject) {
    prompt += `\n\nThe subject in the image is: ${subject}`;
  }
  const ref = reference.trim();
  if (ref) {
    prompt += `\n\nHere is the original caption for this image:\n${ref}\nTreat the original caption as a reference. Correct any claims that are not supported by the image.`;
  }
  return prompt;
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/** A watermark: normalized 0-1000 box plus its visible text. */
export interface MossWatermark {
  /** [y_min, x_min, y_max, x_max] in 0-1000 coordinates relative to the full image. */
  box_2d: number[];
  /** The visible watermark text, or a short description if unreadable. */
  label: string;
}

/** The MOSS-Image caption object (the post-training caption format). */
export interface MossCaption {
  caption: { long: string; medium: string; short: string };
  watermark: MossWatermark[];
  borders: string[];
}

/**
 * Parse and validate a recaptioner response.
 *
 * The model is instructed to return bare JSON, but VLMs occasionally wrap
 * it in markdown fences or add prose. The JSON object is located between
 * the first `{` and last `}` and validated structurally.
 *
 * @returns `parsed` - the validated caption, or null when the output is
 *          not a valid MOSS caption object; `normalized` - pretty-printed
 *          JSON when valid, otherwise the trimmed raw output (so a
 *          non-conforming response is still saved rather than lost).
 */
export function parseMossCaption(raw: string): {
  parsed: MossCaption | null;
  normalized: string;
} {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { parsed: null, normalized: trimmed };
  }

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return { parsed: null, normalized: trimmed };
  }

  const parsed = validateMossCaption(obj);
  return {
    parsed,
    normalized: parsed ? JSON.stringify(parsed, null, 2) : trimmed,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWatermark(value: unknown): value is MossWatermark {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const w = value as Record<string, unknown>;
  return (
    Array.isArray(w.box_2d) &&
    w.box_2d.length === 4 &&
    w.box_2d.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    typeof w.label === "string"
  );
}

/**
 * Structural validation of a MOSS caption object. Vocabulary (e.g. which
 * border directions appear) is NOT enforced - the model may be wrong
 * about values, but a structurally broken object is unusable as training
 * data and must be reported as such.
 */
function validateMossCaption(obj: unknown): MossCaption | null {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;

  const caption = o.caption;
  if (typeof caption !== "object" || caption === null || Array.isArray(caption)) return null;
  const c = caption as Record<string, unknown>;
  if (!isNonEmptyString(c.long) || !isNonEmptyString(c.medium) || !isNonEmptyString(c.short)) {
    return null;
  }

  if (!Array.isArray(o.watermark) || !o.watermark.every(isWatermark)) return null;
  if (!Array.isArray(o.borders) || !o.borders.every((b) => typeof b === "string")) return null;

  return {
    caption: { long: c.long, medium: c.medium, short: c.short },
    watermark: o.watermark as MossWatermark[],
    borders: o.borders as string[],
  };
}
