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

    eventSourceRef.current?.close();
    setJobError("");
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
    downloadZip,
    reset,
  };
}
