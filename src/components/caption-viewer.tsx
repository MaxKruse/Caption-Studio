/**
 * Caption viewer - displays results one image at a time with navigation.
 * Shows the image, its caption, reasoning (if available), and processing status.
 */

"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CaptionResult {
  name: string;
  imageDataUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  partialCaption?: string;
  reasoningContent?: string;
  partialReasoning?: string;
  error?: string;
  prompt?: string;
}

interface CaptionViewerProps {
  results: CaptionResult[];
}

export function CaptionViewer({ results }: CaptionViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showReasoning, setShowReasoning] = useState(false);

  // Auto-advance to next image when current completes
  useEffect(() => {
    const current = results[currentIndex];
    if (current && current.status === "completed") {
      // Small delay so user sees the completed state
      const timer = setTimeout(() => {
        if (currentIndex < results.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, results]);

  if (results.length === 0) return null;

  const current = results[currentIndex];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isDone = results.every((r) => r.status === "completed" || r.status === "failed");
  const displayCaption = current.partialCaption || current.caption || "";
  const displayReasoning = current.partialReasoning || current.reasoningContent || "";

  const goToImage = (index: number) => {
    setCurrentIndex(index);
    setShowReasoning(false);
  };

  return (
    <div className="space-y-4">
      {/* Image thumbnail strip */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {results.map((result, index) => (
          <button
            key={index}
            onClick={() => goToImage(index)}
            className={`
              flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all
              ${index === currentIndex
                ? "border-indigo-400 scale-110"
                : "border-slate-700 hover:border-slate-500"
              }
              ${result.status === "completed" ? "opacity-100" : "opacity-60"}
            `}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageDataUrl}
              alt={result.name}
              className="w-full h-full object-cover"
            />
            {result.status === "completed" && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-full" />
            )}
            {result.status === "failed" && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Main display */}
      <Card variant="elevated">
        <div className="space-y-4">
          {/* Image and status header */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.imageDataUrl}
                alt={current.name}
                className="max-h-64 rounded-lg object-contain bg-slate-900"
              />
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium text-slate-200">{current.name}</p>
              <p className="text-xs text-slate-500">
                {currentIndex + 1} of {results.length}
              </p>
              <span
                className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${
                  current.status === "completed"
                    ? "bg-green-900/50 text-green-300"
                    : current.status === "failed"
                      ? "bg-red-900/50 text-red-300"
                      : current.status === "processing"
                        ? "bg-amber-900/50 text-amber-300 animate-pulse"
                        : "bg-slate-700 text-slate-400"
                }`}
              >
                {current.status}
              </span>
            </div>
          </div>

          {/* Caption output */}
          {(displayCaption || current.status === "processing") && (
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-1">Caption</h4>
              <div className="bg-slate-900/50 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap min-h-[48px]">
                {displayCaption || (
                  <span className="text-slate-500 italic">Generating...</span>
                )}
                {current.status === "processing" && (
                  <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5" />
                )}
              </div>
            </div>
          )}

          {/* Reasoning toggle */}
          {(displayReasoning || (current.reasoningContent && !showReasoning)) && (
            <div>
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1"
              >
                <span className={`transform transition-transform ${showReasoning ? "rotate-90" : ""}`}>
                  ▶
                </span>
                {showReasoning ? "Hide" : "Show"} reasoning
              </button>
              {showReasoning && (
                <div className="mt-2 bg-slate-900/30 rounded-lg p-3 text-xs text-slate-400 whitespace-pre-wrap">
                  {displayReasoning}
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {current.error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300">
              {current.error}
            </div>
          )}

          {/* Prompt used */}
          {current.prompt && (
            <details className="text-xs">
              <summary className="text-slate-500 cursor-pointer hover:text-slate-400">
                Show prompt used
              </summary>
              <pre className="mt-1 bg-slate-900/50 rounded p-2 text-slate-400 whitespace-pre-wrap">
                {current.prompt}
              </pre>
            </details>
          )}
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goToImage(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>
        <span className="text-sm text-slate-400">
          {currentIndex + 1} / {results.length}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goToImage(Math.min(results.length - 1, currentIndex + 1))}
          disabled={currentIndex === results.length - 1}
        >
          Next
        </Button>
      </div>

      {/* Progress summary */}
      <div className="text-xs text-slate-500 text-center">
        {results.filter((r) => r.status === "completed").length} completed,
        {" "}{results.filter((r) => r.status === "failed").length} failed,
        {" "}{results.filter((r) => r.status === "processing").length} processing,
        {" "}{results.filter((r) => r.status === "queued").length} queued
      </div>
    </div>
  );
}
