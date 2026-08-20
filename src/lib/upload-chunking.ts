/**
 * Client-side helpers for the chunked upload protocol (large batches).
 *
 * Large batches (700+ images) are split into fixed-size chunks so the
 * server can open the SSE stream and start captioning after the first
 * small chunk instead of after the whole multi-GB body arrives:
 *
 * - Chunk 0 POSTs to the caption route and returns the SSE stream
 * - Chunks 1..n POST to the same route and get a JSON ack
 *
 * Global image indices are preserved: chunk k covers images
 * [k*chunkSize, k*chunkSize + chunkSize).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Images per chunk. ~25 keeps the first response in seconds for typical 1-2 MB images. */
export const UPLOAD_CHUNK_SIZE = 25;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface ChunkedUploadPlan {
  /** True when the batch is split across multiple POSTs. */
  isChunked: boolean;
  /** Number of chunks (1 when not chunked). */
  chunks: number;
  chunkSize: number;
}

/**
 * Decide how to upload `totalImages` images. Batches of chunkSize or
 * fewer use the legacy single-shot POST (one SSE stream, no chunk
 * fields in the config).
 */
export function planChunkedUpload(
  totalImages: number,
  chunkSize: number = UPLOAD_CHUNK_SIZE
): ChunkedUploadPlan {
  if (totalImages <= chunkSize) {
    return { isChunked: false, chunks: 1, chunkSize };
  }
  return { isChunked: true, chunks: Math.ceil(totalImages / chunkSize), chunkSize };
}

// ---------------------------------------------------------------------------
// Chunk FormData
// ---------------------------------------------------------------------------

export interface ChunkFormDataOptions {
  /** Config fields shared by all chunks (serverUrl, model, ...). */
  baseConfig: Record<string, unknown>;
  /** Client-generated session UUID (same for every chunk). */
  sessionId: string;
  /** Total images across all chunks. */
  expectedImageCount: number;
  /** 0-based chunk index. */
  chunkIndex: number;
  chunkSize: number;
  /** Global image file array. */
  imageFiles: File[];
  /** Global image name array (aligned with imageFiles). */
  imageNames: string[];
  /** Global caption text array (aligned; "" = no caption for that image). */
  captionTexts: string[];
}

/**
 * Build the multipart body for one chunk: config (with chunk fields),
 * this chunk's image names, and its image + caption parts.
 */
export function buildChunkFormData(options: ChunkFormDataOptions): FormData {
  const {
    baseConfig,
    sessionId,
    expectedImageCount,
    chunkIndex,
    chunkSize,
    imageFiles,
    imageNames,
    captionTexts,
  } = options;

  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, imageFiles.length);

  const fd = new FormData();
  fd.append(
    "config",
    JSON.stringify({
      ...baseConfig,
      sessionId,
      expectedImageCount,
      chunkIndex,
      chunkSize,
    })
  );
  fd.append("imageNames", JSON.stringify(imageNames.slice(start, end)));

  for (let i = start; i < end; i++) {
    fd.append("images", imageFiles[i]);
    const caption = captionTexts[i] ?? "";
    if (caption) {
      fd.append(
        "captions",
        new Blob([caption], { type: "text/plain" }),
        `${imageNames[i]}.txt`
      );
    }
  }

  return fd;
}
