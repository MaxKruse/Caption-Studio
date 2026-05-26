// ---------------------------------------------------------------------------
// Re-exports (backward compatibility)
// ---------------------------------------------------------------------------

export * from "./CaptionStudioConstants";
export * from "./CaptionStudioUtils";

// ---------------------------------------------------------------------------
// Re-export CaptionTypeId for convenience
// ---------------------------------------------------------------------------

export type { CaptionTypeId } from "./CaptionStudioConstants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentMode = "sfw" | "nsfw";

export interface ModelInfo {
  id: string;
  owned_by?: string;
  architecture?: {
    input_modalities?: string[];
  };
  input_modalities?: string[];
}

export interface ImageFile {
  name: string;
  file: File; // original file (sent to server via FormData)
  preview: string; // resized data URL for UI display
}

export interface ProgressState {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  done?: boolean;
  statuses?: Record<string, ImageStatus>;
  avgTimeMs?: number;
  estimatedRemainingMs?: number;
}

export interface ToastState {
  message: string;
  visible: boolean;
}

export interface ImageStatus {
  status: "queued" | "processing" | "completed" | "failed";
  caption?: string;
  error?: string;
  prompt?: string;
  reasoningContent?: string;
}
