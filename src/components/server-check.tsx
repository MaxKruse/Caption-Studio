/**
 * Server availability checker with auto-polling and URL input.
 * Blocks progression until a server is found.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useServerCheck } from "@/hooks/use-server-check";
import { useSession } from "@/hooks/use-session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ServerCheckProps {
  defaultServerUrl: string;
  onServerReady: (serverUrl: string) => void;
}

export function ServerCheck({ defaultServerUrl, onServerReady }: ServerCheckProps) {
  const { state: session, setServerUrl } = useSession();
  const [inputUrl, setInputUrl] = useState(session.serverUrl || defaultServerUrl);
  const { state: checkState, startPolling, stopPolling } = useServerCheck();

  // Auto-start polling on mount and when URL changes
  useEffect(() => {
    if (inputUrl) {
      startPolling(inputUrl);
    }
    return () => {
      stopPolling();
    };
  }, [inputUrl, startPolling, stopPolling]);

  const handleNext = useCallback(() => {
    setServerUrl(inputUrl);
    onServerReady(inputUrl);
  }, [inputUrl, setServerUrl, onServerReady]);

  return (
    <Card className="w-full max-w-lg mx-auto" variant="elevated">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100 text-center">
          Connect to llama.cpp Server
        </h2>

        <p className="text-sm text-slate-400 text-center">
          Enter the URL of your llama.cpp server to get started.
        </p>

        <Input
          label="Server URL"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="http://localhost:8080"
        />

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-3 text-sm">
          {checkState.status === "checking" && (
            <span className="inline-block w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
          )}
          {checkState.status === "available" && (
            <span className="inline-block w-3 h-3 bg-green-400 rounded-full" />
          )}
          {checkState.status === "unavailable" && (
            <span className="inline-block w-3 h-3 bg-red-400 rounded-full" />
          )}
          <span className={
            checkState.status === "available"
              ? "text-green-300"
              : checkState.status === "checking"
                ? "text-amber-300"
                : "text-red-300"
          }>
            {checkState.status === "available"
              ? "Server Available"
              : checkState.status === "checking"
                ? "Checking..."
                : "Server Unavailable"}
          </span>
        </div>

        {checkState.status === "unavailable" && checkState.error && (
          <p className="text-xs text-center text-slate-500">{checkState.error}</p>
        )}

        {checkState.status === "available" && (
          <div className="text-center">
            <Button onClick={handleNext}>Next</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
