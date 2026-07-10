// ---------------------------------------------------------------------------
// Shared types for API routes
// ---------------------------------------------------------------------------

/** Model info returned by /v1/models endpoint. */
export interface ModelInfo {
  id: string;
  owned_by?: string;
  architecture?: {
    input_modalities?: string[];
  };
  input_modalities?: string[];
}

/** Crop rectangle in 1000-normalized coordinates. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
