/**
 * Client-side session management using localStorage.
 * Persists mode selection, server config, images, and prompts across navigations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppMode = "simple" | "multi-step";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface SessionState {
  mode: AppMode | null;
  serverUrl: string;
  model: string;
  images: string[]; // base64 data URLs
  imageNames: string[];
  // Simple mode
  systemPrompt: string;
  userPrompt: string;
  // Multi-step mode
  multiStepMessages: string[]; // user messages in order
  multiStepSystemPrompt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "caption-studio-session";

const DEFAULT_STATE: SessionState = {
  mode: null,
  serverUrl: "",
  model: "",
  images: [],
  imageNames: [],
  systemPrompt: ["You are an expert at writing detailed, precise image generation prompts for high-fidelity models like QwenImage and KREA.",
    "",
    "Your task is to describe images so thoroughly that another image-generation AI could faithfully recreate them from your description alone.",
    "",
    "Prompt structure - follow this order:",
    "1. SUBJECT: Start directly with the main subject. Be specific about identity, pose, expression, and clothing.",
    "2. STYLE/MEDIUM: Note the image style (photorealistic, painting, digital art, anime, sketch, etc.).",
    "3. ENVIRONMENT: Describe the setting, background elements, and any props or objects.",
    "4. COMPOSITION/CAMERA: Specify framing (close-up, medium shot, wide shot), camera angle (eye-level, low-angle, bird's-eye), and lens if discernible (35mm, 85mm, fisheye).",
    "5. LIGHTING: Describe light source, direction, quality, and color temperature (golden hour backlight, soft diffused window light, harsh overhead fluorescent).",
    "6. DETAILS/TEXTURES: Surface details, materials, and real-world imperfections (skin pores, fabric wear, dust, weathered surfaces).",
    "7. FABRIC/TRIM: Describe fabric types and structures (silk, velvet, leather, denim, lace, mesh, wool, cotton, satin), weave patterns (herringbone, cable knit, ribbed, pinstripe), and trim details (gold braiding, frayed hems, embroidered patches, sequin accents, piping, buttons, zippers, buckles, belts, sashes).",
    "",
    "Rules:",
    "- Be decisive. State things as facts. Never hedge with \"it appears\", \"possibly\", or \"seems to\".",
    "- No preamble, filler, or labels. Start directly with the subject.",
    "- Use specific, concrete language. Say \"crimson silk dress with gold embroidery\" not \"nice red dress\".",
    "- Include spatial relationships (foreground, midground, background, left/right, above/below).",
    "- Describe colors precisely (burgundy, slate grey, cream, olive green - not \"red\", \"grey\", \"white\", \"green\").",
    "- Include real-world imperfections to avoid plastic/CGI aesthetics (skin texture, fabric wrinkles, natural shadows).",
    "- Avoid generic quality tokens (\"8K\", \"masterpiece\", \"high quality\") - they trigger over-smoothed defaults.",
    "- Do not interpret, infer, or speculate about things not directly visible.",
    "- Keep the output as a single cohesive paragraph. No bullet points, no section headers.",
  ].join("\n"),
  userPrompt:
    `Caption this image as a generation-ready prompt. `
    + `Address the character by name, "[NAME HERE IF NEEDED]". `
    + `Pay special attention to elements NOT directly part of the character: `
    + `background scenery, scene composition, time of day, lighting direction and quality, `
    + `weather, environmental mood, and any contextual details that ground the image in a specific setting. `
    + `Describe textures, fabric types and structures (silk, velvet, leather, lace, denim, wool), and trim details (braiding, embroidery, frayed edges, piping, buttons, buckles, belts). `
    + `Include hard constraints where relevant (no watermark, no logos, no text overlays).`,
  multiStepMessages: [
    "Analyze this image and list every distinct visual element you detect. For each element, provide a short label and a confidence score from 0.0 to 1.0 reflecting how clearly and prominently it appears. Include subjects, clothing, objects, background features, lighting sources, text, and environmental details. Be thorough - list even minor elements. Format each entry as: \"LABEL | confidence: X.X\". One element per line.",
    "Now write a single, cohesive image generation prompt using ONLY the elements with confidence scores above 0.4. Describe them in this order: main subject(s) first, then clothing/appearance, then environment/background, then composition/camera, then lighting, then textures/details. Use specific, concrete language. Be decisive - no hedging. Start directly with the subject. Output a single paragraph with no labels, no scores, no bullet points.",
  ],
  multiStepSystemPrompt: ["You are a vision analysis and image prompt engineering expert.",
    "",
    "When asked to analyze an image:",
    "- Detect and label every distinct visual element.",
    "- Assign honest confidence scores (0.0-1.0) based on how clearly and prominently each element appears.",
    "- Be thorough: include subjects, clothing, poses, expressions, props, background, lighting, weather, and composition.",
    "- Note textures, fabric types and structures (silk, velvet, leather, lace, denim, wool, cotton, satin, mesh), weave patterns (herringbone, cable knit, ribbed), and trim details (braiding, embroidery, frayed hems, piping, buttons, zippers, buckles, belts).",
    "",
    "When asked to write a generation prompt:",
    "- Use only high-confidence elements (above the stated threshold).",
    "- Follow the structure: subject -> style -> environment -> composition -> lighting -> details.",
    "- Use precise, concrete language. Describe textures, fabric structures, and trim details (e.g. \"velvet cape with gold braided trim\", \"denim jacket with frayed hem\"). Avoid vague adjectives and generic quality tokens.",
    "- Output a single cohesive paragraph. No preamble, no labels, no scores.",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load the session from localStorage. Returns default state if none exists. */
export function loadSession(): SessionState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Save the current session to localStorage. */
export function saveSession(state: SessionState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or private mode - silently ignore
  }
}

/** Clear the session from localStorage. */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Update specific fields of the session. */
export function updateSession(partial: Partial<SessionState>): SessionState {
  const current = loadSession();
  const updated = { ...current, ...partial };
  saveSession(updated);
  return updated;
}
