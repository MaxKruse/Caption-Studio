/**
 * Hook for checking llama.cpp server availability with auto-polling.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ServerCheckState {
  status: "checking" | "available" | "unavailable";
  error?: string;
  lastCheckAt?: number;
  secondsSinceLastCheck: number;
}

const POLL_INTERVAL_MS = 3000;
const TIMER_TICK_MS = 1000;

export function useServerCheck() {
  const [state, setState] = useState<ServerCheckState>({
    status: "unavailable",
    secondsSinceLastCheck: 0,
  });
  const serverUrlRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkServer = useCallback(async (url: string) => {
    setState((prev) => ({ ...prev, status: "checking", lastCheckAt: Date.now() }));

    try {
      const response = await fetch(`/api/ping?serverUrl=${encodeURIComponent(url)}`);
      const data = await response.json();

      setState((prev) => ({
        ...prev,
        status: data.ok ? "available" : "unavailable",
        error: data.error,
        lastCheckAt: Date.now(),
        secondsSinceLastCheck: 0,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        status: "unavailable",
        error: "Network error",
        lastCheckAt: Date.now(),
        secondsSinceLastCheck: 0,
      }));
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (url: string) => {
      stopPolling();
      serverUrlRef.current = url;

      // Immediate check
      checkServer(url);

      // Poll every 3 seconds
      intervalRef.current = setInterval(() => {
        checkServer(serverUrlRef.current);
      }, POLL_INTERVAL_MS);

      // Tick timer for "seconds since last check" display
      timerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          secondsSinceLastCheck: prev.secondsSinceLastCheck + 1,
        }));
      }, TIMER_TICK_MS);
    },
    [checkServer, stopPolling]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    state,
    checkServer,
    startPolling,
    stopPolling,
  };
}
