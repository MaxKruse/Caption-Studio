/**
 * MOSS-Image mode orchestrator.
 *
 * Recaptions images with the MOSS-Image guide's recaptioner prompt:
 * one non-streaming call per image that returns a strict JSON caption
 * object (long/medium/short captions + watermark boxes + borders), the
 * data format used to post-train MOSS-Image-Base.
 *
 * Phases: upload -> configure -> processing -> results. Optional
 * reference captions (.txt per image, stem-paired by the uploader)
 * ground the model on the original caption; images without one use
 * `(none)`.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { consumeSseStream } from "@/lib/sse-client";
import { triggerDownload } from "@/lib/download";
import { CaptionResult, stopCaptionSession } from "@/lib/caption-result";
import { buildSingleShotFormData } from "@/lib/upload-chunking";
import { ImageUploader } from "@/components/image-uploader";
import { ModelSelector } from "@/components/model-selector";
import { CaptionViewer } from "@/components/caption-viewer";
import { KvCacheStats } from "@/components/kv-cache-stats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "upload" | "configure" | "processing" | "results";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MossModeProps {
  serverUrl: string;
  onBack: () => void;
}

export function MossMode({ serverUrl, onBack }: MossModeProps) {
  const { state } = useSession();
  const [phase, setPhase] = useState<Phase>("upload");
  const [imageCount, setImageCount] = useState(0);
  /** Guide knobs: thinking mode (recommended) and the output token budget. */
  const [enableThinking, setEnableThinking] = useState(true);
  const [maxTokens, setMaxTokens] = useState("16384");
  const tokensValue = maxTokens.trim() === "" ? null : Number(maxTokens);
  const tokensInvalid =
    tokensValue !== null &&
    (!Number.isInteger(tokensValue) || tokensValue < 512 || tokensValue > 32768);
  /** Optional max image dimension override ("" = lib default 1536px). */
  const [maxImageDimension, setMaxImageDimension] = useState("");
  const dimValue = maxImageDimension.trim() === "" ? null : Number(maxImageDimension);
  const dimInvalid =
    dimValue !== null && (!Number.isInteger(dimValue) || dimValue < 256 || dimValue > 4096);
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (sessionIdRef.current) {
        stopCaptionSession("/api/caption/moss", sessionIdRef.current);
      }
    };
  }, []);

  const handleImagesReady = useCallback((count: number) => {
    setImageCount(count);
  }, []);

  const handleStart = useCallback(async () => {
    const initialResults: CaptionResult[] = state.images.map((dataUrl, i) => ({
      name: state.imageNames[i] || `image-${i}.jpg`,
      imageDataUrl: dataUrl,
      status: "queued" as const,
    }));
    setResults(initialResults);
    setPhase("processing");
    setIsProcessing(true);
    setSessionId(null);
    sessionIdRef.current = null;

    const config = {
      serverUrl,
      model: state.model,
      enableThinking,
      // The user never clears the field to an invalid value (Start is
      // disabled then) - fall back to the guide default when blank.
      maxTokens: tokensValue ?? 16384,
      // Omit when unset so the server applies the 1536px default
      ...(dimValue !== null && Number.isInteger(dimValue)
        ? { maxImageDimension: dimValue }
        : {}),
    };
    // Caption parts stay 1:1 index-aligned with the images ("" = none).
    const formData = buildSingleShotFormData({
      config,
      imageFiles: state.imageFiles,
      imageNames: state.imageNames,
      captionTexts: state.imageCaptions,
    });

    const localResults = [...initialResults];
    // Server-side failure reason (e.g. a worker pool crash), shown per
    // image at finalization instead of leaving rows stuck as queued.
    let serverError: string | null = null;

    try {
      const response = await fetch("/api/caption/moss", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        const failed = initialResults.map((r) => ({
          ...r,
          status: "failed" as const,
          error: error.error,
        }));
        setResults(failed);
        setIsProcessing(false);
        setPhase("results");
        return;
      }

      const body = response.body;
      if (!body) return;

      // Non-streaming mode: no token events, rows stay "processing"
      // until their image_complete arrives.
      await consumeSseStream(body, (event) => {
        if (event.type === "session") {
          const sid = (event.data as { sessionId: string }).sessionId;
          if (sid) {
            sessionIdRef.current = sid;
            setSessionId(sid);
          }
          return;
        }

        switch (event.type) {
          case "image_start": {
            const idx = (event.data as { index: number }).index;
            if (localResults[idx]) {
              localResults[idx] = { ...localResults[idx], status: "processing" };
            }
            break;
          }
          case "image_complete": {
            const completeData = event.data as {
              index: number;
              status: string;
              caption?: string;
              reasoningContent?: string;
              error?: string;
              cachedTokens?: number;
              promptTokens?: number;
            };
            const idx = completeData.index;
            if (localResults[idx]) {
              localResults[idx] = {
                ...localResults[idx],
                status: completeData.status as CaptionResult["status"],
                caption: completeData.caption,
                reasoningContent: completeData.reasoningContent,
                error: completeData.error,
                cachedTokens: completeData.cachedTokens,
                promptTokens: completeData.promptTokens,
              };
            }
            break;
          }
          case "warning":
          case "error": {
            if (event.type === "error") {
              const data = event.data as { message?: string; error?: string };
              serverError = data.error ?? data.message ?? serverError;
            }
            break;
          }
          case "done": {
            break;
          }
        }

        setResults([...localResults]);
      });

      // Never leave images stuck as queued/processing: the stream ended
      // (normal completion, user stop, or server error).
      const aborted = abortControllerRef.current?.signal.aborted ?? false;
      for (const result of localResults) {
        if (result.status === "queued" || result.status === "processing") {
          result.status = "failed";
          result.error = aborted
            ? "Stopped by user"
            : serverError ?? "The stream ended before this image finished";
        }
      }
      setResults([...localResults]);

      abortControllerRef.current = null;
      setIsProcessing(false);
      setPhase("results");
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      for (const result of localResults) {
        if (result.status === "queued" || result.status === "processing") {
          result.status = "failed";
          result.error = aborted
            ? "Stopped by user"
            : error instanceof Error
              ? error.message
              : String(error);
        }
      }
      setResults([...localResults]);
      abortControllerRef.current = null;
      setIsProcessing(false);
      setPhase("results");
    }
  }, [state, serverUrl, enableThinking, tokensValue, dimValue]);

  const handleNewBatch = useCallback(() => {
    setPhase("upload");
    setResults([]);
    setIsProcessing(false);
    setSessionId(null);
    sessionIdRef.current = null;
  }, []);

  const allPhases: Phase[] = ["upload", "configure", "processing", "results"];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">MOSS-Image Mode</h2>
          <p className="text-sm text-slate-400">
            Recaption as JSON (long/medium/short + watermarks + borders)
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to modes
        </Button>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm">
        {allPhases.map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded-full ${
                phase === p
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {p}
            </span>
            {i < allPhases.length - 1 && <span className="text-slate-600">{"\u2192"}</span>}
          </div>
        ))}
      </div>

      {/* Upload phase */}
      {phase === "upload" && (
        <div className="space-y-4">
          <ImageUploader acceptCaptions onImagesReady={handleImagesReady} />
          <div className="flex justify-end">
            <Button
              onClick={() => setPhase("configure")}
              disabled={imageCount === 0}
            >
              Continue ({imageCount} image{imageCount !== 1 ? "s" : ""})
            </Button>
          </div>
        </div>
      )}

      {/* Configure phase */}
      {phase === "configure" && (
        <Card>
          <div className="space-y-4">
            <ModelSelector serverUrl={serverUrl} />

            {/* Thinking mode (guide: recommended for more accurate captions) */}
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <input
                  type="checkbox"
                  checked={enableThinking}
                  onChange={(e) => setEnableThinking(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
                Thinking mode
              </label>
              <p className="text-xs text-slate-500">
                Recommended for more accurate captions (the guide suggests keeping it
                on). Adds a reasoning pass before the JSON answer, so each image
                takes longer.
              </p>
            </div>

            {/* Max tokens (guide default 16384) */}
            <div className="space-y-1">
              <Input
                label="Max output tokens"
                type="number"
                min={512}
                max={32768}
                step={1024}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="16384 (default)"
              />
              <p className="text-xs text-slate-500">
                Output budget for the JSON caption object. Raise it for very
                detailed scenes; the guide default is 16384.
              </p>
              {tokensInvalid && (
                <p className="text-xs text-red-400">
                  Must be a whole number between 512 and 32768.
                </p>
              )}
            </div>

            {/* Optional image resolution override */}
            <div className="space-y-1">
              <Input
                label="Max image dimension (px)"
                type="number"
                min={256}
                max={4096}
                step={64}
                value={maxImageDimension}
                onChange={(e) => setMaxImageDimension(e.target.value)}
                placeholder="1536 (default)"
              />
              <p className="text-xs text-slate-500">
                Optional. Downscale images to this size before captioning. Raise it
                (with a matching --image-max-tokens on the server) for more detail.
              </p>
              {dimInvalid && (
                <p className="text-xs text-red-400">
                  Must be a whole number between 256 and 4096.
                </p>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setPhase("upload")}>
                Back
              </Button>
              <Button
                onClick={async () => {
                  abortControllerRef.current = new AbortController();
                  await handleStart();
                }}
                disabled={!state.model || tokensInvalid || dimInvalid || isProcessing}
              >
                Start Captioning
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Processing + Results phases */}
      {(phase === "processing" || phase === "results") && (
        <div className="space-y-4">
          {/* Processing label */}
          {phase === "processing" && (
            <div className="text-center">
              <span className="text-sm font-medium text-indigo-300">
                Processing images (recaptioning)...
              </span>
            </div>
          )}

          <CaptionViewer results={results} />

          <KvCacheStats results={results} />

          {phase === "results" && (
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={handleNewBatch}>
                New Batch
              </Button>
              <Button
                variant="primary"
                onClick={() => void triggerDownload(sessionId)}
              >
                Download ZIP
              </Button>
            </div>
          )}

          {isProcessing && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
                if (sessionIdRef.current) {
                  stopCaptionSession("/api/caption/moss", sessionIdRef.current);
                  sessionIdRef.current = null;
                }
              }}
            >
              Stop
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
