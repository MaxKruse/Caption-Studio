/**
 * For Anima mode orchestrator.
 *
 * Workflow:
 * 1. Upload images
 * 2. Configure WD Tagger params + start tagging
 * 3. Review generated tags per image (can redo or continue)
 * 4. Select LLM model + start LLM captioning
 * 5. View final results (booru tags + LLM addition)
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { applyTokenDelta } from "@/lib/token-accumulate";
import { consumeSseStream } from "@/lib/sse-client";
import { triggerDownload } from "@/lib/download";
import { fileToBase64 } from "@/lib/file-utils";
import { CaptionResult, stopCaptionSession } from "@/lib/caption-result";
import { ImageUploader } from "@/components/image-uploader";
import { ModelSelector } from "@/components/model-selector";
import { CaptionViewer } from "@/components/caption-viewer";
import { KvCacheStats } from "@/components/kv-cache-stats";
import { TagStats } from "@/components/tag-stats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppPhase = "upload" | "tag" | "tag-review" | "llm" | "llm-processing" | "results";

interface TagResult {
  tags: string[];
  tagsWithProbs: { tag: string; probability: number }[];
  status: "pending" | "tagging" | "done" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ForAnimaModeProps {
  serverUrl: string;
  onBack: () => void;
}

export function ForAnimaMode({ serverUrl, onBack }: ForAnimaModeProps) {
  const { state, setTagMinProbability, setTagMaxTags, setTagEncourage, setTagExclude, setTagCustomTags } = useSession();

  const [appPhase, setAppPhase] = useState<AppPhase>("upload");
  const [imageCount, setImageCount] = useState(0);
  const [tagResults, setTagResults] = useState<TagResult[]>([]);
  const [isTagging, setIsTagging] = useState(false);
  const [currentTagIndex, setCurrentTagIndex] = useState<number | null>(null);

  // LLM captioning state
  const [llmResults, setLlmResults] = useState<CaptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (sessionIdRef.current) {
        stopCaptionSession("/api/caption/for-anima", sessionIdRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Upload phase
  // ---------------------------------------------------------------------------

  const handleImagesReady = useCallback((count: number) => {
    setImageCount(count);
  }, []);

  // ---------------------------------------------------------------------------
  // Tag phase
  // ---------------------------------------------------------------------------

  const handleStartTagging = useCallback(async () => {
    setAppPhase("tag");
    setIsTagging(true);

    const initialTags: TagResult[] = state.images.map(() => ({
      tags: [],
      tagsWithProbs: [],
      status: "pending",
    }));
    setTagResults(initialTags);

    // Tag images one by one (no batching per user request). Base64 is read
    // from the raw File on demand - previews use object URLs.
    const localTags = [...initialTags];
    const base64Images: string[] = new Array(state.imageFiles.length);
    for (let i = 0; i < state.imageFiles.length; i++) {
      try {
        base64Images[i] = await fileToBase64(state.imageFiles[i]);
      } catch {
        base64Images[i] = "";
      }
    }

    for (let i = 0; i < base64Images.length; i++) {
      setCurrentTagIndex(i);
      localTags[i] = { ...localTags[i], status: "tagging" };
      setTagResults([...localTags]);

      try {
        const res = await fetch("/api/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64Images[i],
            minProbability: state.tagMinProbability,
            maxTags: state.tagMaxTags,
            customTags: state.tagCustomTags,
            tagsToEncourage: state.tagEncourage,
            tagsToExclude: state.tagExclude,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          localTags[i] = { ...localTags[i], status: "error", error: err.error || "Tagging failed" };
          setTagResults([...localTags]);
          continue;
        }

        const data = await res.json();
        localTags[i] = {
          tags: data.tags ?? [],
          tagsWithProbs: data.tagsWithProbs ?? [],
          status: "done",
        };
        setTagResults([...localTags]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        localTags[i] = { ...localTags[i], status: "error", error: message };
        setTagResults([...localTags]);
      }
    }

    setCurrentTagIndex(null);
    setIsTagging(false);
    setAppPhase("tag-review");
  }, [state]);

  const handleRedoTagging = useCallback(() => {
    setTagResults([]);
    setAppPhase("tag");
  }, []);

  /** Completed-tagging images that came back with zero tags. */
  const noTagCount = tagResults.filter(
    (tr) => tr.status === "done" && tr.tags.length === 0
  ).length;

  // Store generated tags into session state for LLM captioning
  const handleContinueToLlm = useCallback(() => {
    // Update imageCaptions with generated tags
    // We need to use the session state setters, but since imageCaptions is set
    // via addImage, we'll store them in a local ref and use them in the LLM step.
    setAppPhase("llm");
  }, []);

  // ---------------------------------------------------------------------------
  // LLM captioning phase
  // ---------------------------------------------------------------------------

  const handleStartLlm = useCallback(async () => {
    setAppPhase("llm-processing");
    setIsProcessing(true);
    setSessionId(null);
    sessionIdRef.current = null;

    const initialLlm: CaptionResult[] = state.images.map((dataUrl, i) => ({
      name: state.imageNames[i] || `image-${i}.jpg`,
      imageDataUrl: dataUrl,
      status: "queued" as const,
    }));
    setLlmResults(initialLlm);

    // Build FormData
    const formData = new FormData();
    const config = {
      serverUrl,
      model: state.model,
    };
    formData.append("config", JSON.stringify(config));
    formData.append("imageNames", JSON.stringify(state.imageNames));

    for (let i = 0; i < state.imageFiles.length; i++) {
      formData.append("images", state.imageFiles[i]);
      // Use generated tags as caption text
      const tags = tagResults[i]?.tags ?? [];
      const captionText = tags.join(", ");
      if (captionText) {
        formData.append("captions", new Blob([captionText], { type: "text/plain" }), state.imageNames[i] + ".txt");
      }
    }

    try {
      const response = await fetch("/api/caption/for-anima", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        const failed = initialLlm.map((r) => ({ ...r, status: "failed" as const, error: error.error }));
        setLlmResults(failed);
        setIsProcessing(false);
        setAppPhase("results");
        return;
      }

      const body = response.body;
      if (!body) return;

      const localLlm = [...initialLlm];

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
            if (localLlm[idx]) localLlm[idx] = { ...localLlm[idx], status: "processing" };
            break;
          }
          case "token": {
            // Token events carry deltas only - accumulate into the partial
            const tokenData = event.data as {
              index: number;
              type: "caption" | "reasoning";
              content: string;
            };
            const idx = tokenData.index;
            if (localLlm[idx]) {
              localLlm[idx] = applyTokenDelta(localLlm[idx], tokenData);
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
            if (localLlm[idx]) {
              localLlm[idx] = {
                ...localLlm[idx],
                status: completeData.status as CaptionResult["status"],
                caption: completeData.caption,
                reasoningContent: completeData.reasoningContent,
                error: completeData.error,
                cachedTokens: completeData.cachedTokens,
                promptTokens: completeData.promptTokens,
                partialCaption: undefined,
                partialReasoning: undefined,
              };
            }
            break;
          }
        }

        setLlmResults([...localLlm]);
      });

      if (abortControllerRef.current && abortControllerRef.current.signal.aborted) {
        for (const result of localLlm) {
          if (result.status === "queued" || result.status === "processing") {
            result.status = "failed";
            result.error = "Stopped by user";
          }
        }
        setLlmResults([...localLlm]);
      }

      abortControllerRef.current = null;
      setIsProcessing(false);
      setAppPhase("results");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Already handled abort above
      }
      abortControllerRef.current = null;
      setIsProcessing(false);
      setAppPhase("results");
    }
  }, [state, serverUrl, tagResults]);

  const handleNewBatch = useCallback(() => {
    setAppPhase("upload");
    setTagResults([]);
    setLlmResults([]);
    setIsProcessing(false);
    setSessionId(null);
    sessionIdRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // Phase indicator
  // ---------------------------------------------------------------------------

  const allPhases: AppPhase[] = ["upload", "tag", "tag-review", "llm", "llm-processing", "results"];
  const phaseLabels: Record<AppPhase, string> = {
    "upload": "upload",
    "tag": "tag",
    "tag-review": "review tags",
    "llm": "configure LLM",
    "llm-processing": "processing",
    "results": "results",
  };

  const currentPhaseIndex = allPhases.indexOf(appPhase);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">For Anima Mode</h2>
          <p className="text-sm text-slate-400">
            Auto-tag with WD Tagger, then enhance with LLM
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to modes
        </Button>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {allPhases.map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded-full ${
                i <= currentPhaseIndex
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {phaseLabels[p]}
            </span>
            {i < allPhases.length - 1 && <span className="text-slate-600">{"\u2192"}</span>}
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* Upload phase */}
      {/* ----------------------------------------------------------------------- */}
      {appPhase === "upload" && (
        <div className="space-y-4">
          <ImageUploader onImagesReady={handleImagesReady} />
          <div className="flex justify-end">
            <Button
              onClick={() => setAppPhase("tag")}
              disabled={imageCount === 0}
            >
              Continue ({imageCount} image{imageCount !== 1 ? "s" : ""})
            </Button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* Tag phase (configure + run) */}
      {/* ----------------------------------------------------------------------- */}
      {appPhase === "tag" && (
        <Card>
          <div className="space-y-4">
            {/* Tagging progress */}
            {isTagging && (
              <div className="text-center text-sm text-slate-400">
                {currentTagIndex !== null
                  ? `Tagging image ${currentTagIndex + 1} of ${state.images.length}...`
                  : "Tagging..."}
              </div>
            )}

            {/* Tag results (live during tagging) */}
            {tagResults.length > 0 && (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {tagResults.map((tr, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-xs text-slate-500 pt-1 min-w-[20px] text-right">
                      {i + 1}.
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-slate-400 mb-1">
                        {state.imageNames[i] || `image-${i}`}
                      </p>
                      {tr.status === "tagging" && (
                        <span className="text-xs text-indigo-400">Tagging...</span>
                      )}
                      {tr.status === "pending" && (
                        <span className="text-xs text-slate-500">Pending...</span>
                      )}
                      {tr.status === "error" && (
                        <span className="text-xs text-red-400">Error: {tr.error}</span>
                      )}
                      {tr.status === "done" && (
                        <div className="flex flex-wrap gap-1">
                          {tr.tags.map((tag, j) => (
                            <span
                              key={j}
                              className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tag parameters */}
            <TagParameters
              minProbability={state.tagMinProbability}
              maxTags={state.tagMaxTags}
              encourage={state.tagEncourage}
              exclude={state.tagExclude}
              customTags={state.tagCustomTags}
              onMinProbability={setTagMinProbability}
              onMaxTags={setTagMaxTags}
              onEncourage={setTagEncourage}
              onExclude={setTagExclude}
              onCustomTags={setTagCustomTags}
            />

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setAppPhase("upload")}>
                Back
              </Button>
              <Button
                onClick={handleStartTagging}
                disabled={isTagging || state.images.length === 0}
              >
                {isTagging ? "Tagging..." : "Start Tagging"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* Tag review phase */}
      {/* ----------------------------------------------------------------------- */}
      {appPhase === "tag-review" && (
        <div className="space-y-4">
          {/* Tag stats overview */}
          <TagStats
            tagLists={tagResults.map((tr) => tr.tags)}
            totalImages={tagResults.length}
          />

          {/* Per-image tag review */}
          <Card>
            <div className="space-y-4">
              {noTagCount > 0 && (
                <p className="text-xs text-amber-400">
                  {noTagCount} of {tagResults.length} images have no tags - try a lower
                  minimum probability and redo tagging.
                </p>
              )}
              <h3 className="text-sm font-medium text-slate-300">Generated Tags Per Image</h3>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {tagResults.map((tr, i) => (
                  <div key={i} className="flex gap-3 items-start border-b border-slate-700/50 pb-3">
                    <div className="w-16 h-16 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={state.images[i]}
                        alt={state.imageNames[i]}
                        className="w-full h-full object-cover rounded"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 mb-1 truncate">
                        {state.imageNames[i] || `image-${i}`}
                      </p>
                      {tr.status === "error" ? (
                        <span className="text-xs text-red-400">Error: {tr.error}</span>
                      ) : tr.status === "done" && tr.tags.length === 0 ? (
                        <span className="text-xs text-amber-400">No tags generated</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tr.tags.map((tag, j) => (
                            <span
                              key={j}
                              className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={handleRedoTagging}>
                  Redo Tagging
                </Button>
                <Button variant="primary" onClick={handleContinueToLlm}>
                  Continue to LLM Tagging
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* LLM configure phase */}
      {/* ----------------------------------------------------------------------- */}
      {appPhase === "llm" && (
        <Card>
          <div className="space-y-4">
            <ModelSelector serverUrl={serverUrl} />

            <div className="flex justify-between">
              <Button variant="secondary" onClick={handleRedoTagging}>
                Back to Tags
              </Button>
              <Button
                onClick={async () => {
                  abortControllerRef.current = new AbortController();
                  await handleStartLlm();
                }}
                disabled={!state.model || isProcessing}
              >
                Start Captioning
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* LLM processing + results phases */}
      {/* ----------------------------------------------------------------------- */}
      {(appPhase === "llm-processing" || appPhase === "results") && (
        <div className="space-y-4">
          {appPhase === "llm-processing" && (
            <div className="text-center">
              <span className="text-sm font-medium text-indigo-300">
                Enhancing captions with LLM...
              </span>
            </div>
          )}

          {/* KV cache reuse stats */}
          <KvCacheStats results={llmResults} />

          <CaptionViewer results={llmResults} />

          {appPhase === "results" && (
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
                  stopCaptionSession("/api/caption/for-anima", sessionIdRef.current);
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

// ---------------------------------------------------------------------------
// Tag parameters panel
// ---------------------------------------------------------------------------

interface TagParametersProps {
  minProbability: number;
  maxTags: number;
  encourage: string;
  exclude: string;
  customTags: string;
  onMinProbability: (v: number) => void;
  onMaxTags: (v: number) => void;
  onEncourage: (v: string) => void;
  onExclude: (v: string) => void;
  onCustomTags: (v: string) => void;
}

function TagParameters({
  minProbability,
  maxTags,
  encourage,
  exclude,
  customTags,
  onMinProbability,
  onMaxTags,
  onEncourage,
  onExclude,
  onCustomTags,
}: TagParametersProps) {
  return (
    <div className="border border-slate-700 rounded-lg px-3 py-3 space-y-3">
      <h3 className="text-sm font-medium text-slate-300">WD Tagger Settings</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Min Probability ({minProbability})
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minProbability}
            onChange={(e) => onMinProbability(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Max Tags ({maxTags})
          </label>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={maxTags}
            onChange={(e) => onMaxTags(parseInt(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">
          Custom Tags (comma-separated)
        </label>
        <Input
          value={customTags}
          onChange={(e) => onCustomTags(e.target.value)}
          placeholder="e.g. character name, artist name"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">
          Tags to Encourage (comma-separated)
        </label>
        <Input
          value={encourage}
          onChange={(e) => onEncourage(e.target.value)}
          placeholder="e.g. 1girl, solo, long hair"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">
          Tags to Exclude (comma-separated)
        </label>
        <Input
          value={exclude}
          onChange={(e) => onExclude(e.target.value)}
          placeholder="e.g. low quality, blurry"
        />
      </div>
    </div>
  );
}
