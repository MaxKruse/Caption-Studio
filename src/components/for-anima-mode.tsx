/**
 * For Anima mode orchestrator.
 * Guides user through: upload images + captions -> select model -> start -> view results.
 *
 * Takes existing danbooru-style tags (from taggui) and uses an LLM to generate
 * natural language additions that enrich the dataset captions.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { ImageUploader } from "@/components/image-uploader";
import { ModelSelector } from "@/components/model-selector";
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
    // Silently fail
  }
}

interface ForAnimaModeProps {
  serverUrl: string;
  onBack: () => void;
}

export function ForAnimaMode({ serverUrl, onBack }: ForAnimaModeProps) {
  const { state } = useSession();
  const [phase, setPhase] = useState<"upload" | "configure" | "processing" | "results">("upload");
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
        fetch(`/api/caption/for-anima?sessionId=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
      }
    };
  }, []);

  const handleImagesReady = useCallback((count: number) => {
    setImageCount(count);
  }, []);

  // Captions are paired with images in session state (state.imageCaptions)
  const handleCaptionFilesReady = useCallback((_files: File[]) => {
    // No-op: captions are already paired via ImageUploader -> addImage
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

    const formData = new FormData();
    const config = {
      serverUrl,
      model: state.model,
    };
    formData.append("config", JSON.stringify(config));
    formData.append("imageNames", JSON.stringify(state.imageNames));

    for (let i = 0; i < state.imageFiles.length; i++) {
      formData.append("images", state.imageFiles[i]);
      // Send caption text as a blob file so the API route receives it as a File
      if (state.imageCaptions[i]) {
        formData.append("captions", new Blob([state.imageCaptions[i]], { type: "text/plain" }), state.imageNames[i] + ".txt");
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

      const localResults = [...initialResults];
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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

          if (eventType === "session") {
            const sid = (data as { sessionId: string }).sessionId;
            if (sid) {
              sessionIdRef.current = sid;
              setSessionId(sid);
            }
            continue;
          }

          switch (eventType) {
            case "image_start": {
              const idx = (data as { index: number }).index;
              if (localResults[idx]) {
                localResults[idx] = { ...localResults[idx], status: "processing" };
              }
              break;
            }
            case "token": {
              const tokenData = data as {
                index: number;
                type: string;
                full: string;
              };
              const idx = tokenData.index;
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
              break;
            }
            case "done": {
              break;
            }
          }

          setResults([...localResults]);
        }
      }

      if (abortControllerRef.current && abortControllerRef.current.signal.aborted) {
        for (const result of localResults) {
          if (result.status === "queued" || result.status === "processing") {
            result.status = "failed";
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

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">For Anima Mode</h2>
          <p className="text-sm text-slate-400">
            Enhance danbooru tags with natural language descriptions
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
          <ImageUploader
            onImagesReady={handleImagesReady}
            acceptCaptions
            onCaptionsReady={handleCaptionFilesReady}
          />

          {state.imageCaptions.some((c) => c.trim()) && (
            <p className="text-xs text-slate-500">
              {state.imageCaptions.filter((c) => c.trim()).length} caption{state.imageCaptions.filter((c) => c.trim()).length !== 1 ? "s" : ""} paired
            </p>
          )}

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

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setPhase("upload")}>
                Back
              </Button>
              <Button
                onClick={async () => {
                  abortControllerRef.current = new AbortController();
                  await handleStart();
                }}
                disabled={!state.model || isProcessing}
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
          <CaptionViewer results={results} />

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
                Edit Model
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
                  fetch(`/api/caption/for-anima?sessionId=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
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
