/**
 * MOSS-Image mode orchestrator.
 *
 * Recaptions images with the recaptioner prompt as the system message
 * (the MOSS-Image guide's prompt is the default, fully editable in the
 * prompt editor): one non-streaming call per image that returns a
 * strict JSON caption object (long/medium/short captions + watermark
 * boxes + borders), the data format used to post-train MOSS-Image-Base.
 *
 * Phases: upload -> configure -> processing -> results. Grounding for
 * the recaptioner (both optional, applied only when present): a
 * batch-level subject description, and per-image reference captions
 * (.txt per image, stem-paired by the uploader).
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
import { PromptEditor } from "@/components/prompt-editor";
import { CaptionViewer } from "@/components/caption-viewer";
import { KvCacheStats } from "@/components/kv-cache-stats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
  /** Optional batch-level subject description (grounding for the recaptioner). */
  const [subjectDescription, setSubjectDescription] = useState("");
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
      systemPrompt: state.mossSystemPrompt,
      userPrompt: state.mossUserPrompt,
      // Omit when empty so the prompt has no subject section
      ...(subjectDescription.trim() !== ""
        ? { subjectDescription: subjectDescription.trim() }
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
  }, [state, serverUrl, subjectDescription]);

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

            <PromptEditor mode="moss" />

            {/* Subject description (optional grounding for the recaptioner) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Subject Description
              </label>
              <p className="text-xs text-slate-500">
                Optional. Describe the subject that appears in the images (a
                character, product, or scene). The model uses it to name and
                describe the subject consistently across all captions.
              </p>
              <Textarea
                value={subjectDescription}
                onChange={(e) => setSubjectDescription(e.target.value)}
                rows={3}
                placeholder="e.g. A young woman with long silver hair and a red hooded cloak..."
              />
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
                disabled={
                  !state.model ||
                  !state.mossSystemPrompt.trim() ||
                  !state.mossUserPrompt.trim() ||
                  isProcessing
                }
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
