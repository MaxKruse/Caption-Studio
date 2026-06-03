"use client";

import { useCallback, useEffect, useState } from "react";

import type { ModelInfo } from "../CaptionStudioTypes";
import { useStudioStore } from "@/store/studioStore";

/**
 * Fetches available vision models from the configured server on mount.
 * Reads serverUrl directly from the Zustand store.
 * Manages loading, error, and model list state internally.
 */
export function useFetchModels() {
  const serverUrl = useStudioStore((s) => s.config.serverUrl);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState("");

  const fetchModels = useCallback(async () => {
    if (!serverUrl.trim()) {
      setModelError("Enter a server URL first");
      return;
    }

    setModelLoading(true);
    setModelError("");
    setModels([]);

    try {
      const res = await fetch(
        `/api/models?serverUrl=${encodeURIComponent(serverUrl.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setModelError(data.error || "Failed to fetch models");
        return;
      }

      setModels(data.models || []);
    } catch {
      setModelError("Network error - check the server URL");
    } finally {
      setModelLoading(false);
    }
  }, [serverUrl]);

  // Fetch models on mount and whenever serverUrl changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; setState fires after await
    void fetchModels();
  }, [fetchModels]);

  return { models, modelLoading, modelError, fetchModels };
}
