"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelInfo {
  id: string;
  owned_by?: string;
  architecture?: string;
  input_modalities?: string[];
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

interface ToastState {
  message: string;
  visible: boolean;
}

interface ImageStatus {
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  error?: string;
  prompt?: string;
  reasoningContent?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const PROMPT_PREFIX_DEFAULT = "Include the name of the subject";
const TOAST_DURATION = 4000;

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
  onPreview,
}: {
  img: ImageFile;
  status?: ImageStatus;
  onRemove: (name: string) => void;
  disabled: boolean;
  onPreview: (img: ImageFile) => void;
}) {
  return (
    <div className="relative group border border-zinc-200 rounded overflow-hidden bg-white">
      {/* Clickable image area */}
      <button
        onClick={() => onPreview(img)}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer hover:opacity-90 transition-opacity"
        title="Click to view details"
      >
        <img
          src={img.preview}
          alt={img.name}
          className="w-full h-28 object-cover"
        />
      </button>

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
          onClick={(e) => {
            e.stopPropagation();
            onRemove(img.name);
          }}
          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-zinc-900/60 text-zinc-200 rounded text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-900/80 z-10"
          aria-label={`Remove ${img.name}`}
        >
          &times;
        </button>
      )}

      {/* Prompt indicator badge */}
      {status?.prompt && (
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-zinc-900/70 rounded text-[9px] text-zinc-300 font-medium">
          &#9998; prompt
        </div>
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

/** Modal overlay showing full-size image and generated prompt. */
function ImagePreviewModal({
  img,
  status,
  onClose,
}: {
  img: ImageFile;
  status: ImageStatus;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Prompt for ${img.name}`}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-zinc-900/70 text-zinc-200 rounded-full text-lg hover:bg-zinc-900 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Image */}
        <div className="flex-shrink-0 bg-zinc-100 flex items-center justify-center">
          <img
            src={img.preview}
            alt={img.name}
            className="max-h-80 w-full object-contain"
          />
        </div>

        {/* Prompt section */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{img.name}</h3>
            <StatusBadge status={status.status} />
          </div>

          {status.prompt && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Prompt
              </h4>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {status.prompt}
              </div>
            </div>
          )}

          {status.reasoningContent && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Reasoning
              </h4>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                {status.reasoningContent}
              </div>
            </div>
          )}

          {status.caption && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Generated Caption
              </h4>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {status.caption}
              </div>
            </div>
          )}
        </div>
      </div>
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
    "You are a helpful assistant used in image captioning. Keep responses short and concise. Describe only what you can see in the image. Do not infer or assume names from watermarks, signatures, or text overlays — they must be ignored and never mentioned. No preamble."
  );
  const [userPrompt, setUserPrompt] = useState(
    "Describe this image in detail. Identify the subject as a man, woman, boy, girl, or non-binary person, and estimate their approximate age. Describe body type and physical proportions. Describe hair color, style and length, eye color, skin tone, facial features and expression, outfit colors and clothing details, accessories, and the surrounding environment. 80-120 words."
  );

  // -- Caption Name (used in download filename) --
  const [captionName, setCaptionName] = useState("");
  const [includeNameInPrompt, setIncludeNameInPrompt] = useState(true);

  // -- Parallel Requests (1-8) --
  const [parallelRequests, setParallelRequests] = useState(4);

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

  // -- Toast + Error Log --
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageFile | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, TOAST_DURATION);
  }, []);

  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showErrorLogRef = useRef(false);
  // Keep ref in sync with state for use inside SSE callback
  useEffect(() => {
    showErrorLogRef.current = showErrorLog;
  }, [showErrorLog]);

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
  // Open image preview modal
  // -----------------------------------------------------------------------
  const openPreview = useCallback((img: ImageFile) => {
    setPreviewImage(img);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewImage(null);
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
          promptPrefix: includeNameInPrompt ? PROMPT_PREFIX_DEFAULT : "",
          userPrompt,
          captionName,
          includeNameInPrompt,
          parallelRequests,
        }),
      });

      // Note: includeNameInPrompt is captured in state, not used here directly —
      // promptPrefix is already computed above based on it.

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to start captioning");
        setIsProcessing(false);
        return;
      }

      setJobId(data.jobId);
      setShowErrorLog(false);

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
          // Show toast if there were failures
          if (payload.failed > 0) {
            showToast(`${payload.failed} image(s) failed to caption`);
            // Auto-expand error log if there are failures
            if (!showErrorLogRef.current) {
              setShowErrorLog(true);
            }
          }
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        // SSE error doesn't stop the job - polling will pick up status
      };
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Unexpected error"
      );
      setIsProcessing(false);
    }
  }, [images, selectedModel, serverUrl, systemPrompt, userPrompt, includeNameInPrompt, parallelRequests, showToast]);

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
      const safeName = captionName.trim() || "Untitled";
      a.download = `Captions${safeName}.zip`;
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
      showToast(
        err instanceof Error ? err.message : "Download error"
      );
    } finally {
      setIsDownloading(false);
    }
  }, [jobId, captionName, showToast]);

  // -----------------------------------------------------------------------
  // Escape key closes preview modal
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage, closePreview]);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
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

  // Collect failed images for error log
  const failedImages = images
    .map((img) => ({ img, status: imageStatuses[img.name] }))
    .filter(({ status }) => status?.status === "failed");

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <header className="border-b border-zinc-200 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
          Image Captioning Studio
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Connect to your llama.cpp server, upload images, generate captions — then download.
        </p>
      </header>

      {/* Toast notification */}
      <div
        className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
          toast.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3 text-sm bg-zinc-900 text-zinc-100 rounded shadow-lg border border-zinc-700">
          <svg
            className="w-4 h-4 text-zinc-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span className="max-w-xs">{toast.message}</span>
          <button
            onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none flex-shrink-0"
          >
            &times;
          </button>
        </div>
      </div>

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

      {/* Collapsible error log */}
      {jobDone && failedImages.length > 0 && (
        <div className="rounded border border-zinc-300 overflow-hidden">
          <button
            onClick={() => setShowErrorLog((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 p-3 text-sm bg-zinc-100 hover:bg-zinc-50 transition-colors"
          >
            <span className="flex items-center gap-2 text-zinc-600">
              <svg
                className="w-4 h-4 text-zinc-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              {failedImages.length} image(s) failed — {showErrorLog ? "Hide" : "Show"}
            </span>
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                showErrorLog ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
          {showErrorLog && (
            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 bg-white">
              {failedImages.map(({ img, status }) => (
                <div key={img.name} className="px-3 py-2 flex items-start gap-2">
                  <span className="text-xs font-medium text-zinc-700 flex-1 truncate">
                    {img.name}
                  </span>
                  <span className="text-[11px] text-zinc-400 break-all">
                    {status?.error ?? "Unknown error"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 1 — CONFIGURE                                               */}
      {/* ================================================================ */}
      <section className="rounded-xl border border-zinc-200 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
          <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
            1
          </div>
          <h2 className="text-sm font-semibold text-zinc-900">Configure</h2>
          <p className="text-xs text-zinc-400 ml-auto hidden sm:block">
            Set up the API connection and prompts
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* API Connection */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
              API Connection
            </h3>

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
                className="px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {modelLoading ? "Loading..." : "Fetch Models"}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 -mt-1">
              llama.cpp server URL (default: http://localhost:8080)
            </p>

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
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Prompts */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
              Prompts
            </h3>

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
                User Prompt
              </label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
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
                value={includeNameInPrompt ? PROMPT_PREFIX_DEFAULT : ""}
                readOnly
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded bg-zinc-50 text-zinc-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
              Options
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Caption Name
                  <span className="normal-case font-normal ml-1">
                    (download filename)
                  </span>
                </label>
                <input
                  type="text"
                  value={captionName}
                  onChange={(e) => setCaptionName(e.target.value)}
                  placeholder="e.g. CharacterSet01"
                  className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                />
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNameInPrompt}
                    onChange={(e) => setIncludeNameInPrompt(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:border-zinc-500 focus:ring-zinc-500"
                  />
                  <span className="text-xs text-zinc-600">
                    Include in prompt
                  </span>
                </label>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Parallel Requests
                </label>
                <select
                  value={parallelRequests}
                  onChange={(e) => setParallelRequests(Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} concurrent request{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* STEP 2 — UPLOAD                                                  */}
      {/* ================================================================ */}
      <section className="rounded-xl border border-zinc-200 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
          <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
            2
          </div>
          <h2 className="text-sm font-semibold text-zinc-900">Upload Images</h2>
          {images.length > 0 && (
            <span className="text-xs text-zinc-400 ml-auto">
              {images.length} image{images.length !== 1 ? "s" : ""} ready
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 border-2 border-dashed rounded cursor-pointer transition-colors ${
              dragOver
                ? "border-zinc-500 bg-zinc-100"
                : "border-zinc-300 hover:border-zinc-400"
            } ${isProcessing ? "pointer-events-none opacity-50" : ""}`}
          >
            <div className="flex flex-col items-center justify-center gap-2">
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
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.gif"
              onChange={(e) => processFiles(e.target.files || [])}
              className="hidden"
            />
          </div>

          {/* Gallery */}
          {images.length > 0 && (
            <div className="space-y-3">
              {/* Gallery toolbar */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setGalleryOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      galleryOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                  {galleryOpen ? "Hide" : "Show"} images
                </button>
                {!isProcessing && (
                  <button
                    onClick={() => {
                      if (clearAllConfirm) {
                        clearAll();
                        setClearAllConfirm(false);
                      } else {
                        setClearAllConfirm(true);
                        setTimeout(() => setClearAllConfirm(false), 3000);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full transition-colors ${
                      clearAllConfirm
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:border-red-300"
                    }`}
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                    {clearAllConfirm ? "Are you sure?" : "Clear all"}
                  </button>
                )}
              </div>

              {/* Image grid */}
              {galleryOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {images.map((img) => (
                    <ImageCard
                      key={img.name}
                      img={img}
                      status={imageStatuses[img.name]}
                      onRemove={removeImage}
                      disabled={isProcessing}
                      onPreview={openPreview}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ================================================================ */}
      {/* STEP 3 — PROCESS / DOWNLOAD                                      */}
      {/* ================================================================ */}
      <section className="rounded-xl border border-zinc-200 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
          <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
            3
          </div>
          <h2 className="text-sm font-semibold text-zinc-900">
            {jobDone ? "Download" : isProcessing ? "Processing" : "Generate"}
          </h2>
          {jobDone && (
            <span className="text-xs text-zinc-400 ml-auto">
              {progress.completed} done{progress.failed > 0 ? `, ${progress.failed} failed` : ""}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Caption All button — primary CTA */}
          {!jobDone && (
            <div className="space-y-3">
              <button
                onClick={startCaptioning}
                disabled={!canCaption}
                className={`w-full px-4 py-3 text-sm font-medium rounded transition-colors ${
                  canCaption
                    ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 shadow-sm"
                    : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                }`}
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
                    Processing {images.length} image{images.length !== 1 ? "s" : ""}...
                  </span>
                ) : (
                  `Caption ${images.length} Image${images.length !== 1 ? "s" : ""}`
                )}
              </button>

              {/* Inline requirements checklist */}
              {!canCaption && !isProcessing && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
                  <span className={`flex items-center gap-1.5 ${selectedModel ? "text-zinc-600" : ""}`}>
                    <svg className={`w-3.5 h-3.5 ${selectedModel ? "text-zinc-700" : "text-zinc-300"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {selectedModel ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      ) : (
                        <circle cx="12" cy="12" r="10" />
                      )}
                    </svg>
                    Model selected
                  </span>
                  <span className={`flex items-center gap-1.5 ${images.length > 0 ? "text-zinc-600" : ""}`}>
                    <svg className={`w-3.5 h-3.5 ${images.length > 0 ? "text-zinc-700" : "text-zinc-300"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {images.length > 0 ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      ) : (
                        <circle cx="12" cy="12" r="10" />
                      )}
                    </svg>
                    Images uploaded
                  </span>
                </div>
              )}
            </div>
          )}

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

          {/* Download button — only shown when job is done */}
          {jobDone && (
            <button
              onClick={downloadZip}
              disabled={isDownloading}
              className="w-full px-4 py-3 text-sm font-medium bg-zinc-900 text-zinc-100 rounded hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isDownloading ? "Preparing..." : "Download ZIP"}
            </button>
          )}
        </div>
      </section>

      {/* Image preview modal */}
      {previewImage && (
        <ImagePreviewModal
          img={previewImage}
          status={imageStatuses[previewImage.name] ?? { status: "queued" }}
          onClose={closePreview}
        />
      )}
    </div>
  );
}
