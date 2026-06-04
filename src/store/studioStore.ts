// ---------------------------------------------------------------------------
// Studio Store — Zustand + persist (localStorage)
//
// Single source of truth for all studio state that must survive page refresh:
//   - Configuration (server URL, model, preset, prompts, trigger word, etc.)
//   - Workflow step (where the user is in the pipeline)
//   - Image metadata (names only — actual File objects must be re-uploaded)
//   - Job metadata (jobId, progress snapshot)
//   - Crop metadata (ruleset, detection results, crop assignments)
//
// Image binary data (File / data URL previews) is NOT persisted.
// On refresh, user re-uploads images; everything else is restored.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  ContentMode,
  PresetId,
  ProgressState,
  WorkflowStep,
} from "@/components/CaptionStudioTypes";
import type {
  CropRuleset,
  DetectionResult,
  ImageCrop,
} from "@/components/CaptionStudioCropTypes";
import { CAPTION_PRESETS, getPreset } from "@/components/CaptionStudioPresets";
import { CROP_RULESETS, getCropRuleset } from "@/components/CaptionStudioCropConstants";

// ---------------------------------------------------------------------------
// Persisted state shape
// ---------------------------------------------------------------------------

export interface StudioConfig {
  serverUrl: string;
  selectedModel: string;
  contentMode: ContentMode;
  presetId: PresetId;
  systemPrompt: string;
  userPrompt: string;
  triggerWord: string;
  parallelRequests: number;
}

export interface StudioImages {
  names: string[];
  count: number;
}

export interface StudioJob {
  jobId: string | null;
  progress: ProgressState;
  isProcessing: boolean;
  isDownloading: boolean;
  imageStatuses: Record<string, { status: string; caption?: string; error?: string }>;
}

export interface StudioCrop {
  rulesetId: string;
  detections: DetectionResult[];
  crops: ImageCrop[];
  selectedImageIndex: number;
}

interface StudioPersistedState {
  config: StudioConfig;
  workflowStep: WorkflowStep;
  images: StudioImages;
  job: StudioJob;
  crop: StudioCrop;
}

// ---------------------------------------------------------------------------
// Default factories
// ---------------------------------------------------------------------------

function createDefaultConfig(): StudioConfig {
  const preset = CAPTION_PRESETS[0];
  return {
    serverUrl: process.env.NEXT_PUBLIC_CAPTION_API_URL || "http://localhost:8080",
    selectedModel: "",
    contentMode: "sfw",
    presetId: preset?.id ?? "flux1-dev",
    systemPrompt: preset?.systemPrompt ?? "",
    userPrompt: preset?.userPromptTemplate ?? "",
    triggerWord: "",
    parallelRequests: 4,
  };
}

function createDefaultImages(): StudioImages {
  return { names: [], count: 0 };
}

function createDefaultJob(): StudioJob {
  return {
    jobId: null,
    progress: { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 },
    isProcessing: false,
    isDownloading: false,
    imageStatuses: {},
  };
}

function createDefaultCrop(): StudioCrop {
  return {
    rulesetId: CROP_RULESETS[1]?.id ?? "crop_50_50",
    detections: [],
    crops: [],
    selectedImageIndex: 0,
  };
}

const defaultState: StudioPersistedState = {
  config: createDefaultConfig(),
  workflowStep: "configure",
  images: createDefaultImages(),
  job: createDefaultJob(),
  crop: createDefaultCrop(),
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStudioStore = create<StudioPersistedState & StudioActions>()(
  persist(
    (set) => ({
      // -- Initial state --
      config: defaultState.config,
      workflowStep: defaultState.workflowStep,
      images: defaultState.images,
      job: defaultState.job,
      crop: defaultState.crop,

      // =========================================================================
      // CONFIG ACTIONS
      // =========================================================================

      setServerUrl: (url: string) =>
        set((state) => ({ config: { ...state.config, serverUrl: url } })),

      setSelectedModel: (id: string) =>
        set((state) => ({ config: { ...state.config, selectedModel: id } })),

      setContentMode: (mode: ContentMode) =>
        set((state) => ({ config: { ...state.config, contentMode: mode } })),

      setParallelRequests: (value: number) =>
        set((state) => ({ config: { ...state.config, parallelRequests: value } })),

      setPresetId: (id: PresetId) => {
        const preset = getPreset(id);
        set((state) => ({
          config: {
            ...state.config,
            presetId: id,
            systemPrompt: preset.systemPrompt,
            userPrompt: preset.userPromptTemplate,
          },
        }));
      },

      setSystemPrompt: (value: string) =>
        set((state) => ({ config: { ...state.config, systemPrompt: value } })),

      setUserPrompt: (value: string) =>
        set((state) => ({ config: { ...state.config, userPrompt: value } })),

      setTriggerWord: (value: string) =>
        set((state) => ({ config: { ...state.config, triggerWord: value } })),

      // =========================================================================
      // WORKFLOW ACTIONS
      // =========================================================================

      setWorkflowStep: (step: WorkflowStep) => set({ workflowStep: step }),

      // =========================================================================
      // IMAGE ACTIONS
      // =========================================================================

      setImages: (names: string[]) =>
        set({ images: { names, count: names.length } }),

      // =========================================================================
      // JOB ACTIONS
      // =========================================================================

      setJobId: (jobId: string | null) =>
        set((state) => ({ job: { ...state.job, jobId } })),

      setJobProgress: (progress: ProgressState) =>
        set((state) => ({ job: { ...state.job, progress } })),

      setIsProcessing: (isProcessing: boolean) =>
        set((state) => ({ job: { ...state.job, isProcessing } })),

      setIsDownloading: (isDownloading: boolean) =>
        set((state) => ({ job: { ...state.job, isDownloading } })),

      setImageStatuses: (statuses: StudioJob["imageStatuses"]) =>
        set((state) => ({ job: { ...state.job, imageStatuses: statuses } })),

      resetJob: () => set({ job: createDefaultJob() }),

      // =========================================================================
      // CROP ACTIONS
      // =========================================================================

      setCropRulesetId: (rulesetId: string) =>
        set((state) => ({ crop: { ...state.crop, rulesetId } })),

      setCropDetections: (detections: DetectionResult[]) =>
        set((state) => ({ crop: { ...state.crop, detections } })),

      setCrops: (crops: ImageCrop[]) =>
        set((state) => ({ crop: { ...state.crop, crops } })),

      setSelectedCropImageIndex: (index: number) =>
        set((state) => ({ crop: { ...state.crop, selectedImageIndex: index } })),

      resetCrop: () => set({ crop: createDefaultCrop() }),

      // =========================================================================
      // COMPOUND ACTIONS
      // =========================================================================

      resetWorkflow: () =>
        set({
          workflowStep: "configure",
          images: createDefaultImages(),
          job: createDefaultJob(),
          crop: createDefaultCrop(),
        }),

      // Clear everything including config (full reset)
      fullReset: () => set(defaultState),
    }),
    {
      name: "caption-studio-storage",
      // Only persist config + rulesetId. Everything else is session-only.
      partialize: (state) => {
        // Exclude prompts — they reset to preset defaults on every load
        const { serverUrl, selectedModel, contentMode, presetId, triggerWord, parallelRequests } = state.config;
        return {
          config: { serverUrl, selectedModel, contentMode, presetId, triggerWord, parallelRequests },
          crop: {
          rulesetId: state.crop.rulesetId,
          // Don't persist crops/detections — they depend on fresh detection run
          crops: [],
          detections: [],
          selectedImageIndex: 0,
        },
        };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Actions type (extracted for TypeScript)
// ---------------------------------------------------------------------------

export interface StudioActions {
  // Config
  setServerUrl: (url: string) => void;
  setSelectedModel: (id: string) => void;
  setContentMode: (mode: ContentMode) => void;
  setParallelRequests: (value: number) => void;
  setPresetId: (id: PresetId) => void;
  setSystemPrompt: (value: string) => void;
  setUserPrompt: (value: string) => void;
  setTriggerWord: (value: string) => void;

  // Workflow
  setWorkflowStep: (step: WorkflowStep) => void;

  // Images
  setImages: (names: string[]) => void;

  // Job
  setJobId: (jobId: string | null) => void;
  setJobProgress: (progress: ProgressState) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setIsDownloading: (isDownloading: boolean) => void;
  setImageStatuses: (statuses: StudioJob["imageStatuses"]) => void;
  resetJob: () => void;

  // Crop
  setCropRulesetId: (rulesetId: string) => void;
  setCropDetections: (detections: DetectionResult[]) => void;
  setCrops: (crops: ImageCrop[]) => void;
  setSelectedCropImageIndex: (index: number) => void;
  resetCrop: () => void;

  // Compound
  resetWorkflow: () => void;
  fullReset: () => void;
}

// ---------------------------------------------------------------------------
// Derived getters (not part of store — use inline)
// ---------------------------------------------------------------------------

/** Get the current crop ruleset object from store. */
export function getActiveRuleset(): CropRuleset {
  const { rulesetId } = useStudioStore.getState().crop;
  return getCropRuleset(rulesetId);
}

/** Check if trigger word is required for current preset. */
export function isTriggerRequired(): boolean {
  const { presetId, triggerWord } = useStudioStore.getState().config;
  return getPreset(presetId).needsTrigger && !triggerWord.trim();
}

/** Get current preset info. */
export function getCurrentPreset() {
  const { presetId } = useStudioStore.getState().config;
  return getPreset(presetId);
}
