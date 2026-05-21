"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelInfo {
  id: string;
  owned_by?: string;
}

interface ImageFile {
  name: string;
  data: string; // raw base64
  preview: string; // data URL
}

interface ProgressState {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  done?: boolean;
  statuses?: Record<string, ImageStatus>;
}

interface ImageStatus {
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-zinc-200 text-zinc-500",
    processing: "bg-zinc-400 text-zinc-900 animate-pulse",
    completed: "bg-zinc-700 text-zinc-100",
    failed: "bg-zinc-500 text-zinc-200",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded uppercase tracking-wide ${styles[status] || styles.queued}`}
    >
      {status}
    </span>
  );
}

function ImageCard({
  img,
  status,
  onRemove,
  disabled,
}: {
  img: ImageFile;
  status?: ImageStatus;
  onRemove: (name: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="relative group border border-zinc-200 rounded overflow-hidden bg-white">
      <img
        src={img.preview}
        alt={img.name}
        className="w-full h-28 object-cover"
      />

      {/* Filename + status bar */}
      <div className="absolute bottom-0 inset-x-0 bg-zinc-900/70 px-2 py-1 flex items-center justify-between gap-1">
        <span className="text-[11px] text-zinc-200 truncate flex-1">
          {img.name}
        </span>
        {status && <StatusBadge status={status.status} />}
      </div>

      {/* Remove button */}
      {!disabled && (
        <button
          onClick={() => onRemove(img.name)}
          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-zinc-900/60 text-zinc-200 rounded text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-900/80"
          aria-label={`Remove ${img.name}`}
        >
          &times;
        </button>
      )}

      {/* Caption preview */}
      {status?.caption && (
        <div className="px-2 py-1.5 border-t border-zinc-100">
          <p className="text-[11px] text-zinc-500 line-clamp-3 leading-relaxed">
            {status.caption}
          </p>
        </div>
      )}

      {/* Error preview */}
      {status?.error && (
        <div className="px-2 py-1.5 border-t border-zinc-100">
          <p className="text-[10px] text-zinc-400 line-clamp-2">
            Error: {status.error}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CaptionStudio() {
  // -- API Configuration --
  const [serverUrl, setServerUrl] = useState("http://localhost:8080");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState("");

  // -- Prompts --
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant that describes images."
  );
  const [promptPrefix, setPromptPrefix] = useState(
    "The subject's name is"
  );
  const [userPrompt, setUserPrompt] = useState(
    "Describe this image in detail."
  );

  // -- Images --
  const [images, setImages] = useState<ImageFile[]>([]);
  const [imageStatuses, setImageStatuses] = useState<
    Record<string, ImageStatus>
  >({});

  // -- Job state --
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -----------------------------------------------------------------------
  // Auto-fetch models on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    fetchModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // -----------------------------------------------------------------------
  // Fetch models from the configured server
  // -----------------------------------------------------------------------
  const fetchModels = useCallback(async () => {
    if (!serverUrl.trim()) {
      setModelError("Enter a server URL first");
      return;
    }

    setModelLoading(true);
    setModelError("");
    setModels([]);
    setSelectedModel("");

    try {
      const res = await fetch(
        `/api/models?serverUrl=${encodeURIComponent(serverUrl.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setModelError(data.error || "Failed to fetch models");
        return;
      }

      setModels(data.models || []);
      if (data.models?.length > 0) {
        setSelectedModel(data.models[0].id);
      }
    } catch {
      setModelError("Network error - check the server URL");
    } finally {
      setModelLoading(false);
    }
  }, [serverUrl]);

  // -----------------------------------------------------------------------
  // Process files (shared by file input and drag-drop)
  // -----------------------------------------------------------------------
  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (fileList.length === 0) return;

      const newImages: ImageFile[] = [];
      const rejected: string[] = [];
      let loaded = 0;
      const total = fileList.length;

      for (const file of Array.from(fileList)) {
        const ext = getFileExtension(file.name);
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          rejected.push(file.name);
          loaded++;
          continue;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          const base64 = result.split(",")[1] ?? result;
          newImages.push({
            name: file.name,
            data: base64,
            preview: result,
          });
          loaded++;

          if (loaded === total) {
            setImages((prev) => [...prev, ...newImages]);
            if (rejected.length > 0) {
              setErrorMessage(
                `Skipped unsupported files: ${rejected.join(", ")}`
              );
            }
          }
        };
        reader.onerror = () => {
          rejected.push(file.name);
          loaded++;
          if (loaded === total) {
            setImages((prev) => [...prev, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    []
  );

  // -----------------------------------------------------------------------
  // Drag and drop handlers
  // -----------------------------------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      if (isProcessing) return;
      processFiles(e.dataTransfer.files);
    },
    [isProcessing, processFiles]
  );

  // -----------------------------------------------------------------------
  // Remove an image
  // -----------------------------------------------------------------------
  const removeImage = useCallback((name: string) => {
    setImages((prev) => prev.filter((img) => img.name !== name));
    setImageStatuses((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Clear all images
  // -----------------------------------------------------------------------
  const clearAll = useCallback(() => {
    setImages([]);
    setImageStatuses({});
    setJobId(null);
    setProgress({
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    });
  }, []);

  // -----------------------------------------------------------------------
  // Start batch captioning
  // -----------------------------------------------------------------------
  const startCaptioning = useCallback(async () => {
    if (images.length === 0) {
      setErrorMessage("Upload at least one image");
      return;
    }
    if (!selectedModel) {
      setErrorMessage("Select a model");
      return;
    }
    if (!serverUrl.trim()) {
      setErrorMessage("Enter a server URL");
      return;
    }

    // Close any existing SSE connection
    eventSourceRef.current?.close();

    setErrorMessage("");
    setIsProcessing(true);
    setImageStatuses({});

    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((img) => ({ name: img.name, data: img.data })),
          serverUrl: serverUrl.trim(),
          model: selectedModel,
          systemPrompt,
          promptPrefix,
          userPrompt,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to start captioning");
        setIsProcessing(false);
        return;
      }

      setJobId(data.jobId);

      // Initialize statuses
      const initial: Record<string, ImageStatus> = {};
      for (const img of images) {
        initial[img.name] = { status: "queued" };
      }
      setImageStatuses(initial);

      // Connect to SSE progress stream
      const es = new EventSource(`/api/caption?jobId=${data.jobId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setProgress(payload);
        if (payload.statuses) {
          setImageStatuses(payload.statuses);
        }
        if (payload.done) {
          es.close();
          eventSourceRef.current = null;
          setIsProcessing(false);
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        // SSE error doesn't stop the job - polling will pick up status
      };
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unexpected error"
      );
      setIsProcessing(false);
    }
  }, [images, selectedModel, serverUrl, systemPrompt, promptPrefix, userPrompt]);

  // -----------------------------------------------------------------------
  // Polling fallback for status updates
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?jobId=${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.statuses) {
          setImageStatuses(data.statuses);
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  // -----------------------------------------------------------------------
  // Download ZIP
  // -----------------------------------------------------------------------
  const downloadZip = useCallback(async () => {
    if (!jobId) return;

    setIsDownloading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.error || "Download failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "captions.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Reset
      setJobId(null);
      setImages([]);
      setImageStatuses({});
      setProgress({
        total: 0,
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Download error"
      );
    } finally {
      setIsDownloading(false);
    }
  }, [jobId]);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const progressPercent =
    progress.total > 0
      ? Math.round(
          ((progress.completed + progress.failed) / progress.total) * 100
        )
      : 0;

  const canCaption =
    !isProcessing &&
    images.length > 0 &&
    !!selectedModel &&
    !!serverUrl.trim();

  const jobDone = jobId && !isProcessing;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <header className="border-b border-zinc-200 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
          Image Captioning Studio
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload images, configure prompts, and generate captions in batch.
        </p>
      </header>

      {/* Error message */}
      {errorMessage && (
        <div className="flex items-start gap-2 p-3 text-sm bg-zinc-100 text-zinc-600 rounded border border-zinc-200">
          <span className="flex-1">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage("")}
            className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* ========== API Configuration ========== */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
          API Configuration
        </h2>

        <div className="flex gap-3">
          <input
            type="url"
            placeholder="http://localhost:8080"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchModels();
            }}
            className="flex-1 px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={fetchModels}
            disabled={modelLoading || !serverUrl.trim()}
            className="px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {modelLoading ? "Loading..." : "Fetch Models"}
          </button>
        </div>

        {modelError && <p className="text-xs text-zinc-400">{modelError}</p>}

        {models.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 appearance-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.owned_by ? ` (${m.owned_by})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* ========== Prompts ========== */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
          Prompts
        </h2>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            System Prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Prompt Prefix
          </label>
          <input
            type="text"
            value={promptPrefix}
            onChange={(e) => setPromptPrefix(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            User Prompt
          </label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 resize-y"
          />
        </div>
      </section>

      {/* ========== Images ========== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Images ({images.length})
          </h2>
          {images.length > 0 && !isProcessing && (
            <button
              onClick={clearAll}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 border-2 border-dashed rounded cursor-pointer transition-colors ${
            dragOver
              ? "border-zinc-500 bg-zinc-100"
              : "border-zinc-300 hover:border-zinc-400"
          } ${isProcessing ? "pointer-events-none opacity-50" : ""}`}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2"
          >
            <svg
              className="w-8 h-8 text-zinc-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32A3 3 0 0121 12v7.5a3 3 0 01-3 3H6.75z"
              />
            </svg>
            <span className="text-sm text-zinc-500">
              Click to upload or drag &amp; drop
            </span>
            <span className="text-xs text-zinc-400">
              PNG, JPG, JPEG, WebP, GIF
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif"
            onChange={(e) => processFiles(e.target.files || [])}
            className="hidden"
          />
        </div>

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((img) => (
              <ImageCard
                key={img.name}
                img={img}
                status={imageStatuses[img.name]}
                onRemove={removeImage}
                disabled={isProcessing}
              />
            ))}
          </div>
        )}
      </section>

      {/* ========== Actions ========== */}
      <section className="space-y-3">
        {/* Progress bar */}
        {jobId && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="space-x-2">
                <span>{progress.completed} done</span>
                {progress.failed > 0 && (
                  <span className="text-zinc-400">
                    &middot; {progress.failed} failed
                  </span>
                )}
                {progress.processing > 0 && (
                  <span className="text-zinc-400">
                    &middot; {progress.processing} processing
                  </span>
                )}
              </span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-700 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={startCaptioning}
            disabled={!canCaption}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-900 text-zinc-100 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              "Caption All"
            )}
          </button>

          {jobDone && (
            <button
              onClick={downloadZip}
              disabled={isDownloading}
              className="px-5 py-2.5 text-sm font-medium border border-zinc-300 text-zinc-700 rounded hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isDownloading ? "Preparing..." : "Download ZIP"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
