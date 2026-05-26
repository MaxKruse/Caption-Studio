import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CaptionTypeId,
  ContentMode,
  ToastState,
} from "../CaptionStudioTypes";
import {
  CAPTION_TYPES,
  getSystemPrompt,
  getUserPrompt,
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

  // Content mode
  contentMode: ContentMode;
  setContentMode: (mode: ContentMode) => void;

  // Caption type
  captionTypeId: CaptionTypeId;
  setCaptionTypeId: (id: CaptionTypeId) => void;

  // Prompts
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  userPrompt: string;
  setUserPrompt: (value: string) => void;

  // Caption fields (conditional based on caption type)
  triggerWord: string;
  setTriggerWord: (value: string) => void;
  subjectName: string;
  setSubjectName: (value: string) => void;

  // Options
  parallelRequests: number;
  setParallelRequests: (value: number) => void;

  // Toast
  toast: ToastState;
  showToast: (message: string) => void;
  hideToast: () => void;

  // Derived values
  captionTypeLabel: string;
  needsTrigger: boolean;
  needsName: boolean;
  triggerRequired: boolean;
  nameRequired: boolean;
}

export function useAppConfig(): UseAppConfigResult {
  const [serverUrl, setServerUrl] = useState(
    process.env.NEXT_PUBLIC_CAPTION_API_URL || "http://localhost:8080"
  );
  const [selectedModel, setSelectedModel] = useState("");

  const [contentMode, setContentMode] = useState<ContentMode>("sfw");

  // Caption type — defaults to "name" (subject name only)
  const [captionTypeId, setCaptionTypeId] = useState<CaptionTypeId>("name");

  // Prompts — initialized from caption type + mode
  const [systemPrompt, setSystemPrompt] = useState(() =>
    getSystemPrompt("name", "sfw")
  );
  const [userPrompt, setUserPrompt] = useState(() =>
    getUserPrompt("name", "sfw")
  );

  // Caption fields
  const [triggerWord, setTriggerWord] = useState("");
  const [subjectName, setSubjectName] = useState("");

  const [parallelRequests, setParallelRequests] = useState(4);

  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update prompts when caption type changes
  const handleCaptionTypeChange = useCallback((id: CaptionTypeId) => {
    setCaptionTypeId(id);
    setSystemPrompt(getSystemPrompt(id, contentMode));
    setUserPrompt(getUserPrompt(id, contentMode));
  }, [contentMode]);

  // Update prompts when content mode changes
  const handleContentModeChange = useCallback((mode: ContentMode) => {
    setContentMode(mode);
    setSystemPrompt(getSystemPrompt(captionTypeId, mode));
    setUserPrompt(getUserPrompt(captionTypeId, mode));
  }, [captionTypeId]);

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

  // Derived values from caption type definition
  const captionType = CAPTION_TYPES.find((t) => t.id === captionTypeId) ?? CAPTION_TYPES[0];
  const captionTypeLabel = captionType.label;
  const needsTrigger = captionType.needsTrigger;
  const needsName = captionType.needsName;
  const triggerRequired = needsTrigger && !triggerWord.trim();
  const nameRequired = needsName && !subjectName.trim();

  return {
    serverUrl,
    setServerUrl,
    selectedModel,
    setSelectedModel: useCallback((id: string) => setSelectedModel(id), []),
    contentMode,
    setContentMode: handleContentModeChange,
    captionTypeId,
    setCaptionTypeId: handleCaptionTypeChange,
    systemPrompt,
    setSystemPrompt,
    userPrompt,
    setUserPrompt,
    triggerWord,
    setTriggerWord,
    subjectName,
    setSubjectName,
    parallelRequests,
    setParallelRequests,
    toast,
    showToast,
    hideToast,
    captionTypeLabel,
    needsTrigger,
    needsName,
    triggerRequired,
    nameRequired,
  };
}
