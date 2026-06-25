// ---------------------------------------------------------------------------
// useMultiPresetJob — runs all caption presets sequentially
//
// Each preset gets its own job. Progress is aggregated across all presets.
// Results are stored per-preset so the UI can switch between them.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from "react";
import { CAPTION_PRESETS, ImageFile, ImageStatus, ProgressState } from "../CaptionStudioTypes";
import type { ImageCrop } from "../CaptionStudioCropTypes";
import { useStudioStore } from "@/store/studioStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseMultiPresetJobOptions {
  images: ImageFile[];
  selectedModel: string;
  showToast: (message: string) => void;
  onDownloadComplete: () => void;
  cropData?: ImageCrop[];
  // External state setters (shared with single-job hook)
  setIsProcessing: (value: boolean) => void;
  setIsDownloading: (value: boolean) => void;
  setImageStatuses: React.Dispatch<React.SetStateAction<Record<string, ImageStatus>>>;
  setProgress: React.Dispatch<React.SetStateAction<ProgressState>>;
  setJobError: (value: string) => void;
  setShowErrorLog: (value: boolean | ((prev: boolean) => boolean)) => void;
}

const emptyProgress: ProgressState = {
  total: 0, queued: 0, processing: 0, completed: 0, failed: 0,
};

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

/** Start a caption job for a single preset via POST /api/caption. */
async function startSinglePresetJob(
  preset: (typeof CAPTION_PRESETS)[0],
  images: ImageFile[],
  selectedModel: string,
  serverUrl: string,
  triggerWord: string,
  parallelRequests: number,
  cropDataMap: Record<string, { cropType: "portrait" | "body"; cropRect: { x: number; y: number; width: number; height: number } }>,
): Promise<string | null> {
  const formData = new FormData();
  formData.append("config", JSON.stringify({
    serverUrl: serverUrl.trim(),
    model: selectedModel,
    systemPrompt: preset.systemPrompt,
    userPrompt: preset.userPromptTemplate,
    presetId: preset.id,
    presetZipName: preset.zipName,
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
  if (!res.ok) return null;
  return data.jobId;
}

/** Poll a job until done. Returns final statuses or null on error. */
async function pollJobUntilDone(
  jobId: string,
  onUpdate: (statuses: Record<string, ImageStatus>) => void,
  signal: AbortSignal,
): Promise<Record<string, ImageStatus> | null> {
  return new Promise((resolve) => {
    const pollInterval = setInterval(async () => {
      if (signal.aborted) {
        clearInterval(pollInterval);
        resolve(null);
        return;
      }
      try {
        const statusRes = await fetch(`/api/status?jobId=${jobId}`);
        if (!statusRes.ok) {
          clearInterval(pollInterval);
          resolve(null);
          return;
        }
        const statusData = await statusRes.json() as { statuses?: Record<string, ImageStatus> };
        const statuses = statusData.statuses;
        if (!statuses) return;

        onUpdate(statuses);

        const allDone = Object.values(statuses).every(
          (s) => s.status === "completed" || s.status === "failed"
        );
        if (allDone) {
          clearInterval(pollInterval);
          resolve(statuses);
        }
      } catch {
        clearInterval(pollInterval);
        resolve(null);
      }
    }, 500);
  });
}

/** Download multi-preset ZIP via POST /api/download. */
async function downloadMultiPresetZipBlob(
  jobIds: string[],
  setIsDownloading: (value: boolean) => void,
  setJobError: (value: string) => void,
  showToast: (message: string) => void,
): Promise<void> {
  setIsDownloading(true);
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
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Download error");
  } finally {
    setIsDownloading(false);
  }
}

/** Abort all jobs by their IDs. */
async function abortAllJobs(jobIds: Record<string, string>): Promise<void> {
  for (const jid of Object.values(jobIds)) {
    try {
      await fetch(`/api/caption?jobId=${jid}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useMultiPresetJob(options: UseMultiPresetJobOptions) {
  const [presetResults, setPresetResults] = useState<Record<string, Record<string, ImageStatus>>>({});
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetJobIds, setPresetJobIds] = useState<Record<string, string>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const showErrorLogRef = useRef(false);

  const showErrorLog = useState(false)[0];
  const setShowErrorLog = options.setShowErrorLog;

  // Keep showErrorLog in ref for use in async callbacks
  useCallback(() => { showErrorLogRef.current = showErrorLog; }, [showErrorLog]);

  // -- Start all presets sequentially --
  const startCaptioningAllPresets = useCallback(async () => {
    if (options.images.length === 0) {
      options.setJobError("Upload at least one image");
      return;
    }
    if (!options.selectedModel) {
      options.setJobError("Select a model");
      return;
    }

    const storeConfig = useStudioStore.getState().config;
    if (!storeConfig.serverUrl.trim()) {
      options.setJobError("Enter a server URL");
      return;
    }

    const needsTrigger = CAPTION_PRESETS.some((p) => p.needsTrigger);
    if (needsTrigger && !storeConfig.triggerWord.trim()) {
      options.setJobError("Enter an activation token (trigger word)");
      return;
    }

    abortControllerRef.current = new AbortController();
    options.setJobError("");
    options.setIsProcessing(true);
    options.setImageStatuses({});
    setPresetResults({});
    setPresetJobIds({});

    const cropDataMap = buildCropDataMap(options.cropData);
    const totalImages = options.images.length * CAPTION_PRESETS.length;
    let completedCount = 0;
    let failedCount = 0;

    for (const preset of CAPTION_PRESETS) {
      if (abortControllerRef.current?.signal.aborted) break;

      setActivePresetId(preset.id);

      // Set initial "queued" statuses
      const initial: Record<string, ImageStatus> = {};
      for (const img of options.images) {
        initial[img.name] = { status: "queued" };
      }
      options.setImageStatuses(initial);

      const jobId = await startSinglePresetJob(
        preset,
        options.images,
        options.selectedModel,
        storeConfig.serverUrl,
        storeConfig.triggerWord,
        storeConfig.parallelRequests,
        cropDataMap,
      );

      if (!jobId) {
        // Job creation failed
        options.showToast(`Failed to start captioning for ${preset.label}`);
        const failed: Record<string, ImageStatus> = {};
        for (const img of options.images) {
          failed[img.name] = { status: "failed", error: "Failed to start" };
        }
        setPresetResults((prev) => ({ ...prev, [preset.id]: failed }));
        failedCount += options.images.length;
        options.setProgress({
          total: totalImages,
          queued: 0,
          processing: 0,
          completed: completedCount,
          failed: failedCount,
        });
        continue;
      }

      setPresetJobIds((prev) => ({ ...prev, [preset.id]: jobId }));

      // Poll until done
      const statuses = await pollJobUntilDone(
        jobId,
        (liveStatuses) => options.setImageStatuses(liveStatuses),
        abortControllerRef.current!.signal,
      );

      if (!statuses) {
        // Polling failed or aborted
        continue;
      }

      setPresetResults((prev) => ({ ...prev, [preset.id]: statuses }));

      const presetCompleted = Object.values(statuses).filter(
        (s) => s.status === "completed"
      ).length;
      const presetFailed = Object.values(statuses).filter(
        (s) => s.status === "failed"
      ).length;
      completedCount += presetCompleted;
      failedCount += presetFailed;
      options.setProgress({
        total: totalImages,
        queued: 0,
        processing: 0,
        completed: completedCount,
        failed: failedCount,
      });
    }

    // All presets done
    setActivePresetId(null);
    abortControllerRef.current = null;
    options.setIsProcessing(false);

    if (failedCount > 0) {
      options.showToast(`${failedCount} image(s) failed across presets`);
      if (!showErrorLogRef.current) {
        setShowErrorLog(true);
      }
    }
  }, [options, setShowErrorLog]);

  // -- Abort all presets --
  const abortMultiPreset = useCallback(async () => {
    abortControllerRef.current?.abort();
    await abortAllJobs(presetJobIds);
    setActivePresetId(null);
    options.setIsProcessing(false);
  }, [presetJobIds, options]);

  // -- Download multi-preset ZIP --
  const downloadMultiPresetZip = useCallback(async () => {
    const jobIds = Object.values(presetJobIds);
    if (jobIds.length === 0) return;

    await downloadMultiPresetZipBlob(
      jobIds,
      options.setIsDownloading,
      options.setJobError,
      options.showToast,
    );

    // Reset all state
    setPresetResults({});
    setPresetJobIds({});
    setActivePresetId(null);
    options.setImageStatuses({});
    options.setProgress(emptyProgress);
    options.onDownloadComplete();
  }, [presetJobIds, options]);

  // -- Reset multi-preset state --
  const resetMultiPreset = useCallback(() => {
    setPresetResults({});
    setPresetJobIds({});
    setActivePresetId(null);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    presetResults,
    activePresetId,
    presetJobIds,
    startCaptioningAllPresets,
    abortMultiPreset,
    downloadMultiPresetZip,
    resetMultiPreset,
    cleanup,
  };
}
