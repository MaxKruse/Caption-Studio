import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ContentMode,
  PresetId,
  ToastState,
} from "../CaptionStudioTypes";
import {
  CAPTION_PRESETS,
  getPreset,
  TOAST_DURATION,
} from "../CaptionStudioTypes";

// ---------------------------------------------------------------------------
// useAppConfig — manages all configuration state for the caption studio
// ---------------------------------------------------------------------------

export interface UseAppConfigResult {
  // Server & model
  serverUrl: string;
  setServerUrl: (url: string) => void;
  selectedModel: string;
  setSelectedModel: (id: string) => void;

  // Content mode (used by detection, not captioning)
  contentMode: ContentMode;
  setContentMode: (mode: ContentMode) => void;

  // Preset
  presetId: PresetId;
  setPresetId: (id: PresetId) => void;
  presetLabel: string;
  presetZipName: string;
  presetNeedsTrigger: boolean;

  // Prompts (initialized from preset, editable by user)
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  userPrompt: string;
  setUserPrompt: (value: string) => void;

  // Trigger word (activation token)
  triggerWord: string;
  setTriggerWord: (value: string) => void;
  triggerRequired: boolean;

  // Options
  parallelRequests: number;
  setParallelRequests: (value: number) => void;

  // Toast
  toast: ToastState;
  showToast: (message: string) => void;
  hideToast: () => void;
}

export function useAppConfig(): UseAppConfigResult {
  const [serverUrl, setServerUrl] = useState(
    process.env.NEXT_PUBLIC_CAPTION_API_URL || "http://localhost:8080"
  );
  const [selectedModel, setSelectedModel] = useState("");

  // Content mode — used by detection pipeline, defaults to sfw
  const [contentMode, setContentMode] = useState<ContentMode>("sfw");

  // Preset — defaults to first available
  const [presetId, setPresetIdState] = useState<PresetId>(
    CAPTION_PRESETS[0]?.id ?? "flux1-dev"
  );

  // Prompts — initialized from preset, user can edit
  const [systemPrompt, setSystemPrompt] = useState(() =>
    getPreset(CAPTION_PRESETS[0]?.id ?? "flux1-dev").systemPrompt
  );
  const [userPrompt, setUserPrompt] = useState(() =>
    getPreset(CAPTION_PRESETS[0]?.id ?? "flux1-dev").userPromptTemplate
  );

  // Trigger word (activation token)
  const [triggerWord, setTriggerWord] = useState("");

  const [parallelRequests, setParallelRequests] = useState(4);

  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update prompts when preset changes
  const setPresetId = useCallback((id: PresetId) => {
    setPresetIdState(id);
    const preset = getPreset(id);
    setSystemPrompt(preset.systemPrompt);
    setUserPrompt(preset.userPromptTemplate);
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

  // Derived values from preset definition
  const preset = getPreset(presetId);
  const presetLabel = preset.label;
  const presetZipName = preset.zipName;
  const presetNeedsTrigger = preset.needsTrigger;
  const triggerRequired = presetNeedsTrigger && !triggerWord.trim();

  return {
    serverUrl,
    setServerUrl,
    selectedModel,
    setSelectedModel: useCallback((id: string) => setSelectedModel(id), []),
    contentMode,
    setContentMode,
    presetId,
    setPresetId,
    presetLabel,
    presetZipName,
    presetNeedsTrigger,
    systemPrompt,
    setSystemPrompt,
    userPrompt,
    setUserPrompt,
    triggerWord,
    setTriggerWord,
    triggerRequired,
    parallelRequests,
    setParallelRequests,
    toast,
    showToast,
    hideToast,
  };
}
