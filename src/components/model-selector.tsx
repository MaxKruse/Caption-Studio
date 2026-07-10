/**
 * Model selector - fetches available vision models from the connected server.
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "@/hooks/use-session";
import type { ModelInfo } from "@/lib/types";

interface ModelSelectorProps {
  serverUrl: string;
}

export function ModelSelector({ serverUrl }: ModelSelectorProps) {
  const { state, setModel } = useSession();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchModels = useCallback(async () => {
    if (!serverUrl) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/models?serverUrl=${encodeURIComponent(serverUrl)}`
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch models");
        setModels([]);
        return;
      }

      const foundModels = data.models || [];
      setModels(foundModels);

      // Auto-select first model if none selected
      if (foundModels.length > 0 && !state.model) {
        setModel(foundModels[0].id);
      }
    } catch {
      setError("Failed to connect to server");
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, state.model, setModel]);

  // Fetch on mount only
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      void fetchModels();
    }
  }, [fetchModels]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">
        Model
      </label>
      <div className="flex gap-2">
        <select
          value={state.model}
          onChange={(e) => setModel(e.target.value)}
          className="flex-1 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          disabled={loading || models.length === 0}
        >
          {models.length === 0 && <option>Select a model</option>}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            hasFetched.current = false;
            void fetchModels();
          }}
          disabled={loading}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "R"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {models.length > 0 && (
        <p className="text-xs text-slate-500">
          {models.length} vision model{models.length !== 1 ? "s" : ""} available
        </p>
      )}
    </div>
  );
}
