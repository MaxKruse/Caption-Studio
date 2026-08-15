/**
 * React hook for managing the Caption Studio session state.
 * In-memory only - no persistence across page refreshes.
 */

"use client";

import { useState, useCallback, useRef, createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppMode = "for-anima" | "krea-2";

export interface SessionState {
  mode: AppMode | null;
  serverUrl: string;
  model: string;
  /** Object URLs (URL.createObjectURL) for preview - not base64. */
  images: string[];
  imageNames: string[];
  imageFiles: File[]; // raw File objects (for FormData upload)
  imageCaptions: string[]; // paired caption text (booru tags) for each image
  // Trigger words (optional, prepended to user prompt if filled)
  triggerWordPerson: string;
  triggerWordOther: string;
  // Krea 2 mode
  characterDescription: string;
  // Shared prompts (used by Krea 2 phase 1)
  systemPrompt: string;
  userPrompt: string;
  // WD Tagger (For Anima auto-tagging)
  tagMinProbability: number;
  tagMaxTags: number;
  tagEncourage: string;
  tagExclude: string;
  tagCustomTags: string; // user-defined tags (character name, artist name, etc.)
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STATE: SessionState = {
  mode: null,
  serverUrl: "",
  model: "",
  images: [],
  imageNames: [],
  imageFiles: [],
  imageCaptions: [],
  triggerWordPerson: "",
  triggerWordOther: "",
  characterDescription: "",
  systemPrompt: [
    "You are an expert at writing detailed, precise image generation prompts optimized for Krea-2 and Qwen Image models.",
    "",
    "Your task is to describe images so thoroughly that another image-generation AI could faithfully recreate them from your description alone. Write in natural, descriptive language - flowing sentences that read like rich prose, not keyword lists or comma-separated tags.",
    "",
    "Prompt structure - follow this order, weaving each section into the narrative:",
    "1. SUBJECT: Start directly with the main subject. Be specific about identity, pose, facial expression, body language, and clothing. Describe what the subject is doing.",
    "2. SCENE/ENVIRONMENT: Describe the setting, background elements, props, and objects. Ground the image in a specific place with contextual details.",
    "3. COMPOSITION/CAMERA: Specify framing (close-up, medium shot, wide shot, full-body), camera angle (eye-level, low-angle, bird's-eye, Dutch tilt), and lens characteristics if discernible (35mm, 85mm portrait lens, fisheye, macro).",
    "4. LIGHTING: Describe the light source, direction, quality, and color temperature with precision. This is the single most impactful visual variable. Include: soft diffused window light, golden hour backlight, harsh overhead fluorescent, volumetric side lighting, rim light, fill light, natural overcast.",
    "5. MOOD/ATMOSPHERE: Convey the emotional tone and atmospheric quality (melancholic, ethereal, gritty, dreamy, tense, serene, dramatic, nostalgic). Describe weather, air quality, and ambient feel.",
    "6. STYLE/MEDIUM: Note the image style (photorealistic photograph, oil painting, watercolor, digital illustration, anime, pencil sketch, cinematic still).",
    "7. DETAILS/TEXTURES: Surface details, materials, fabric types (silk, velvet, leather, denim, lace, mesh, wool, cotton, satin), weave patterns (herringbone, cable knit, ribbed, pinstripe), trim details (gold braiding, frayed hems, embroidered patches, sequin accents, piping, buttons, zippers, buckles, belts), and real-world imperfections (skin pores, fabric wrinkles, dust, weathered surfaces, natural shadows).",
    "",
    "Rules:",
    "- Be decisive. State things as facts. Never hedge with \"it appears\", \"possibly\", or \"seems to\".",
    "- No preamble, filler, or labels. Start directly with the subject.",
    "- Write in natural, descriptive prose. Use complete sentences and flowing descriptions - not tag lists or keyword stuffing.",
    "- Use specific, concrete language. Say \"crimson silk dress with gold embroidery\" not \"nice red dress\".",
    "- Include spatial relationships (foreground, midground, background, left/right, above/below).",
    "- Describe colors precisely (burgundy, slate grey, cream, olive green - not \"red\", \"grey\", \"white\", \"green\").",
    "- Include real-world imperfections to avoid plastic/CGI aesthetics (skin texture, fabric wrinkles, natural shadows).",
    "- Avoid generic quality tokens (\"8K\", \"masterpiece\", \"high quality\") - they trigger over-smoothed defaults.",
    "- Any visible text in the image should be transcribed verbatim and enclosed in double quotes.",
    "- Do not interpret, infer, or speculate about things not directly visible.",
    "- Keep the output as a single cohesive paragraph. No bullet points, no section headers, no markdown.",
  ].join("\n"),
  userPrompt:
    `Describe this image as a detailed, generation-ready prompt written in natural descriptive prose. `
    + `Address the character by name if identifiable, otherwise describe them directly. `
    + `Pay special attention to: the subject's pose, expression, and what they are doing; `
    + `the full environment and background scenery; time of day and weather; `
    + `lighting direction, quality, and color temperature (the most impactful visual element); `
    + `the overall mood and atmospheric tone; `
    + `textures, fabric types (silk, velvet, leather, lace, denim, wool, cotton, satin), `
    + `weave patterns, and trim details (braiding, embroidery, frayed edges, piping, buttons, buckles, belts). `
    + `Transcribe any visible text verbatim in double quotes. `
    + `Include positive constraints where relevant (sharp focus, clean background, correct anatomy, no watermark, no logos).`,
  tagMinProbability: 0.35,
  tagMaxTags: 50,
  tagEncourage: "",
  tagExclude: "",
  tagCustomTags: "",
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SessionContextValue {
  state: SessionState;
  setMode: (mode: AppMode | null) => void;
  setServerUrl: (serverUrl: string) => void;
  setModel: (model: string) => void;
  addImage: (file: File, name: string, caption?: string) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;
  setSystemPrompt: (systemPrompt: string) => void;
  setUserPrompt: (userPrompt: string) => void;
  setTriggerWordPerson: (triggerWordPerson: string) => void;
  setTriggerWordOther: (triggerWordOther: string) => void;
  setCharacterDescription: (characterDescription: string) => void;
  // WD Tagger
  setTagMinProbability: (v: number) => void;
  setTagMaxTags: (v: number) => void;
  setTagEncourage: (v: string) => void;
  setTagExclude: (v: string) => void;
  setTagCustomTags: (v: string) => void;
  reset: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Provider component that holds shared session state.
 * Wrap the app (or each mode subtree) with this to share state across components.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(() => ({ ...DEFAULT_STATE }));
  /** Mirrors state.images for imperative URL revocation (updaters must stay pure). */
  const imageUrlsRef = useRef<string[]>([]);

  const setMode = useCallback((mode: AppMode | null) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setServerUrl = useCallback((serverUrl: string) => {
    setState((prev) => ({ ...prev, serverUrl }));
  }, []);

  const setModel = useCallback((model: string) => {
    setState((prev) => ({ ...prev, model }));
  }, []);

  const addImage = useCallback((file: File, name: string, caption?: string) => {
    const objectUrl = URL.createObjectURL(file);
    imageUrlsRef.current = [...imageUrlsRef.current, objectUrl];
    setState((prev) => ({
      ...prev,
      images: [...prev.images, objectUrl],
      imageNames: [...prev.imageNames, name],
      imageFiles: [...prev.imageFiles, file],
      imageCaptions: [...prev.imageCaptions, caption ?? ""],
    }));
  }, []);

  const removeImage = useCallback((index: number) => {
    const url = imageUrlsRef.current[index];
    if (url) {
      URL.revokeObjectURL(url);
      imageUrlsRef.current = imageUrlsRef.current.filter((_, i) => i !== index);
    }
    setState((prev) => {
      const newImages = [...prev.images];
      const newNames = [...prev.imageNames];
      const newFiles = [...prev.imageFiles];
      const newCaptions = [...prev.imageCaptions];
      newImages.splice(index, 1);
      newNames.splice(index, 1);
      newFiles.splice(index, 1);
      newCaptions.splice(index, 1);
      return { ...prev, images: newImages, imageNames: newNames, imageFiles: newFiles, imageCaptions: newCaptions };
    });
  }, []);

  const clearImages = useCallback(() => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    imageUrlsRef.current = [];
    setState((prev) => ({ ...prev, images: [], imageNames: [], imageFiles: [], imageCaptions: [] }));
  }, []);

  const setTriggerWordPerson = useCallback((triggerWordPerson: string) => {
    setState((prev) => ({ ...prev, triggerWordPerson }));
  }, []);

  const setTriggerWordOther = useCallback((triggerWordOther: string) => {
    setState((prev) => ({ ...prev, triggerWordOther }));
  }, []);

  const setCharacterDescription = useCallback((characterDescription: string) => {
    setState((prev) => ({ ...prev, characterDescription }));
  }, []);

  const setTagMinProbability = useCallback((v: number) => {
    setState((prev) => ({ ...prev, tagMinProbability: v }));
  }, []);

  const setTagMaxTags = useCallback((v: number) => {
    setState((prev) => ({ ...prev, tagMaxTags: v }));
  }, []);

  const setTagEncourage = useCallback((v: string) => {
    setState((prev) => ({ ...prev, tagEncourage: v }));
  }, []);

  const setTagExclude = useCallback((v: string) => {
    setState((prev) => ({ ...prev, tagExclude: v }));
  }, []);

  const setTagCustomTags = useCallback((v: string) => {
    setState((prev) => ({ ...prev, tagCustomTags: v }));
  }, []);

  const setSystemPrompt = useCallback((systemPrompt: string) => {
    setState((prev) => ({ ...prev, systemPrompt }));
  }, []);

  const setUserPrompt = useCallback((userPrompt: string) => {
    setState((prev) => ({ ...prev, userPrompt }));
  }, []);

  const reset = useCallback(() => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    imageUrlsRef.current = [];
    setState({ ...DEFAULT_STATE });
  }, []);

  const value: SessionContextValue = {
    state,
    setMode,
    setServerUrl,
    setModel,
    addImage,
    removeImage,
    clearImages,
    setSystemPrompt,
    setUserPrompt,
    setTriggerWordPerson,
    setTriggerWordOther,
    setCharacterDescription,
    setTagMinProbability,
    setTagMaxTags,
    setTagEncourage,
    setTagExclude,
    setTagCustomTags,
    reset,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the shared session state. Must be used within a SessionProvider.
 */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
