/**
 * Krea 2 mode orchestrator.
 * Three-phase workflow per image: captioning -> refining -> distilling.
 * Each image goes through all 3 phases sequentially (multi-turn conversation).
 * Guides user through: upload -> configure -> processing -> results.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { applyTokenDelta } from "@/lib/token-accumulate";
import { consumeSseStream } from "@/lib/sse-client";
import { ImageUploader } from "@/components/image-uploader";
import { ModelSelector } from "@/components/model-selector";
import { PromptEditor } from "@/components/prompt-editor";
import { CaptionViewer } from "@/components/caption-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "upload" | "configure" | "processing" | "results";
type ImagePhase = "captioning" | "refining" | "distilling" | "completed" | "failed";

interface CaptionResult {
  name: string;
  imageDataUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  imagePhase: "idle" | ImagePhase;
  caption?: string;
  partialCaption?: string;
  reasoningContent?: string;
  partialReasoning?: string;
  error?: string;
  /** Prompt tokens reused from the llama.cpp KV cache (all phases). */
  cachedTokensTotal?: number;
  /** Total prompt tokens processed by all phases for this image. */
  promptTokensTotal?: number;
}

/** Accumulate phase token stats into the per-image totals. */
function withTokenStats(
  result: CaptionResult,
  stats: { cachedTokens?: number; promptTokens?: number }
): CaptionResult {
  return {
    ...result,
    cachedTokensTotal: (result.cachedTokensTotal ?? 0) + (stats.cachedTokens ?? 0),
    promptTokensTotal: (result.promptTokensTotal ?? 0) + (stats.promptTokens ?? 0),
  };
}

/** Format a token count compactly (1234 -> "1.2k"). */
function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trigger a ZIP download from the server temp files. */
async function triggerDownload(sessionId: string | null): Promise<void> {
  if (!sessionId) return;

  try {
    const response = await fetch(`/api/download?sessionId=${sessionId}`);
    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Silently fail - download is a convenience feature
  }
}

/** Get a human-readable label for an image phase. */
function getPhaseLabel(phase: string | undefined): string {
  switch (phase) {
    case "captioning": return "captioning";
    case "refining": return "refining";
    case "distilling": return "distilling";
    default: return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Krea2ModeProps {
  serverUrl: string;
  onBack: () => void;
}

export function Krea2Mode({ serverUrl, onBack }: Krea2ModeProps) {
  const { state, setCharacterDescription } = useSession();
  const [phase, setPhase] = useState<Phase>("upload");
  const [imageCount, setImageCount] = useState(0);
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
        fetch(`/api/caption/krea-2?sessionId=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
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
      imagePhase: "idle" as const,
    }));
    setResults(initialResults);
    setPhase("processing");
    setIsProcessing(true);
    setSessionId(null);
    sessionIdRef.current = null;

    const formData = new FormData();
    const config = {
      serverUrl,
      model: state.model,
      systemPrompt: state.systemPrompt,
      userPrompt: state.userPrompt,
      triggerWordPerson: state.triggerWordPerson,
      triggerWordOther: state.triggerWordOther,
      characterDescription: state.characterDescription,
    };
    formData.append("config", JSON.stringify(config));
    formData.append("imageNames", JSON.stringify(state.imageNames));

    for (let i = 0; i < state.imageFiles.length; i++) {
      formData.append("images", state.imageFiles[i]);
    }

    try {
      const response = await fetch("/api/caption/krea-2", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        const failed = initialResults.map((r) => ({
          ...r,
          status: "failed" as const,
          imagePhase: "failed" as const,
          error: error.error,
        }));
        setResults(failed);
        setIsProcessing(false);
        setPhase("results");
        return;
      }

      const body = response.body;
      if (!body) return;

      const localResults = [...initialResults];

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
          case "phase": {
            // Per-image phase transition (has index)
            const phaseData = event.data as { phase: string; index?: number };
            const idx = phaseData.index;
            if (idx !== undefined && localResults[idx]) {
              const imagePhase = phaseData.phase as ImagePhase;
              localResults[idx] = {
                ...localResults[idx],
                status: "processing",
                imagePhase,
                partialCaption: undefined,
                partialReasoning: undefined,
              };
            }
            break;
          }
          case "image_start": {
            const idx = (event.data as { index: number }).index;
            if (localResults[idx]) {
              localResults[idx] = {
                ...localResults[idx],
                status: "processing",
                imagePhase: "captioning",
              };
            }
            break;
          }
          case "token": {
            // Token events carry deltas only - accumulate into the partial
            const tokenData = event.data as {
              index?: number;
              type: "caption" | "reasoning";
              content: string;
            };
            const tokenIdx = tokenData.index;
            if (tokenIdx !== undefined && localResults[tokenIdx]) {
              localResults[tokenIdx] = applyTokenDelta(localResults[tokenIdx], tokenData);
            }
            break;
          }
          case "image_complete": {
            // Phase 1 complete
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
              localResults[idx] = withTokenStats(
                {
                  ...localResults[idx],
                  status: completeData.status as CaptionResult["status"],
                  caption: completeData.caption,
                  reasoningContent: completeData.reasoningContent,
                  error: completeData.error,
                },
                completeData
              );
              // If failed, mark phase as failed
              if (completeData.status === "failed") {
                localResults[idx].imagePhase = "failed";
              }
            }
            break;
          }
          case "refine_image_complete": {
            // Phase 2 complete - caption will be overwritten by phase 3
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
              localResults[idx] = withTokenStats(
                {
                  ...localResults[idx],
                  caption: completeData.caption,
                  reasoningContent: completeData.reasoningContent,
                },
                completeData
              );
              if (completeData.status === "failed") {
                localResults[idx].imagePhase = "failed";
                localResults[idx].status = "failed";
                localResults[idx].error = "Refinement failed";
              }
            }
            break;
          }
          case "distill_image_complete": {
            // Phase 3 complete - final result
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
              localResults[idx] = withTokenStats(
                {
                  ...localResults[idx],
                  status: completeData.status as CaptionResult["status"],
                  imagePhase:
                    completeData.status === "completed" ? "completed" : "failed",
                  caption: completeData.caption,
                  reasoningContent: completeData.reasoningContent,
                  error: completeData.error,
                  partialCaption: undefined,
                  partialReasoning: undefined,
                },
                completeData
              );
            }
            break;
          }
          case "done": {
            break;
          }
        }

        setResults([...localResults]);
      });

      if (abortControllerRef.current && abortControllerRef.current.signal.aborted) {
        for (const result of localResults) {
          if (result.status === "queued" || result.status === "processing") {
            result.status = "failed";
            result.imagePhase = "failed";
            result.error = "Stopped by user";
          }
        }
        setResults([...localResults]);
      }

      abortControllerRef.current = null;
      setIsProcessing(false);
      setPhase("results");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const localResults = initialResults.map((r) => ({
          ...r,
          status: r.status === "queued" || r.status === "processing"
            ? "failed" as const
            : r.status,
          imagePhase: r.status === "queued" || r.status === "processing"
            ? "failed" as const
            : r.imagePhase,
          error: r.status === "queued" || r.status === "processing"
            ? "Stopped by user"
            : r.error,
        }));
        setResults(localResults);
      }
      abortControllerRef.current = null;
      setIsProcessing(false);
      setPhase("results");
    }
  }, [state, serverUrl]);

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
          <h2 className="text-xl font-semibold text-slate-100">Krea 2 Mode</h2>
          <p className="text-sm text-slate-400">
            Caption, refine, and distill for krea2 prompts
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
            <PromptEditor />

            {/* Character description (required for Krea 2) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Character Description <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-slate-500">
                Describe the character/subject that appears across all images.
                Phase 2 will remove these consistent features from the captions,
                leaving only image-unique details. Phase 3 distills the result
                into a concise krea2-optimized prompt.
              </p>
              <Textarea
                value={state.characterDescription}
                onChange={(e) => setCharacterDescription(e.target.value)}
                rows={4}
                placeholder="e.g. A young woman with long silver hair, green eyes, wearing a red hooded cloak..."
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
                  !state.userPrompt.trim() ||
                  !state.characterDescription.trim() ||
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
                Processing images (captioning, refining, distilling)...
              </span>
            </div>
          )}

          <CaptionViewer
            results={results.map((r) => ({
              ...r,
              // Append current phase label to partial caption for display
              partialCaption: r.partialCaption
                ? `[${getPhaseLabel(r.imagePhase)}] ${r.partialCaption}`
                : r.partialCaption,
            }))}
          />

          {/* KV cache reuse stats across all phases */}
          {(() => {
            const cachedTotal = results.reduce((s, r) => s + (r.cachedTokensTotal ?? 0), 0);
            const promptTotal = results.reduce((s, r) => s + (r.promptTokensTotal ?? 0), 0);
            if (promptTotal === 0) return null;
            const pct = Math.round((cachedTotal / promptTotal) * 100);
            return (
              <p className="text-center text-xs text-slate-500">
                KV cache: {formatTokens(cachedTotal)}/{formatTokens(promptTotal)} prompt
                tokens reused ({pct}%)
              </p>
            );
          })()}

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
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
                if (sessionIdRef.current) {
                  fetch(`/api/caption/krea-2?sessionId=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
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
