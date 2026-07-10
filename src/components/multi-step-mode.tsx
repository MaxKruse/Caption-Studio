/**
 * Multi-step mode orchestrator.
 * Guides user through: upload images -> select model -> edit prompts -> start -> view results.
 * Chains multiple API calls per image, building context with each step.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { ImageUploader } from "@/components/image-uploader";
import { ModelSelector } from "@/components/model-selector";
import { PromptEditor } from "@/components/prompt-editor";
import { CaptionViewer } from "@/components/caption-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface CaptionResult {
  name: string;
  imageDataUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  partialCaption?: string;
  reasoningContent?: string;
  partialReasoning?: string;
  error?: string;
}

/** Trigger a ZIP download of image/caption pairs via /api/download. */
async function triggerDownload(results: CaptionResult[]): Promise<void> {
  const items = results
    .filter((r) => r.caption && r.caption.trim())
    .map((r) => ({
      name: r.name,
      imageDataUrl: r.imageDataUrl,
      caption: r.caption,
    }));

  if (items.length === 0) return;

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Silently fail - download is a convenience feature
  }
}

interface MultiStepModeProps {
  serverUrl: string;
  onBack: () => void;
}

export function MultiStepMode({ serverUrl, onBack }: MultiStepModeProps) {
  const { state } = useSession();
  const [phase, setPhase] = useState<"upload" | "configure" | "processing" | "results">("upload");
  const [imageCount, setImageCount] = useState(0);
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<{ image: number; step: number } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Also tell the backend to stop processing
      if (sessionIdRef.current) {
        fetch(`/api/caption/multi-step?sessionId=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
      }
    };
  }, []);

  const handleImagesReady = useCallback((count: number) => {
    setImageCount(count);
  }, []);

  const handleStart = useCallback(async () => {
    // Initialize results array
    const initialResults: CaptionResult[] = state.images.map((dataUrl, i) => ({
      name: state.imageNames[i] || `image-${i}.jpg`,
      imageDataUrl: dataUrl,
      status: "queued" as const,
    }));
    setResults(initialResults);
    setPhase("processing");
    setIsProcessing(true);
    setCurrentStep(null);

    const images = state.images.map((dataUrl, i) => ({
      imageDataUrl: dataUrl,
      imageName: state.imageNames[i] || `image-${i}.jpg`,
    }));

    try {
      const response = await fetch("/api/caption/multi-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({
          serverUrl,
          model: state.model,
          systemPrompt: state.multiStepSystemPrompt,
          userMessages: state.multiStepMessages,
          triggerWordPerson: state.triggerWordPerson,
          triggerWordOther: state.triggerWordOther,
          images,
        }),
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
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      // Local mutable copy for download trigger (avoids stale closure)
      const localResults = [...initialResults];
      let isDone = false;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          isDone = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          const eventMatch = block.match(/^event: (\w+)\s*\ndata: ([\s\S]+)$/);
          if (!eventMatch) continue;

          const eventType = eventMatch[1];
          let data: unknown;
          try {
            data = JSON.parse(eventMatch[2]);
          } catch {
            continue;
          }

          // Capture sessionId from backend for explicit abort
          if (eventType === "session") {
            const sid = (data as { sessionId: string }).sessionId;
            if (sid) sessionIdRef.current = sid;
            continue;
          }

          // Update local array
          switch (eventType) {
            case "image_start": {
              const idx = (data as { index: number }).index;
              if (localResults[idx]) {
                localResults[idx] = { ...localResults[idx], status: "processing" };
              }
              break;
            }
            case "step_start": {
              const stepData = data as { imageIndex: number; stepIndex: number };
              setCurrentStep({ image: stepData.imageIndex, step: stepData.stepIndex });
              break;
            }
            case "token": {
              const tokenData = data as {
                imageIndex: number;
                type: string;
                full: string;
              };
              const idx = tokenData.imageIndex;
              if (localResults[idx]) {
                localResults[idx] = {
                  ...localResults[idx],
                  [tokenData.type === "reasoning"
                    ? "partialReasoning"
                    : "partialCaption"]: tokenData.full,
                };
              }
              break;
            }
            case "image_complete": {
              const completeData = data as {
                index: number;
                status: string;
                caption?: string;
                reasoningContent?: string;
                error?: string;
              };
              const idx = completeData.index;
              if (localResults[idx]) {
                localResults[idx] = {
                  ...localResults[idx],
                  status: completeData.status as CaptionResult["status"],
                  caption: completeData.caption,
                  reasoningContent: completeData.reasoningContent,
                  error: completeData.error,
                  partialCaption: undefined,
                  partialReasoning: undefined,
                };
              }
              setCurrentStep(null);
              break;
            }
            case "done": {
              break;
            }
          }

          // Sync to React state
          setResults([...localResults]);
        }
      }

      // Clear abort controller ref when done
      if (abortControllerRef.current && abortControllerRef.current.signal.aborted) {
        for (const result of localResults) {
          if (result.status === "queued" || result.status === "processing") {
            result.status = "failed";
            result.error = "Stopped by user";
          }
        }
        setResults([...localResults]);
      } else if (isDone) {
        void triggerDownload(localResults);
      }

      abortControllerRef.current = null;
      setIsProcessing(false);
      setCurrentStep(null);
      setPhase("results");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const localResults = initialResults.map((r) => ({
          ...r,
          status: r.status === "queued" || r.status === "processing"
            ? "failed" as const
            : r.status,
          error: r.status === "queued" || r.status === "processing"
            ? "Stopped by user"
            : r.error,
        }));
        setResults(localResults);
      }
      abortControllerRef.current = null;
      setIsProcessing(false);
      setCurrentStep(null);
      setPhase("results");
    }
  }, [state, serverUrl]);

  const handleNewBatch = useCallback(() => {
    setPhase("upload");
    setResults([]);
    setIsProcessing(false);
    setCurrentStep(null);
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Multi-step Mode</h2>
          <p className="text-sm text-slate-400">
            Chain multiple messages for refined captions
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to modes
        </Button>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "configure", "processing", "results"] as const).map((p, i) => (
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
            {i < 3 && <span className="text-slate-600">→</span>}
          </div>
        ))}
      </div>

      {/* Upload phase */}
      {phase === "upload" && (
        <div className="space-y-4">
          <ImageUploader onImagesReady={handleImagesReady} />
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
            <PromptEditor mode="multi-step" />

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
                  state.multiStepMessages.length === 0 ||
                  state.multiStepMessages.every((m) => !m.trim()) ||
                  isProcessing
                }
              >
                Start Captioning ({state.multiStepMessages.length} step
                {state.multiStepMessages.length !== 1 ? "s" : ""})
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Processing + Results phases */}
      {(phase === "processing" || phase === "results") && (
        <div className="space-y-4">
          {/* Current step indicator */}
          {currentStep && isProcessing && (
            <div className="text-center text-sm text-slate-400">
              Processing image {currentStep.image + 1} - Step {currentStep.step + 1} of{" "}
              {state.multiStepMessages.length}
            </div>
          )}

          <CaptionViewer results={results} />

          {phase === "results" && (
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={handleNewBatch}>
                New Batch
              </Button>
              <Button variant="ghost" onClick={() => setPhase("configure")}>
                Edit Prompts
              </Button>
            </div>
          )}

          {isProcessing && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                // Abort the frontend fetch
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
                // Tell the backend to stop processing
                if (sessionIdRef.current) {
                  fetch(`/api/caption/multi-step?sessionId=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
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
