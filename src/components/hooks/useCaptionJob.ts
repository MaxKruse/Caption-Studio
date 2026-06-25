// ---------------------------------------------------------------------------
// useCaptionJob — single-job caption lifecycle (SSE, polling, download)
//
// For multi-preset captioning, use useMultiPresetJob alongside this hook.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ImageFile,
  ImageStatus,
  ProgressState,
} from "../CaptionStudioTypes";
import { getPreset } from "../CaptionStudioPresets";
import type { ImageCrop } from "../CaptionStudioCropTypes";
import { useStudioStore } from "@/store/studioStore";
import { useMultiPresetJob } from "./useMultiPresetJob";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCaptionJobOptions {
  images: ImageFile[];
  selectedModel: string;
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

  return { handleSSEMessage };
}

// ---------------------------------------------------------------------------
// useCaptionActions — start, abort, download, reset
// ---------------------------------------------------------------------------

function useCaptionActions({
  images,
  selectedModel,
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
  // -- Read config from store --
  const serverUrl = useStudioStore((s) => s.config.serverUrl);
  const systemPrompt = useStudioStore((s) => s.config.systemPrompt);
  const userPrompt = useStudioStore((s) => s.config.userPrompt);
  const presetId = useStudioStore((s) => s.config.presetId);
  const triggerWord = useStudioStore((s) => s.config.triggerWord);
  const parallelRequests = useStudioStore((s) => s.config.parallelRequests);
  const preset = getPreset(presetId);
  const presetZipName = preset.zipName;

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
    if (getPreset(presetId).needsTrigger && !triggerWord.trim()) {
      setJobError("Enter an activation token (trigger word)");
      return;
    }

    eventSourceRef.current?.close();
    setJobError("");
    setIsProcessing(true);
    setImageStatuses({});

    try {
      const formData = new FormData();
      const cropDataMap = buildCropDataMap(cropData);

      formData.append("config", JSON.stringify({
        serverUrl: serverUrl.trim(),
        model: selectedModel,
        systemPrompt,
        userPrompt,
        presetId,
        presetZipName,
        triggerWord: triggerWord.trim(),
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
    presetId,
    presetZipName,
    triggerWord,
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
      a.click();
      document.body.appendChild(a);
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

      onDownloadComplete();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Download error"
      );
    } finally {
      setIsDownloading(false);
    }
  }, [jobId, showToast, onDownloadComplete, setJobError, setJobId, setImageStatuses, setProgress, setIsDownloading]);

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

  // Abort job
  const abortJob = useCallback(async () => {
    if (!jobId) return;

    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    try {
      await fetch(`/api/caption?jobId=${jobId}`, {
        method: "DELETE",
      });
    } catch {
      // ignore network errors on abort
    }

    // Mark remaining queued images as failed immediately
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
// Helpers
// ---------------------------------------------------------------------------

/** Build crop data map from ImageCrop array. */
function buildCropDataMap(cropData?: ImageCrop[]): Record<string, { cropType: "portrait" | "body"; cropRect: { x: number; y: number; width: number; height: number } }> {
  const map: Record<string, { cropType: "portrait" | "body"; cropRect: { x: number; y: number; width: number; height: number } }> = {};
  if (!cropData || cropData.length === 0) return map;
  for (const crop of cropData) {
    map[crop.imageName] = {
      cropType: crop.cropType === "face" ? "portrait" : "body",
      cropRect: crop.cropRect,
    };
  }
  return map;
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

  // -- Delegate multi-preset to dedicated hook --
  const multiPreset = useMultiPresetJob({
    ...options,
    setIsProcessing,
    setIsDownloading,
    setImageStatuses,
    setProgress,
    setJobError,
    setShowErrorLog,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      multiPreset.cleanup();
    };
  }, [multiPreset]);

  return {
    jobId, progress, isProcessing, isDownloading,
    imageStatuses, showErrorLog, setShowErrorLog,
    jobError, clearJobError,
    startCaptioning: startCaptioningWrapped,
    abortJob, downloadZip, reset,
    // Multi-preset exports (from dedicated hook)
    ...multiPreset,
  };
}
