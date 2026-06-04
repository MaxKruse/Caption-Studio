// ---------------------------------------------------------------------------
// Bounding box normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a bounding box entry to the internal `bbox_2d: [xmin, ymin, xmax, ymax]` format.
 *
 * Handles three formats:
 * - Gemma format (primary): `box_2d` with `[ymin, xmin, ymax, xmax]` (y-first) — swap to x-first
 * - OpenAI / Qwen format: `bbox_2d` with `[xmin, ymin, xmax, ymax]` (x-first) — pass through
 * - Legacy `bbox_2d` with y-first (old Gemma handling): same swap as above
 *
 * All use 0–1000 normalized coordinates. If image dimensions are provided and coordinates
 * exceed 1000 (absolute pixel coords from Qwen), they are normalized to 0–1000.
 */
function normalizeBoxEntry(
  entry: Record<string, unknown>,
  imageWidth?: number,
  imageHeight?: number
): {
  bbox_2d: [number, number, number, number];
  label: string;
  confidence: number;
} | null {
  const rawConfidence = entry.confidence;
  const confidence =
    typeof rawConfidence === "number" && !Number.isNaN(rawConfidence)
      ? Math.max(0, Math.min(1, rawConfidence))
      : 0.5;
  const label = (entry.label as string) ?? "unknown";

  // Gemma format: `box_2d` with [ymin, xmin, ymax, xmax]
  if ("box_2d" in entry && Array.isArray(entry.box_2d) && entry.box_2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = entry.box_2d as [number, number, number, number];
    return {
      bbox_2d: normalizeCoords(xmin, ymin, xmax, ymax, imageWidth, imageHeight),
      label,
      confidence,
    };
  }

  // OpenAI / Qwen format: `bbox_2d` with [xmin, ymin, xmax, ymax]
  if ("bbox_2d" in entry && Array.isArray(entry.bbox_2d) && entry.bbox_2d.length === 4) {
    const [xmin, ymin, xmax, ymax] = entry.bbox_2d as [number, number, number, number];
    return {
      bbox_2d: normalizeCoords(xmin, ymin, xmax, ymax, imageWidth, imageHeight),
      label,
      confidence,
    };
  }

  return null;
}

/**
 * Normalize coordinates to 0–1000 scale.
 * If any coordinate exceeds 1000 and image dimensions are available,
 * treat them as absolute pixel coordinates and normalize.
 */
function normalizeCoords(
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
  imageWidth?: number,
  imageHeight?: number
): [number, number, number, number] {
  const maxCoord = Math.max(Math.abs(xmin), Math.abs(ymin), Math.abs(xmax), Math.abs(ymax));

  // Already in 0–1000 range — pass through
  if (maxCoord <= 1000) {
    return [xmin, ymin, xmax, ymax];
  }

  // Coordinates exceed 1000 — likely absolute pixel values.
  // Normalize to 0–1000 using image dimensions.
  if (imageWidth && imageHeight) {
    return [
      (xmin / imageWidth) * 1000,
      (ymin / imageHeight) * 1000,
      (xmax / imageWidth) * 1000,
      (ymax / imageHeight) * 1000,
    ];
  }

  // No dimensions available — return as-is (will likely be wrong, but can't fix)
  return [xmin, ymin, xmax, ymax];
}

// ---------------------------------------------------------------------------
// Label classification for flat array format
// ---------------------------------------------------------------------------

/** Keywords that indicate a face/head detection. Checked in order of specificity. */
export const FACE_KEYWORDS = [
  "face",
  "head",
  "portrait",
  "face close-up",
  "face shot",
  "headshot",
  "close-up",
  "close up",
];

/** Keywords that indicate a body/full-body detection. */
export const BODY_KEYWORDS = [
  "body",
  "full body",
  "full-body",
  "person",
  "figure",
  "pose",
  "torso",
  "man",
  "woman",
  "girl",
  "boy",
  "child",
  "kid",
  "adult",
  "male",
  "female",
  "standing",
  "sitting",
];

/**
 * Classify a label string as "face", "body", or "unknown".
 * Used when the model returns a flat array of detections without explicit category grouping.
 */
export function classifyLabel(label: string): "face" | "body" | "unknown" {
  const lower = label.toLowerCase().trim();
  for (const keyword of FACE_KEYWORDS) {
    if (lower.includes(keyword)) return "face";
  }
  for (const keyword of BODY_KEYWORDS) {
    if (lower.includes(keyword)) return "body";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Balanced bracket extraction
// ---------------------------------------------------------------------------

/**
 * Extract a balanced bracket/brace structure from a string starting at a given index.
 * Handles nested brackets/braces and strings (ignores brackets inside quoted strings).
 */
export function extractBalanced(
  str: string,
  startIndex: number,
  openChar: string,
  closeChar: string
): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i];

    // Handle string escaping
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }

    // Skip characters inside strings
    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return str.substring(startIndex, i + 1);
      }
    }
  }

  return null; // Unbalanced
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/** Optional image dimensions for normalizing absolute pixel coordinates. */
interface DetectionImageDimensions {
  width: number;
  height: number;
}

/**
 * Parse the model's detection response into face and body bounding box arrays.
 *
 * Handles three response shapes:
 * 1. **Flat JSON array** (Gemma 4 native): `[{box_2d: [...], label: "face"}, ...]`
 *    — sorted into faces/bodies by label classification
 * 2. **Object with faces/bodies arrays** (legacy): `{faces: [...], bodies: [...]}`
 * 3. **Markdown code blocks** wrapping either format
 *
 * Normalizes both `box_2d` (y-first) and `bbox_2d` (x-first) coordinate formats.
 * Defaults confidence to 0.5 when missing.
 * If image dimensions are provided, absolute pixel coordinates (>1000) are normalized to 0–1000.
 */
export function parseDetectionResponse(
  content: string,
  imageDims?: DetectionImageDimensions
): {
  faceBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
  bodyBoxes: Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }>;
} {
  if (!content) {
    return { faceBoxes: [], bodyBoxes: [] };
  }

  // Try to extract JSON from markdown code blocks
  let jsonStr = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try parsing the string as-is first (works for clean JSON)
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If it fails, try to extract a JSON structure from surrounding text.
    // Use bracket-matching to find the outermost JSON object or array.
    parsed = null;

    const firstBracket = jsonStr.indexOf("[");
    const firstBrace = jsonStr.indexOf("{");

    // Determine which structure comes first:
    // - If `[` comes first (or there's no `{`), it's a flat array
    // - If `{` comes first (and before any `[`), it's a legacy object
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      const extracted = extractBalanced(jsonStr, firstBracket, "[", "]");
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch { /* fall through */ }
      }
    }

    if (!parsed && firstBrace !== -1) {
      const extracted = extractBalanced(jsonStr, firstBrace, "{", "}");
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch { /* fall through */ }
      }
    }

    if (!parsed) {
      return { faceBoxes: [], bodyBoxes: [] };
    }
  }

  if (!parsed) {
    return { faceBoxes: [], bodyBoxes: [] };
  }

  const imageWidth = imageDims?.width;
  const imageHeight = imageDims?.height;

  const parseBoxArray = (
    arr: unknown[]
  ): Array<{ bbox_2d: [number, number, number, number]; label: string; confidence: number }> => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((b: unknown): b is Record<string, unknown> => b != null && typeof b === "object")
      .map((b) => normalizeBoxEntry(b, imageWidth, imageHeight))
      .filter((b): b is NonNullable<typeof b> => b !== null);
  };

  // Case 1: Flat JSON array (Gemma 4 native format)
  if (Array.isArray(parsed)) {
    const allBoxes = parseBoxArray(parsed);
    return {
      faceBoxes: allBoxes.filter((b) => classifyLabel(b.label) === "face"),
      bodyBoxes: allBoxes.filter((b) => classifyLabel(b.label) === "body"),
    };
  }

  // Case 2: Object with faces/bodies arrays (legacy format)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      faceBoxes: parseBoxArray((parsed as Record<string, unknown>).faces as unknown[] ?? []),
      bodyBoxes: parseBoxArray((parsed as Record<string, unknown>).bodies as unknown[] ?? []),
    };
  }

  return { faceBoxes: [], bodyBoxes: [] };
}
