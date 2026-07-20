/**
 * Caption Studio - Guided Experience Homepage (client)
 *
 * Flow:
 * 1. Server check (auto-polls every 3s until server found)
 * 2. Mode selection (Simple or Multi-step)
 * 3. Mode-specific workflow (upload -> configure -> process -> results)
 */

"use client";

import { useState, useCallback } from "react";
import { ServerCheck } from "@/components/server-check";
import { ModeSelector } from "@/components/mode-selector";
import { SimpleMode } from "@/components/simple-mode";
import { MultiStepMode } from "@/components/multi-step-mode";
import { ForAnimaMode } from "@/components/for-anima-mode";
import { Krea2Mode } from "@/components/krea2-mode";
import { SessionProvider } from "@/hooks/use-session";
import type { AppMode } from "@/hooks/use-session";

interface HomeClientProps {
  defaultServerUrl: string;
}

export function HomeClient({ defaultServerUrl }: HomeClientProps) {
  const [appPhase, setAppPhase] = useState<"checking" | "select-mode" | "working">("checking");
  const [selectedMode, setSelectedMode] = useState<AppMode | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [sessionKey, setSessionKey] = useState(0); // increment to force child re-mount

  const handleServerReady = useCallback((url: string) => {
    setServerUrl(url);
    setAppPhase("select-mode");
  }, []);

  const handleModeSelected = useCallback((mode: AppMode) => {
    setSelectedMode(mode);
    setAppPhase("working");
  }, []);

  const handleBackToModes = useCallback(() => {
    setAppPhase("select-mode");
  }, []);

  const handleReset = useCallback(() => {
    setServerUrl("");
    setSelectedMode(null);
    setAppPhase("checking");
    setSessionKey((k) => k + 1); // force all child components to re-init
  }, []);

  return (
    <SessionProvider key={sessionKey}>
      <div className="min-h-screen bg-[#1a1a2e] text-slate-100">
      {/* Top bar */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-100">Caption Studio</h1>
            {serverUrl && (
              <span className="text-xs text-slate-500">{serverUrl}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {appPhase === "working" && (
              <button
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                New session
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {appPhase === "checking" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <ServerCheck defaultServerUrl={defaultServerUrl} onServerReady={handleServerReady} />
          </div>
        )}

        {appPhase === "select-mode" && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <ModeSelector
              serverUrl={serverUrl}
              onModeSelected={handleModeSelected}
            />
          </div>
        )}

        {appPhase === "working" && selectedMode === "simple" && (
          <SimpleMode serverUrl={serverUrl} onBack={handleBackToModes} />
        )}

        {appPhase === "working" && selectedMode === "multi-step" && (
          <MultiStepMode serverUrl={serverUrl} onBack={handleBackToModes} />
        )}

        {appPhase === "working" && selectedMode === "for-anima" && (
          <ForAnimaMode serverUrl={serverUrl} onBack={handleBackToModes} />
        )}

        {appPhase === "working" && selectedMode === "krea-2" && (
          <Krea2Mode serverUrl={serverUrl} onBack={handleBackToModes} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/30 mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-3 text-center text-xs text-slate-600">
          Caption Studio - llama.cpp vision model captioning
        </div>
      </footer>
      </div>
    </SessionProvider>
  );
}
