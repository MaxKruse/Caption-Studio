import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptionTypeId,
  ImageFile,
  ImageStatus,
  ProgressState,
} from "../CaptionStudioTypes";
import type { ImageCrop } from "../CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCaptionJobOptions {
  images: ImageFile[];
  selectedModel: string;
  serverUrl: string;
  systemPrompt: string;
  userPrompt: string;
  captionTypeId: CaptionTypeId;
  triggerWord: string;
  subjectName: string;
  parallelRequests: number;
  showToast: (message: string) => void;
  onDownloadComplete: () => void;
  cropData?: ImageCrop[];
}

interface SSEHookOptions {
  jobId: string | null;
  eventSourceRef: React.MutableRefObject<EventSource | null>;
  showErrorLogRef: React.MutableRefObject<boolean>;
  onProgress: (progress: ProgressState) => void;
  onStatuses: (statuses: Record<string, ImageStatus>) => void;
  onDone: (failed: number) => void;
  showToast: (message: string) => void;
  setShowErrorLog: (value: boolean | ((prev: boolean) => boolean)) => void;
}

interface ActionsHookOptions {
  images: ImageFile[];
  selectedModel: string;
  serverUrl: string;
  systemPrompt: string;
  userPrompt: string;
  captionTypeId: CaptionTypeId;
  triggerWord: string;
  subjectName: string;
  parallelRequests: number;
  jobId: string | null;
  eventSourceRef: React.MutableRefObject<EventSource | null>;
  showToast: (message: string) => void;
  onDownloadComplete: () => void;
  setIsProcessing: (value: boolean) => void;
  setIsDownloading: (value: boolean) => void;
  setImageStatuses: React.Dispatch<React.SetStateAction<Record<string, ImageStatus>>>;
  setProgress: React.Dispatch<React.SetStateAction<ProgressState>>;
  setJobId: (value: string | null) => void;
  setJobError: (value: string) => void;
  cropData?: ImageCrop[];
}

// ---------------------------------------------------------------------------
// useCaptionSSE — EventSource lifecycle + polling fallback
// ---------------------------------------------------------------------------

function useCaptionSSE({
  jobId,
  eventSourceRef,
  showErrorLogRef,
  onProgress,
  onStatuses,
  onDone,
  showToast,
  setShowErrorLog,
}: SSEHookOptions) {
  // Cleanup SSE on unmount
  useEffect(() => {
    const es = eventSourceRef.current;
    return () => {
      es?.close();
    };
  }, [eventSourceRef]);

  // Polling fallback for status updates
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?jobId=${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.statuses) {
          onStatuses(data.statuses);
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, onStatuses]);

  // Return handler for startCaptioning to use
  const handleSSEMessage = useCallback(
    (event: MessageEvent) => {
      const payload: ProgressState = JSON.parse(event.data);
      onProgress(payload);
      if (payload.statuses) {
        onStatuses(payload.statuses);
      }
      if (payload.done) {
        onDone(payload.failed ?? 0);
        if (payload.failed > 0) {
          showToast(`${payload.failed} image(s) failed to caption`);
          if (!showErrorLogRef.current) {
            setShowErrorLog(true);
          }
        }
      }
    },
    [onProgress, onStatuses, onDone, showToast, showErrorLogRef, setShowErrorLog],
  );

  const handleSSEError = useCallback(() => {
    // Caller will handle closing
  }, []);

  return { handleSSEMessage, handleSSEError };
}

// ---------------------------------------------------------------------------
// useCaptionActions — start, abort, download, reset
// ---------------------------------------------------------------------------

function useCaptionActions({
  images,
  selectedModel,
  serverUrl,
  systemPrompt,
  userPrompt,
  captionTypeId,
  triggerWord,
  subjectName,
  parallelRequests,
  jobId,
  eventSourceRef,
  showToast,
  onDownloadComplete,
  setIsProcessing,
  setIsDownloading,
  setImageStatuses,
  setProgress,
  setJobId,
  setJobError,
  cropData,
}: ActionsHookOptions) {
  // Start batch captioning
  const startCaptioning = useCallback(async (sseHandlers: {
    handleSSEMessage: (event: MessageEvent) => void;
  }) => {
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
    // Validate required fields based on caption type
    if (captionTypeId === "detailed_with_trigger" || captionTypeId === "short_with_trigger") {
      if (!triggerWord.trim()) {
        setJobError("Enter a Trigger Word");
        return;
      }
    }
    if (captionTypeId === "name") {
      if (!subjectName.trim()) {
        setJobError("Enter a Subject Name");
        return;
      }
    }

    eventSourceRef.current?.close();
    setJobError("");
    setIsProcessing(true);
    setImageStatuses({});

    try {
      const formData = new FormData();
      // Build crop data map (filename -> single crop with type)
      // Each image has ONE selected crop type (face or body)
      const cropDataMap: Record<string, { cropType: "portrait" | "body"; cropRect: { x: number; y: number; width: number; height: number } }> = {};
      if (cropData && cropData.length > 0) {
        for (const crop of cropData) {
          const selectedType = crop.selectedCrop;
          const selectedRect = selectedType === "face" ? crop.faceCrop : crop.bodyCrop;
          cropDataMap[crop.imageName] = {
            cropType: selectedType === "face" ? "portrait" : "body",
            cropRect: selectedRect,
          };
        }
      }

      formData.append("config", JSON.stringify({
        serverUrl: serverUrl.trim(),
        model: selectedModel,
        systemPrompt,
        userPrompt,
        captionTypeId,
        triggerWord: triggerWord.trim(),
        subjectName: subjectName.trim(),
        parallelRequests,
        imageNames: images.map((img) => img.name),
        cropData: Object.keys(cropDataMap).length > 0 ? cropDataMap : undefined,
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

      const initial: Record<string, ImageStatus> = {};
      for (const img of images) {
        initial[img.name] = { status: "queued" };
      }
      setImageStatuses(initial);

      const es = new EventSource(`/api/caption?jobId=${data.jobId}`);
      eventSourceRef.current = es;

      es.onmessage = sseHandlers.handleSSEMessage;

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
    captionTypeId,
    triggerWord,
    subjectName,
    parallelRequests,
    showToast,
    eventSourceRef,
    setJobError,
    setIsProcessing,
    setImageStatuses,
    setJobId,
    cropData,
  ]);

  // Download ZIP
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
      const safeName = subjectName.trim() || "Untitled";
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
  }, [jobId, subjectName, showToast, onDownloadComplete, setJobError, setJobId, setImageStatuses, setProgress, setIsDownloading]);

  // Reset job state (called by clearAll)
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
  }, [setJobId, setImageStatuses, setProgress, setJobError]);

  // Abort job — stops processing, keeps UI state
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
  }, [jobId, eventSourceRef, setImageStatuses, setIsProcessing]);

  // Clear error message
  const clearJobError = useCallback(() => {
    setJobError("");
  }, [setJobError]);

  return { startCaptioning, downloadZip, reset, abortJob, clearJobError };
}

// ---------------------------------------------------------------------------
// useCaptionJob — Orchestrator (public API)
// ---------------------------------------------------------------------------

const emptyProgress: ProgressState = {
  total: 0, queued: 0, processing: 0, completed: 0, failed: 0,
};

export function useCaptionJob(options: UseCaptionJobOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [imageStatuses, setImageStatuses] = useState<Record<string, ImageStatus>>({});
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [jobError, setJobError] = useState("");

  const eventSourceRef = useRef<EventSource | null>(null);
  const showErrorLogRef = useRef(false);

  useEffect(() => { showErrorLogRef.current = showErrorLog; }, [showErrorLog]);

  const sseHandlers = useCaptionSSE({
    jobId, eventSourceRef, showErrorLogRef,
    onProgress: setProgress, onStatuses: setImageStatuses,
    onDone: () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsProcessing(false);
    },
    showToast: options.showToast, setShowErrorLog,
  });

  const { startCaptioning, downloadZip, reset, abortJob, clearJobError } =
    useCaptionActions({
      ...options,
      jobId, eventSourceRef,
      setIsProcessing, setIsDownloading,
      setImageStatuses, setProgress, setJobId, setJobError,
    });

  const startCaptioningWrapped = useCallback(async () => {
    await startCaptioning({ handleSSEMessage: sseHandlers.handleSSEMessage });
  }, [startCaptioning, sseHandlers]);

  return {
    jobId, progress, isProcessing, isDownloading,
    imageStatuses, showErrorLog, setShowErrorLog,
    jobError, clearJobError,
    startCaptioning: startCaptioningWrapped,
    abortJob, downloadZip, reset,
  };
}
