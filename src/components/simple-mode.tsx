/**
 * Simple mode orchestrator.
 * Guides user through: upload images -> select model -> edit prompts -> start -> view results.
 */

"use client";

import { useState, useCallback } from "react";
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

interface SimpleModeProps {
  serverUrl: string;
  onBack: () => void;
}

export function SimpleMode({ serverUrl, onBack }: SimpleModeProps) {
  const { state } = useSession();
  const [phase, setPhase] = useState<"upload" | "configure" | "processing" | "results">("upload");
  const [imageCount, setImageCount] = useState(0);
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImagesReady = useCallback((count: number) => {
    setImageCount(count);
  }, []);

  const handleStart = useCallback(async () => {
    // Initialize results array
    setResults(
      state.images.map((dataUrl, i) => ({
        name: state.imageNames[i] || `image-${i}.jpg`,
        imageDataUrl: dataUrl,
        status: "queued" as const,
      }))
    );
    setPhase("processing");
    setIsProcessing(true);

    const images = state.images.map((dataUrl, i) => ({
      imageDataUrl: dataUrl,
      imageName: state.imageNames[i] || `image-${i}.jpg`,
    }));

    const response = await fetch("/api/caption/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverUrl,
        model: state.model,
        systemPrompt: state.systemPrompt,
        userPrompt: state.userPrompt,
        images,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      setResults((prev) =>
        prev.map((r) => ({ ...r, status: "failed" as const, error: error.error }))
      );
      setIsProcessing(false);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const block of lines) {
        const eventMatch = block.match(/^event: (\w+)\s*\n\/data: ([\s\S]+)$/);
        if (!eventMatch) continue;

        const eventType = eventMatch[1];
        let data: unknown;
        try {
          data = JSON.parse(eventMatch[2]);
        } catch {
          continue;
        }

        setResults((prev) => {
          const updated = [...prev];

          switch (eventType) {
            case "image_start": {
              const idx = (data as { index: number }).index;
              if (updated[idx]) {
                updated[idx] = { ...updated[idx], status: "processing" };
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
              if (updated[idx]) {
                updated[idx] = {
                  ...updated[idx],
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
              if (updated[idx]) {
                updated[idx] = {
                  ...updated[idx],
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
          }

          return updated;
        });
      }
    }

    setIsProcessing(false);
    setPhase("results");
  }, [state, serverUrl]);

  const handleNewBatch = useCallback(() => {
    setPhase("upload");
    setResults([]);
    setIsProcessing(false);
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Simple Mode</h2>
          <p className="text-sm text-slate-400">
            One prompt per image - quick and straightforward
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
            <PromptEditor mode="simple" />

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setPhase("upload")}>
                Back
              </Button>
              <Button
                onClick={handleStart}
                disabled={!state.model || !state.userPrompt.trim() || isProcessing}
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
                setIsProcessing(false);
                setPhase("results");
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
