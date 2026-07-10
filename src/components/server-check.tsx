/**
 * Server availability checker with auto-polling and URL input.
 * Blocks progression until a server is found.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { useServerCheck } from "@/hooks/use-server-check";
import { useSession } from "@/hooks/use-session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ServerCheckProps {
  onServerReady: (serverUrl: string) => void;
}

export function ServerCheck({ onServerReady }: ServerCheckProps) {
  const { state: session } = useSession();
  const { setServerUrl } = useSession();
  const [inputUrl, setInputUrl] = useState(session.serverUrl || "http://localhost:8080");
  const { state: checkState, startPolling, checkServer } = useServerCheck();
  const readyRef = useRef(false);

  // Notify parent when server becomes available
  useEffect(() => {
    if (checkState.status === "available" && !readyRef.current) {
      readyRef.current = true;
      onServerReady(inputUrl);
    }
    if (checkState.status !== "available") {
      readyRef.current = false;
    }
  }, [checkState.status, inputUrl, onServerReady]);

  const handleStartCheck = () => {
    setServerUrl(inputUrl);
    startPolling(inputUrl);
  };

  const handleRecheck = () => {
    readyRef.current = false;
    checkServer(inputUrl);
  };

  const getStatusIcon = () => {
    switch (checkState.status) {
      case "checking":
        return (
          <span className="inline-block w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
        );
      case "available":
        return (
          <span className="inline-block w-3 h-3 bg-green-400 rounded-full" />
        );
      case "unavailable":
        return (
          <span className="inline-block w-3 h-3 bg-red-400 rounded-full" />
        );
    }
  };

  const getStatusText = () => {
    switch (checkState.status) {
      case "checking":
        return "Checking server availability...";
      case "available":
        return "Server is online and responding";
      case "unavailable":
        return checkState.error || "Server not reachable";
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto" variant="elevated">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100 text-center">
          Connect to llama.cpp Server
        </h2>

        <p className="text-sm text-slate-400 text-center">
          Enter the URL of your llama.cpp server to get started.
          The app will verify connectivity before proceeding.
        </p>

        <div className="flex gap-2">
          <Input
            label="Server URL"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="http://localhost:8080"
            onKeyDown={(e) => e.key === "Enter" && handleStartCheck()}
          />
          <div className="flex items-end">
            <Button onClick={handleStartCheck}>Check</Button>
          </div>
        </div>

        {checkState.lastCheckAt && (
          <div className="flex items-center gap-3 text-sm">
            {getStatusIcon()}
            <span className={
              checkState.status === "available"
                ? "text-green-300"
                : checkState.status === "checking"
                  ? "text-amber-300"
                  : "text-red-300"
            }>
              {getStatusText()}
            </span>
          </div>
        )}

        {checkState.status === "checking" && (
          <div className="text-xs text-slate-500">
            Auto-retrying every 3 seconds...
          </div>
        )}

        {checkState.status === "unavailable" && (
          <div className="text-xs text-slate-500">
            Auto-retrying every 3 seconds. Update the URL above and click Check to try a different server.
          </div>
        )}

        {checkState.status === "available" && (
          <div className="text-xs text-slate-500">
            Server connected. Proceeding to mode selection...
          </div>
        )}

        {checkState.status === "available" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRecheck}
            className="text-xs text-slate-400"
          >
            Re-check connection
          </Button>
        )}
      </div>
    </Card>
  );
}
