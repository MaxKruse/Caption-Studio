/**
 * React hook for managing the Caption Studio session state.
 * Wraps localStorage-backed session with reactive state.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import {
  loadSession,
  saveSession,
  clearSession,
  type SessionState,
  type AppMode,
} from "@/lib/session";

export function useSession() {
  const [state, setState] = useState<SessionState>(() => loadSession());

  // Persist on every change
  useEffect(() => {
    saveSession(state);
  }, [state]);

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
    clearSession();
    setState({
      mode: null,
      serverUrl: "",
      model: "",
      images: [],
      imageNames: [],
      systemPrompt: "",
      userPrompt: "",
      multiStepMessages: [],
      multiStepSystemPrompt: "",
    });
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
    setMultiStepSystemPrompt,
    setMultiStepMessages,
    updateMultiStepMessage,
    addMultiStepMessage,
    removeMultiStepMessage,
    reset,
  };
}
