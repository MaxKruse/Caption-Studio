import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ContentMode,
  PresetId,
  ToastState,
} from "../CaptionStudioTypes";
import {
  getPreset,
  TOAST_DURATION,
} from "../CaptionStudioTypes";
import { useStudioStore } from "@/store/studioStore";

// ---------------------------------------------------------------------------
// useAppConfig — thin wrapper around studioStore config + local toast state
//
// Reads/writes all config from the Zustand store (persisted to localStorage).
// Toast remains local (not persisted).
//
// Return type is unchanged for backward compatibility with existing consumers.
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

  // Preset
  presetId: PresetId;
  setPresetId: (id: PresetId) => void;
  presetLabel: string;
  presetZipName: string;
  presetNeedsTrigger: boolean;

  // Prompts
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  userPrompt: string;
  setUserPrompt: (value: string) => void;

  // Trigger word
  triggerWord: string;
  setTriggerWord: (value: string) => void;
  triggerRequired: boolean;

  // Options
  parallelRequests: number;
  setParallelRequests: (value: number) => void;

  // Multi-preset
  captionAllPresets: boolean;
  setCaptionAllPresets: (value: boolean) => void;

  // Toast (local only)
  toast: ToastState;
  showToast: (message: string) => void;
  hideToast: () => void;
}

export function useAppConfig(): UseAppConfigResult {
  // -- Read from store --
  const serverUrl = useStudioStore((s) => s.config.serverUrl);
  const selectedModel = useStudioStore((s) => s.config.selectedModel);
  const contentMode = useStudioStore((s) => s.config.contentMode);
  const presetId = useStudioStore((s) => s.config.presetId);
  const systemPrompt = useStudioStore((s) => s.config.systemPrompt);
  const userPrompt = useStudioStore((s) => s.config.userPrompt);
  const triggerWord = useStudioStore((s) => s.config.triggerWord);
  const parallelRequests = useStudioStore((s) => s.config.parallelRequests);

  // -- Store setters --
  const setServerUrl = useStudioStore((s) => s.setServerUrl);
  const setSelectedModel = useStudioStore((s) => s.setSelectedModel);
  const setContentMode = useStudioStore((s) => s.setContentMode);
  const setPresetId = useStudioStore((s) => s.setPresetId);
  const setSystemPrompt = useStudioStore((s) => s.setSystemPrompt);
  const setUserPrompt = useStudioStore((s) => s.setUserPrompt);
  const setTriggerWord = useStudioStore((s) => s.setTriggerWord);
  const setParallelRequests = useStudioStore((s) => s.setParallelRequests);
  const captionAllPresets = useStudioStore((s) => s.config.captionAllPresets);
  const setCaptionAllPresets = useStudioStore((s) => s.setCaptionAllPresets);

  // -- Derived from preset --
  const preset = getPreset(presetId);
  const presetLabel = preset.label;
  const presetZipName = preset.zipName;
  const presetNeedsTrigger = preset.needsTrigger;
  const triggerRequired = presetNeedsTrigger && !triggerWord.trim();

  // -- Toast (local, not persisted) --
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return {
    serverUrl,
    setServerUrl,
    selectedModel,
    setSelectedModel,
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
    captionAllPresets,
    setCaptionAllPresets,
    toast,
    showToast,
    hideToast,
  };
}
