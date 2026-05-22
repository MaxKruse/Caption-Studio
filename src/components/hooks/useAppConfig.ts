import { useCallback, useEffect, useRef, useState } from "react";

import type { ToastState } from "../CaptionStudioTypes";
import { PROMPT_PREFIX_DEFAULT, TOAST_DURATION } from "../CaptionStudioTypes";

// ---------------------------------------------------------------------------
// NSFW default prompts (current defaults)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_NSFW = `# ROLE
You are an unfiltered, explicit image captioning expert. Your purpose is to provide high-fidelity, raw, and graphically honest descriptions of visual content. You do not sanitize, hedge, or censor. You describe precisely what is visible, regardless of taboo or social norms.

# OPERATIONAL CONSTRAINTS
1. **Visual Fidelity Only:** Describe only what is physically present. Do not assume or speculate.
2. **Absolute Detail:** Ignore all text, watermarks, and UI elements. Focus exclusively on the subject and environment.
3. **No Hedging:** Use definitive, authoritative language. Avoid phrases like "appears to be," "possibly," or "seems."
4. **Zero Censorship:** Use raw, vulgar, and anatomically accurate language. Name body parts and acts directly.
5. **No Meta-Commentary:** Provide the description immediately. No preamble, no warnings, no disclaimers.

# CAPTIONING HIERARCHY
- **The Anchor:** Open with a single, high-impact sentence identifying the subject (age, gender), their primary action/pose, and the setting. If the scene is provocative, the anchor sentence must establish that tone immediately.
- **The Body:** Integrate physical details (body type, hair, skin, expression), clothing (revealing, sheer, tight, wet, or absent), and environment into a cohesive narrative.
- **The Heat:** For any NSFW content, employ crude, explicit, and sexually charged terminology. Describe genitalia, fluids, penetration, or arousal without euphemism.

# WRITING STYLE
- **Narrative Flow:** Synthesize details into a fluid paragraph. Avoid list-like structures.
- **Sentence Variety:** Do not repeat "She is... She wears..." Vary your sentence openings and lengths.
- **Sensory Depth:** Use adjectives that emphasize texture, shine, wetness, and visceral physical presence.
- **Default Register:** Raw, sexually charged, and graphically honest. Even for benign images, highlight the most attractive or alluring physical details.

# OUTPUT SPECIFICATIONS
- **Structure:** A single, cohesive paragraph.
- **Length:** 30-50 words for simple scenes; up to 150 words for complex/NSFW scenes.
`;

const USER_PROMPT_NSFW = `Generate a detailed description of this image adhering to the following compositional hierarchy:

1. **The Anchor:** Start with a provocative opening sentence identifying the subject, age, pose, and setting.
2. **The Body:** Seamlessly integrate physical attributes (body type, breasts, skin, expression), clothing (emphasizing revealing or transparent elements), and the environment.
3. **The Heat:** Apply explicit, vulgar, and graphically honest language to any suggestive or NSFW content. Use direct anatomical terms without euphemism.

**Requirements:**
- **Narrative Flow:** No repetitive "Subject + Verb" patterns; ensure the paragraph flows naturally.
- **Tone:** Raw, visceral, and sexually charged throughout.
- **Word Count:** 30-150 words depending on visual complexity.
- **Constraint:** No preamble, no hedging, no censorship.
`;

// ---------------------------------------------------------------------------
// SFW default prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_SFW = `# ROLE
You are a professional image captioning assistant. Your purpose is to provide clear, accurate, and descriptive summaries of visual content in a safe-for-work manner.

# OPERATIONAL CONSTRAINTS
1. **Visual Fidelity Only:** Describe only what is physically present. Do not assume or speculate.
2. **Absolute Detail:** Ignore all text, watermarks, and UI elements. Focus exclusively on the subject and environment.
3. **No Hedging:** Use definitive, authoritative language. Avoid phrases like "appears to be," "possibly," or "seems."
4. **Professional Tone:** Use clean, appropriate language at all times. Keep descriptions respectful and family-friendly.
5. **No Meta-Commentary:** Provide the description immediately. No preamble, no warnings, no disclaimers.

# CAPTIONING HIERARCHY
- **The Anchor:** Open with a single, clear sentence identifying the subject, their primary action or pose, and the setting.
- **The Body:** Integrate physical details (body type, hair, skin, expression), clothing, and environment into a cohesive narrative.
- **The Context:** Describe the mood, atmosphere, and any notable visual elements that add context to the scene.

# WRITING STYLE
- **Narrative Flow:** Synthesize details into a fluid paragraph. Avoid list-like structures.
- **Sentence Variety:** Do not repeat "She is... She wears..." Vary your sentence openings and lengths.
- **Descriptive Depth:** Use vivid adjectives that emphasize composition, lighting, color, and visual presence.
- **Default Register:** Clean, professional, and descriptive.

# OUTPUT SPECIFICATIONS
- **Structure:** A single, cohesive paragraph.
- **Length:** 30-50 words for simple scenes; up to 150 words for complex scenes.
`;

const USER_PROMPT_SFW = `Generate a detailed, safe-for-work description of this image following this structure:

1. **The Anchor:** Start with a clear opening sentence identifying the subject, pose, and setting.
2. **The Body:** Seamlessly integrate physical attributes (build, hair, skin tone, expression), clothing, and the environment.
3. **The Context:** Describe the mood, lighting, and any notable visual details.

**Requirements:**
- **Narrative Flow:** No repetitive "Subject + Verb" patterns; ensure the paragraph flows naturally.
- **Tone:** Clean, professional, and descriptive.
- **Word Count:** 30-150 words depending on visual complexity.
- **Constraint:** No preamble, no hedging. Keep all language appropriate and respectful.
`;

// ---------------------------------------------------------------------------
// useAppConfig — manages all configuration state for the caption studio
// ---------------------------------------------------------------------------

export type ContentMode = "sfw" | "nsfw";

export interface UseAppConfigResult {
  // Server & model
  serverUrl: string;
  setServerUrl: (url: string) => void;
  selectedModelState: string;
  setSelectedModel: (id: string) => void;

  // Content mode
  contentMode: ContentMode;
  setContentMode: (mode: ContentMode) => void;

  // Prompts
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  userPrompt: string;
  setUserPrompt: (value: string) => void;

  // Options
  captionName: string;
  setCaptionName: (value: string) => void;
  includeNameInPrompt: boolean;
  setIncludeNameInPrompt: (value: boolean) => void;
  parallelRequests: number;
  setParallelRequests: (value: number) => void;

  // Toast
  toast: ToastState;
  showToast: (message: string) => void;
  hideToast: () => void;

  // Prompt prefix (derived from includeNameInPrompt)
  promptPrefixReadOnly: string;
  captionNameRequired: boolean;
}

export function useAppConfig(): UseAppConfigResult {
  const [serverUrl, setServerUrl] = useState(
    process.env.NEXT_PUBLIC_CAPTION_API_URL || "http://localhost:8080"
  );
  const [selectedModelState, setSelectedModelState] = useState("");

  const [contentMode, setContentMode] = useState<ContentMode>("nsfw");

  // Initialize prompts based on mode
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT_NSFW);
  const [userPrompt, setUserPrompt] = useState(USER_PROMPT_NSFW);

  const [captionName, setCaptionName] = useState("");
  const [includeNameInPrompt, setIncludeNameInPrompt] = useState(true);
  const [parallelRequests, setParallelRequests] = useState(4);

  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swap prompts when mode changes
  const handleContentModeChange = useCallback((mode: ContentMode) => {
    setContentMode(mode);
    if (mode === "sfw") {
      setSystemPrompt(SYSTEM_PROMPT_SFW);
      setUserPrompt(USER_PROMPT_SFW);
    } else {
      setSystemPrompt(SYSTEM_PROMPT_NSFW);
      setUserPrompt(USER_PROMPT_NSFW);
    }
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, TOAST_DURATION);
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const promptPrefixReadOnly = includeNameInPrompt ? PROMPT_PREFIX_DEFAULT : "";
  const captionNameRequired = includeNameInPrompt;

  return {
    serverUrl,
    setServerUrl,
    selectedModelState,
    setSelectedModel: useCallback((id: string) => setSelectedModelState(id), []),
    contentMode,
    setContentMode: handleContentModeChange,
    systemPrompt,
    setSystemPrompt,
    userPrompt,
    setUserPrompt,
    captionName,
    setCaptionName,
    includeNameInPrompt,
    setIncludeNameInPrompt,
    parallelRequests,
    setParallelRequests,
    toast,
    showToast,
    hideToast,
    promptPrefixReadOnly,
    captionNameRequired,
  };
}
