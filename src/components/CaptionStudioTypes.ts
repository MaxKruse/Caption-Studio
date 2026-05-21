// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  data: string; // raw base64
  preview: string; // data URL
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const PROMPT_PREFIX_DEFAULT = "Include the name of the subject";
export const TOAST_DURATION = 4000;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/** Format milliseconds to a compact human-readable duration string. */
export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs === 0) return "<1s";
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remainingSecs = secs % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSecs > 0 || parts.length === 0) parts.push(`${remainingSecs}s`);
  return parts.join(" ");
}
