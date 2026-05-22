import { useCallback, useEffect, useRef, useState } from "react";
import {
  ImageFile,
  ImageStatus,
  ProgressState,
  PROMPT_PREFIX_DEFAULT,
} from "../CaptionStudioTypes";

export interface UseCaptionJobOptions {
  images: ImageFile[];
  selectedModel: string;
  serverUrl: string;
  systemPrompt: string;
  userPrompt: string;
  includeNameInPrompt: boolean;
  parallelRequests: number;
  captionName: string;
  showToast: (message: string) => void;
  onDownloadComplete: () => void;
}

export function useCaptionJob(options: UseCaptionJobOptions) {
  const {
    images,
    selectedModel,
    serverUrl,
    systemPrompt,
    userPrompt,
    includeNameInPrompt,
    parallelRequests,
    captionName,
    showToast,
    onDownloadComplete,
  } = options;

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
  const [imageStatuses, setImageStatuses] = useState<
    Record<string, ImageStatus>
  >({});
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [jobError, setJobError] = useState("");

  const eventSourceRef = useRef<EventSource | null>(null);
  const showErrorLogRef = useRef(false);

  useEffect(() => {
    showErrorLogRef.current = showErrorLog;
  }, [showErrorLog]);

  // -----------------------------------------------------------------------
  // Cleanup SSE on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

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
  // Start batch captioning
  // -----------------------------------------------------------------------
  const startCaptioning = useCallback(async () => {
    if (images.length === 0) {
      setJobError("Upload at least one image");
      return;
    }
    if (!selectedModel) {
      setJobError("Select a model");
      return;
    }
    if (!serverUrl.trim()) {
      setJobError("Enter a server URL");
      return;
    }
    if (includeNameInPrompt && !captionName.trim()) {
      setJobError("Enter a Caption Name");
      return;
    }

    eventSourceRef.current?.close();
    setJobError("");
    setIsProcessing(true);
    setImageStatuses({});

    try {
      // Use FormData to send original files (avoids base64 string size limits)
      const formData = new FormData();
      formData.append("config", JSON.stringify({
        serverUrl: serverUrl.trim(),
        model: selectedModel,
        systemPrompt,
        promptPrefix: includeNameInPrompt ? PROMPT_PREFIX_DEFAULT : "",
        userPrompt,
        captionName,
        includeNameInPrompt,
        parallelRequests,
        imageNames: images.map((img) => img.name),
      }));
      for (const img of images) {
        formData.append("images", img.file);
      }

      const res = await fetch("/api/caption", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to start captioning");
        setIsProcessing(false);
        return;
      }

      setJobId(data.jobId);
      setShowErrorLog(false);

      const initial: Record<string, ImageStatus> = {};
      for (const img of images) {
        initial[img.name] = { status: "queued" };
      }
      setImageStatuses(initial);

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
          if (payload.failed > 0) {
            showToast(`${payload.failed} image(s) failed to caption`);
            if (!showErrorLogRef.current) {
              setShowErrorLog(true);
            }
          }
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Unexpected error"
      );
      setIsProcessing(false);
    }
  }, [
    images,
    selectedModel,
    serverUrl,
    systemPrompt,
    userPrompt,
    includeNameInPrompt,
    parallelRequests,
    captionName,
    showToast,
  ]);

  // -----------------------------------------------------------------------
  // Download ZIP
  // -----------------------------------------------------------------------
  const downloadZip = useCallback(async () => {
    if (!jobId) return;

    setIsDownloading(true);
    setJobError("");

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setJobError(data.error || "Download failed");
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

      // Reset job state
      setJobId(null);
      setImageStatuses({});
      setProgress({
        total: 0,
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      });

      // Notify parent to clear images
      onDownloadComplete();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Download error"
      );
    } finally {
      setIsDownloading(false);
    }
  }, [jobId, captionName, showToast, onDownloadComplete]);

  // -----------------------------------------------------------------------
  // Reset job state (called by clearAll)
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    setJobId(null);
    setImageStatuses({});
    setProgress({
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    });
    setJobError("");
  }, []);

  // -----------------------------------------------------------------------
  // Abort job — stops processing, keeps UI state
  // -----------------------------------------------------------------------
  const abortJob = useCallback(async () => {
    if (!jobId) return;

    // Close SSE connection
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    // Tell server to abort queued images
    try {
      await fetch(`/api/caption?jobId=${jobId}`, {
        method: "DELETE",
      });
    } catch {
      // ignore network errors on abort
    }

    // Mark remaining queued images as failed on the client side immediately
    setImageStatuses((prev) => {
      const updated = { ...prev };
      for (const [name, status] of Object.entries(updated)) {
        if (status.status === "queued") {
          updated[name] = { ...status, status: "failed", error: "Aborted by user" };
        }
      }
      return updated;
    });

    setIsProcessing(false);
  }, [jobId]);

  // -----------------------------------------------------------------------
  // Clear error message
  // -----------------------------------------------------------------------
  const clearJobError = useCallback(() => {
    setJobError("");
  }, []);

  return {
    jobId,
    progress,
    isProcessing,
    isDownloading,
    imageStatuses,
    showErrorLog,
    setShowErrorLog,
    jobError,
    clearJobError,
    startCaptioning,
    abortJob,
    downloadZip,
    reset,
  };
}
