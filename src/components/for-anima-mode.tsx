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
import {
  CHUNK_UPLOAD_TIMEOUT_MS,
  planChunkedUpload,
  buildChunkFormData,
  buildSingleShotFormData,
} from "@/lib/upload-chunking";
import { sleep } from "@/lib/caption-helpers";
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
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Why the run stopped (user stop vs. failed chunk upload). */
  const stopReasonRef = useRef<string>("Stopped by user");

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

    // Tag images one by one (no batching per user request).
    const localTags = [...initialTags];

    // Re-render at most every 200ms: with hundreds of images, flushing on
    // every image re-renders the whole results list O(n^2) times.
    let lastFlush = 0;
    const flushProgress = (index: number | null, force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < 200) return;
      lastFlush = now;
      setTagResults([...localTags]);
      setCurrentTagIndex(index);
    };

    const imageFiles = state.imageFiles;
    for (let i = 0; i < imageFiles.length; i++) {
      localTags[i] = { ...localTags[i], status: "tagging" };
      flushProgress(i);

      // Base64 is read right before the request: pre-encoding a whole
      // batch would hold ~1.3x its size in strings for the entire run.
      let base64 = "";
      try {
        base64 = await fileToBase64(imageFiles[i]);
      } catch {
        base64 = "";
      }

      try {
        const res = await fetch("/api/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64,
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
        } else {
          const data = await res.json();
          localTags[i] = {
            tags: data.tags ?? [],
            tagsWithProbs: data.tagsWithProbs ?? [],
            status: "done",
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        localTags[i] = { ...localTags[i], status: "error", error: message };
      }
      flushProgress(i);
    }

    flushProgress(null, true);
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
    setServerNotice(null);
    sessionIdRef.current = null;
    stopReasonRef.current = "Stopped by user";

    const initialLlm: CaptionResult[] = state.images.map((dataUrl, i) => ({
      name: state.imageNames[i] || `image-${i}.jpg`,
      imageDataUrl: dataUrl,
      status: "queued" as const,
    }));
    setLlmResults(initialLlm);

    const total = state.imageFiles.length;
    const baseConfig = { serverUrl, model: state.model };
    // Generated tags become the booru caption text for each image
    const captionTexts = state.imageNames.map((_, i) => (tagResults[i]?.tags ?? []).join(", "));
    const signal = abortControllerRef.current?.signal;

    // Large batches upload in chunks: chunk 0 opens the SSE stream and the
    // server starts captioning while the remaining chunks are still in
    // flight. Small batches keep the single-shot request shape.
    const plan = planChunkedUpload(total);
    const chunkJobs: Promise<void>[] = [];
    // Aborted when the SSE stream ends (done, error, or user stop) so an
    // in-flight chunk upload cannot wedge the finalization wait: by then
    // the session is already over, so unacked chunks are either already
    // saved (the queue drained) or would get a 404 anyway.
    const chunkAbort = new AbortController();

    let response: Response;
    try {
      if (plan.isChunked) {
        const uploadSessionId = crypto.randomUUID();
        // The deadline only bounds the wait for the first response headers:
        // once the SSE stream is open it must be allowed to run for the
        // entire captioning duration, so the timer is cleared as soon as the
        // fetch resolves.
        const chunk0Deadline = new AbortController();
        const deadlineTimer = setTimeout(() => {
          chunk0Deadline.abort(
            new DOMException(
              "Timed out waiting for the server to accept the first chunk",
              "TimeoutError"
            )
          );
        }, CHUNK_UPLOAD_TIMEOUT_MS);
        try {
          response = await fetch("/api/caption/for-anima", {
            method: "POST",
            body: buildChunkFormData({
              baseConfig,
              sessionId: uploadSessionId,
              expectedImageCount: total,
              chunkIndex: 0,
              chunkSize: plan.chunkSize,
              imageFiles: state.imageFiles,
              imageNames: state.imageNames,
              captionTexts,
            }),
            signal: signal
              ? AbortSignal.any([signal, chunk0Deadline.signal])
              : chunk0Deadline.signal,
          });
        } finally {
          clearTimeout(deadlineTimer);
        }

        // Remaining chunks: JSON ack, retried on failure. A 404 means the
        // session already finished (upload slower than inference) - OK.
        for (let c = 1; c < plan.chunks; c++) {
          chunkJobs.push(
            (async () => {
              for (let attempt = 1; attempt <= 3; attempt++) {
                if (signal?.aborted || chunkAbort.signal.aborted) return;
                try {
                  // Per-attempt deadline: a hung body read must fail and
                  // retry, not block finalization forever.
                  const attemptSignal = AbortSignal.any([
                    chunkAbort.signal,
                    AbortSignal.timeout(CHUNK_UPLOAD_TIMEOUT_MS),
                    ...(signal ? [signal] : []),
                  ]);
                  const res = await fetch("/api/caption/for-anima", {
                    method: "POST",
                    body: buildChunkFormData({
                      baseConfig,
                      sessionId: uploadSessionId,
                      expectedImageCount: total,
                      chunkIndex: c,
                      chunkSize: plan.chunkSize,
                      imageFiles: state.imageFiles,
                      imageNames: state.imageNames,
                      captionTexts,
                    }),
                    signal: attemptSignal,
                  });
                  if (res.ok || res.status === 404) return;
                  throw new Error(`chunk rejected (HTTP ${res.status})`);
                } catch (error) {
                  if (signal?.aborted || chunkAbort.signal.aborted) return;
                  if (attempt === 3) {
                    stopReasonRef.current = `A batch chunk failed to upload: ${
                      error instanceof Error ? error.message : String(error)
                    }`;
                    abortControllerRef.current?.abort();
                    if (sessionIdRef.current) {
                      stopCaptionSession("/api/caption/for-anima", sessionIdRef.current);
                    }
                    return;
                  }
                  await sleep(1500 * attempt);
                }
              }
            })()
          );
        }
      } else {
        const formData = buildSingleShotFormData({
          config: baseConfig,
          imageFiles: state.imageFiles,
          imageNames: state.imageNames,
          captionTexts,
        });
        response = await fetch("/api/caption/for-anima", {
          method: "POST",
          body: formData,
          signal,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = initialLlm.map((r) => ({
        ...r,
        status: "failed" as const,
        error: signal?.aborted ? stopReasonRef.current : message,
      }));
      setLlmResults(failed);
      abortControllerRef.current = null;
      setIsProcessing(false);
      setAppPhase("results");
      return;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Upload failed" }));
      const failed = initialLlm.map((r) => ({ ...r, status: "failed" as const, error: error.error }));
      setLlmResults(failed);
      abortControllerRef.current = null;
      setIsProcessing(false);
      setAppPhase("results");
      return;
    }

    const body = response.body;
    if (!body) {
      abortControllerRef.current = null;
      setIsProcessing(false);
      setAppPhase("results");
      return;
    }

    const localLlm = [...initialLlm];
    let streamError: string | null = null;
    // Server-side failure reason (e.g. the chunk-idle watchdog's
    // "Upload incomplete: expected N images, received M") - shown per
    // image at finalization instead of the generic fallback.
    let serverError: string | null = null;

    try {
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
          case "warning":
          case "error": {
            const data = event.data as { message?: string; error?: string };
            const message = data.message ?? data.error ?? null;
            setServerNotice(message);
            if (event.type === "error" && message) {
              serverError = message;
            }
            break;
          }
        }

        setLlmResults([...localLlm]);
      });
    } catch (error) {
      streamError = error instanceof Error ? error.message : String(error);
    }

    // Wait for in-flight chunk uploads to settle before finalizing. The
    // stream has ended, so stop them first: otherwise a hung body read
    // would block finalization indefinitely.
    chunkAbort.abort();
    await Promise.all(chunkJobs);

    // Never leave images stuck as queued/processing: the stream ended
    // (normal completion, abort, upload timeout, or server error).
    for (const result of localLlm) {
      if (result.status === "queued" || result.status === "processing") {
        result.status = "failed";
        result.error = signal?.aborted
          ? stopReasonRef.current
          : streamError ?? serverError ?? "The stream ended before this image finished";
      }
    }
    setLlmResults([...localLlm]);

    abortControllerRef.current = null;
    setIsProcessing(false);
    setAppPhase("results");
  }, [state, serverUrl, tagResults]);

  const handleNewBatch = useCallback(() => {
    setAppPhase("upload");
    setTagResults([]);
    setLlmResults([]);
    setIsProcessing(false);
    setSessionId(null);
    setServerNotice(null);
    sessionIdRef.current = null;
    stopReasonRef.current = "Stopped by user";
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
                        loading="lazy"
                        decoding="async"
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

          {serverNotice && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 text-sm text-amber-200">
              {serverNotice}
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
                stopReasonRef.current = "Stopped by user";
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
