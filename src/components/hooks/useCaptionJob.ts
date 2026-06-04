import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAPTION_PRESETS,
  ImageFile,
  ImageStatus,
  ProgressState,
} from "../CaptionStudioTypes";
import { getPreset } from "../CaptionStudioPresets";
import type { ImageCrop } from "../CaptionStudioCropTypes";
import { useStudioStore } from "@/store/studioStore";

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
    // Validate trigger word if preset requires it
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
      // Build crop data map (filename -> single crop with type)
      const cropDataMap: Record<string, { cropType: "portrait" | "body"; cropRect: { x: number; y: number; width: number; height: number } }> = {};
      if (cropData && cropData.length > 0) {
        for (const crop of cropData) {
          cropDataMap[crop.imageName] = {
            cropType: crop.cropType === "face" ? "portrait" : "body",
            cropRect: crop.cropRect,
          };
        }
      }

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

      // Notify parent to clear images
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

  // Multi-preset state
  const [presetResults, setPresetResults] = useState<Record<string, Record<string, ImageStatus>>>({});
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetJobIds, setPresetJobIds] = useState<Record<string, string>>({});

  const eventSourceRef = useRef<EventSource | null>(null);
  const showErrorLogRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // -- Multi-preset start: runs all presets sequentially --
  const startCaptioningAllPresets = useCallback(async () => {
    // Validate common requirements
    if (options.images.length === 0) {
      setJobError("Upload at least one image");
      return;
    }
    if (!options.selectedModel) {
      setJobError("Select a model");
      return;
    }

    const storeConfig = useStudioStore.getState().config;
    if (!storeConfig.serverUrl.trim()) {
      setJobError("Enter a server URL");
      return;
    }

    // Check if any preset needs a trigger word
    const needsTrigger = CAPTION_PRESETS.some((p) => p.needsTrigger);
    if (needsTrigger && !storeConfig.triggerWord.trim()) {
      setJobError("Enter an activation token (trigger word)");
      return;
    }

    eventSourceRef.current?.close();
    abortControllerRef.current = new AbortController();
    setJobError("");
    setIsProcessing(true);
    setImageStatuses({});
    setPresetResults({});
    setPresetJobIds({});

    const cropDataMap: Record<string, { cropType: "portrait" | "body"; cropRect: { x: number; y: number; width: number; height: number } }> = {};
    if (options.cropData && options.cropData.length > 0) {
      for (const crop of options.cropData) {
        cropDataMap[crop.imageName] = {
          cropType: crop.cropType === "face" ? "portrait" : "body",
          cropRect: crop.cropRect,
        };
      }
    }

    const presets = CAPTION_PRESETS;
    const totalImages = options.images.length * presets.length;
    let completedCount = 0;
    let failedCount = 0;

    for (const preset of presets) {
      if (abortControllerRef.current?.signal.aborted) break;

      setActivePresetId(preset.id);

      // Set initial "queued" statuses for this preset's images
      const initial: Record<string, ImageStatus> = {};
      for (const img of options.images) {
        initial[img.name] = { status: "queued" };
      }
      setImageStatuses(initial);

      try {
        const formData = new FormData();
        formData.append("config", JSON.stringify({
          serverUrl: storeConfig.serverUrl.trim(),
          model: options.selectedModel,
          systemPrompt: preset.systemPrompt,
          userPrompt: preset.userPromptTemplate,
          presetId: preset.id,
          presetZipName: preset.zipName,
          triggerWord: storeConfig.triggerWord.trim(),
          parallelRequests: storeConfig.parallelRequests,
          imageNames: options.images.map((img) => img.name),
          cropData: Object.keys(cropDataMap).length > 0 ? cropDataMap : undefined,
        }));
        for (const img of options.images) {
          formData.append("images", img.file);
        }

        const res = await fetch("/api/caption", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          options.showToast(data.error || `Failed to start captioning for ${preset.label}`);
          // Mark all images for this preset as failed
          const failed: Record<string, ImageStatus> = {};
          for (const img of options.images) {
            failed[img.name] = { status: "failed", error: data.error || "Failed" };
          }
          setPresetResults((prev) => ({ ...prev, [preset.id]: failed }));
          failedCount += options.images.length;
          setProgress({
            total: totalImages,
            queued: 0,
            processing: 0,
            completed: completedCount,
            failed: failedCount,
          });
          continue;
        }

        const presetJobId = data.jobId;
        setPresetJobIds((prev) => ({ ...prev, [preset.id]: presetJobId }));

        // Wait for this preset's job to complete via polling
        await new Promise<void>((resolve) => {
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/status?jobId=${presetJobId}`);
              if (!statusRes.ok) {
                clearInterval(pollInterval);
                resolve();
                return;
              }
              const statusData = await statusRes.json() as { statuses?: Record<string, ImageStatus> };
              const statuses = statusData.statuses;
              if (statuses) {
                // Update current preset's statuses
                setImageStatuses(statuses);
              }

              if (!statuses) return;

              // Check if done
              const allDone = Object.values(statuses).every(
                (s) => s.status === "completed" || s.status === "failed"
              );
              if (allDone) {
                clearInterval(pollInterval);

                // Save results for this preset
                setPresetResults((prev) => ({ ...prev, [preset.id]: statuses }));

                // Update overall progress
                const presetCompleted = Object.values(statuses).filter(
                  (s) => s.status === "completed"
                ).length;
                const presetFailed = Object.values(statuses).filter(
                  (s) => s.status === "failed"
                ).length;
                completedCount += presetCompleted;
                failedCount += presetFailed;
                setProgress({
                  total: totalImages,
                  queued: 0,
                  processing: 0,
                  completed: completedCount,
                  failed: failedCount,
                });

                resolve();
              }
            } catch {
              clearInterval(pollInterval);
              resolve();
            }
          }, 500);
        });
      } catch (err) {
        options.showToast(err instanceof Error ? err.message : "Unexpected error");
      }
    }

    // All presets done
    setActivePresetId(null);
    abortControllerRef.current = null;
    setIsProcessing(false);

    // Show error summary if any failures
    if (failedCount > 0) {
      options.showToast(`${failedCount} image(s) failed across presets`);
      if (!showErrorLogRef.current) {
        setShowErrorLog(true);
      }
    }
  }, [options, setJobError, eventSourceRef]);

  // -- Multi-preset abort --
  const abortMultiPreset = useCallback(async () => {
    abortControllerRef.current?.abort();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    // Abort any active job
    for (const presetId of Object.keys(presetJobIds)) {
      const jid = presetJobIds[presetId];
      try {
        await fetch(`/api/caption?jobId=${jid}`, { method: "DELETE" });
      } catch {
        // ignore
      }
    }

    setActivePresetId(null);
    setIsProcessing(false);
  }, [presetJobIds]);

  // -- Multi-preset download --
  const downloadMultiPresetZip = useCallback(async () => {
    const jobIds = Object.values(presetJobIds);
    if (jobIds.length === 0) return;

    setIsDownloading(true);
    setJobError("");

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds }),
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

      // Reset
      setJobId(null);
      setImageStatuses({});
      setPresetResults({});
      setPresetJobIds({});
      setActivePresetId(null);
      setProgress(emptyProgress);
      options.onDownloadComplete();
    } catch (err) {
      options.showToast(err instanceof Error ? err.message : "Download error");
    } finally {
      setIsDownloading(false);
    }
  }, [presetJobIds, options, setJobError]);

  // -- Multi-preset reset --
  const resetMultiPreset = useCallback(() => {
    setPresetResults({});
    setPresetJobIds({});
    setActivePresetId(null);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.close();
    };
  }, []);

  return {
    jobId, progress, isProcessing, isDownloading,
    imageStatuses, showErrorLog, setShowErrorLog,
    jobError, clearJobError,
    startCaptioning: startCaptioningWrapped,
    abortJob, downloadZip, reset,
    // Multi-preset exports
    presetResults,
    activePresetId,
    presetJobIds,
    startCaptioningAllPresets,
    abortMultiPreset,
    downloadMultiPresetZip,
    resetMultiPreset,
  };
}
