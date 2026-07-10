/**
 * React hook for managing the Caption Studio session state.
 * In-memory only - no persistence across page refreshes.
 */

"use client";

import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppMode = "simple" | "multi-step";

export interface SessionState {
  mode: AppMode | null;
  serverUrl: string;
  model: string;
  images: string[]; // base64 data URLs
  imageNames: string[];
  // Trigger words (optional, prepended to user prompt if filled)
  triggerWordPerson: string;
  triggerWordOther: string;
  // Simple mode
  systemPrompt: string;
  userPrompt: string;
  // Multi-step mode
  multiStepMessages: string[]; // user messages in order
  multiStepSystemPrompt: string;
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
  triggerWordPerson: "",
  triggerWordOther: "",
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
  multiStepMessages: [
    "Analyze this image and list every distinct visual element you detect. For each element, provide a short label and a confidence score from 0.0 to 1.0 reflecting how clearly and prominently it appears. Include: subjects and their actions, facial expressions, body language, clothing and accessories, fabric types and textures, objects and props, background features and setting, lighting sources and quality, mood and atmosphere, composition and camera angle, color palette, visible text, weather, and environmental details. Be thorough - list even minor elements. Format each entry as: \"LABEL | confidence: X.X\". One element per line.",
    "Now write a single, cohesive image generation prompt using ONLY the elements with confidence scores above 0.4. Write in natural, descriptive prose - flowing sentences, not tags or keyword lists. Describe in this order: main subject(s) and their actions first, then clothing/appearance with fabric and texture details, then environment/background, then composition/camera, then lighting (be specific about source, direction, quality, and color), then mood/atmosphere, then style/medium, then fine details and textures. Use precise, concrete language. Be decisive - no hedging. Start directly with the subject. Enclose any visible text in double quotes. Output a single paragraph with no labels, no scores, no bullet points, no markdown.",
  ],
  multiStepSystemPrompt: [
    "You are a vision analysis and image prompt engineering expert, specializing in prompts for Krea-2 and Qwen Image generation models.",
    "",
    "When asked to analyze an image:",
    "- Detect and label every distinct visual element.",
    "- Assign honest confidence scores (0.0-1.0) based on how clearly and prominently each element appears.",
    "- Be thorough: include subjects, actions, poses, expressions, body language, clothing, accessories, props, background, setting, lighting sources and quality, mood, atmosphere, weather, composition, camera angle, color palette, visible text, textures, and fabric details.",
    "- Note textures, fabric types and structures (silk, velvet, leather, lace, denim, wool, cotton, satin, mesh), weave patterns (herringbone, cable knit, ribbed), and trim details (braiding, embroidery, frayed hems, piping, buttons, zippers, buckles, belts).",
    "",
    "When asked to write a generation prompt:",
    "- Use only high-confidence elements (above the stated threshold).",
    "- Follow the structure: subject -> scene/environment -> composition/camera -> lighting -> mood/atmosphere -> style/medium -> details/textures.",
    "- Write in natural, descriptive prose. Use flowing sentences - not comma-separated tags or keyword lists.",
    "- Lighting is the most impactful visual variable - describe it with precision (source, direction, quality, color temperature).",
    "- Use precise, concrete language. Describe textures, fabric structures, and trim details (e.g. \"velvet cape with gold braided trim\", \"denim jacket with frayed hem\"). Avoid vague adjectives and generic quality tokens.",
    "- Enclose any visible text in double quotes.",
    "- Output a single cohesive paragraph. No preamble, no labels, no scores, no markdown.",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSession() {
  const [state, setState] = useState<SessionState>(() => ({ ...DEFAULT_STATE }));

  const setMode = useCallback((mode: AppMode | null) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setServerUrl = useCallback((serverUrl: string) => {
    setState((prev) => ({ ...prev, serverUrl }));
  }, []);

  const setModel = useCallback((model: string) => {
    setState((prev) => ({ ...prev, model }));
  }, []);

  const addImage = useCallback((dataUrl: string, name: string) => {
    setState((prev) => ({
      ...prev,
      images: [...prev.images, dataUrl],
      imageNames: [...prev.imageNames, name],
    }));
  }, []);

  const removeImage = useCallback((index: number) => {
    setState((prev) => {
      const newImages = [...prev.images];
      const newNames = [...prev.imageNames];
      newImages.splice(index, 1);
      newNames.splice(index, 1);
      return { ...prev, images: newImages, imageNames: newNames };
    });
  }, []);

  const clearImages = useCallback(() => {
    setState((prev) => ({ ...prev, images: [], imageNames: [] }));
  }, []);

  const setTriggerWordPerson = useCallback((triggerWordPerson: string) => {
    setState((prev) => ({ ...prev, triggerWordPerson }));
  }, []);

  const setTriggerWordOther = useCallback((triggerWordOther: string) => {
    setState((prev) => ({ ...prev, triggerWordOther }));
  }, []);

  const setSystemPrompt = useCallback((systemPrompt: string) => {
    setState((prev) => ({ ...prev, systemPrompt }));
  }, []);

  const setUserPrompt = useCallback((userPrompt: string) => {
    setState((prev) => ({ ...prev, userPrompt }));
  }, []);

  const setMultiStepSystemPrompt = useCallback((prompt: string) => {
    setState((prev) => ({ ...prev, multiStepSystemPrompt: prompt }));
  }, []);

  const setMultiStepMessages = useCallback((messages: string[]) => {
    setState((prev) => ({ ...prev, multiStepMessages: messages }));
  }, []);

  const updateMultiStepMessage = useCallback((index: number, content: string) => {
    setState((prev) => {
      const msgs = [...prev.multiStepMessages];
      msgs[index] = content;
      return { ...prev, multiStepMessages: msgs };
    });
  }, []);

  const addMultiStepMessage = useCallback((content: string = "") => {
    setState((prev) => ({
      ...prev,
      multiStepMessages: [...prev.multiStepMessages, content],
    }));
  }, []);

  const removeMultiStepMessage = useCallback((index: number) => {
    setState((prev) => {
      const msgs = [...prev.multiStepMessages];
      msgs.splice(index, 1);
      return { ...prev, multiStepMessages: msgs };
    });
  }, []);

  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE });
  }, []);

  return {
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
    setMultiStepSystemPrompt,
    setMultiStepMessages,
    updateMultiStepMessage,
    addMultiStepMessage,
    removeMultiStepMessage,
    reset,
  };
}
