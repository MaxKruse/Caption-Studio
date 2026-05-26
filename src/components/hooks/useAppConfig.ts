import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ContentMode,
  ToastState,
} from "../CaptionStudioTypes";
import { PROMPT_PREFIX_DEFAULT, TOAST_DURATION } from "../CaptionStudioTypes";

// ---------------------------------------------------------------------------
// NSFW default prompts (current defaults)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_NSFW = `You are an expert image captioning assistant. Produce a single, cohesive paragraph describing what is visible in the image.

Follow this structure:
1. **Subject Specification** — Identify the main subject with concrete details: age range, ethnicity, gender, distinctive physical features, body type, hair, skin tone, facial expression, and what they are doing.
2. **Clothing & Appearance** — Describe attire, accessories, and styling with specific details about fit, material, color, and condition.
3. **Environmental Context** — Establish the setting, time of day, lighting conditions, weather, and background elements that surround the subject.
4. **Visual Style** — Note the photographic qualities: camera angle, framing (close-up, wide shot, etc.), depth of field, color palette, and overall mood.

Rules:
- Describe only what is physically visible. Do not speculate or assume.
- Use definitive language. Avoid "appears to be," "possibly," or "seems."
- Ignore text, watermarks, and UI elements in the image.
- Be explicit and anatomically direct for NSFW content. Use precise terminology without euphemism.
- Vary sentence structure. Avoid repetitive "Subject + verb" patterns.
- Output a single paragraph, 30-150 words depending on visual complexity.
- No preamble, no warnings, no disclaimers. Start directly with the description.`;

const USER_PROMPT_NSFW = `Generate a detailed caption for this image. Focus on the most important visual elements: the subject's identity and appearance, what they are wearing, their pose and expression, and the environment. Be explicit and direct with NSFW content — use anatomically precise language without euphemism. Include lighting and photographic style details. Keep it to one paragraph, 30-150 words.`;

// ---------------------------------------------------------------------------
// SFW default prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_SFW = `You are an expert image captioning assistant. Produce a single, cohesive paragraph describing what is visible in the image.

Follow this structure:
1. **Subject Specification** — Identify the main subject with concrete details: age range, ethnicity, gender, distinctive physical features, body type, hair, skin tone, facial expression, and what they are doing.
2. **Clothing & Appearance** — Describe attire, accessories, and styling with specific details about fit, material, color, and condition.
3. **Environmental Context** — Establish the setting, time of day, lighting conditions, weather, and background elements that surround the subject.
4. **Visual Style** — Note the photographic qualities: camera angle, framing (close-up, wide shot, etc.), depth of field, color palette, and overall mood.

Rules:
- Describe only what is physically visible. Do not speculate or assume.
- Use definitive language. Avoid "appears to be," "possibly," or "seems."
- Ignore text, watermarks, and UI elements in the image.
- Use clean, appropriate, safe-for-work language throughout.
- Be specific with concrete details rather than vague descriptors like "beautiful" or "nice."
- Vary sentence structure. Avoid repetitive "Subject + verb" patterns.
- Output a single paragraph, 30-150 words depending on visual complexity.
- No preamble, no warnings, no disclaimers. Start directly with the description.`;

const USER_PROMPT_SFW = `Generate a detailed caption for this image. Focus on the most important visual elements: the subject's identity and appearance, what they are wearing, their pose and expression, and the environment. Include lighting and photographic style details. Keep it to one paragraph, 30-150 words. Use clean, safe-for-work language.`;

// ---------------------------------------------------------------------------
// useAppConfig — manages all configuration state for the caption studio
// ---------------------------------------------------------------------------

export interface UseAppConfigResult {
  // Server & model
  serverUrl: string;
  setServerUrl: (url: string) => void;
  selectedModel: string;
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
  const [selectedModel, setSelectedModel] = useState("");

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
    selectedModel,
    setSelectedModel: useCallback((id: string) => setSelectedModel(id), []),
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
