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

/**
 * Per-attempt deadline for a chunk POST (headers + body + ack). The
 * server's chunk-idle watchdog ends the session when uploads stall, but
 * without this bound a hung body read would wedge the client forever
 * (it awaits the chunk jobs before finalizing). 2 min is below the
 * watchdog (5 min) and above a slow 25-image chunk on a bad link.
 */
export const CHUNK_UPLOAD_TIMEOUT_MS = 2 * 60 * 1000;

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
 * this chunk's image names, and its image + caption parts. A caption part
 * is appended for EVERY image (empty text when there is none) so the
 * server can pair captions to images by 1:1 index.
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
    // Always append a caption part (possibly empty) to keep the `captions`
    // parts 1:1 index-aligned with the `images` parts on the server.
    // A File (not Blob) is required: empty Blobs lose their filename in
    // the multipart encoding.
    fd.append(
      "captions",
      new File([captionTexts[i] ?? ""], `${imageNames[i]}.txt`, { type: "text/plain" })
    );
  }

  return fd;
}

// ---------------------------------------------------------------------------
// Single-shot FormData (small batches)
// ---------------------------------------------------------------------------

export interface SingleShotFormDataOptions {
  /** Config fields (serverUrl, model, ...) - no chunk fields. */
  config: Record<string, unknown>;
  /** Image file array. */
  imageFiles: File[];
  /** Image name array (aligned with imageFiles). */
  imageNames: string[];
  /** Caption text array (aligned; "" = no caption for that image). */
  captionTexts: string[];
}

/**
 * Build the multipart body for a single-shot upload (batches of chunkSize
 * or fewer): config, image names, and one image + one caption part per
 * image. A caption part is appended for EVERY image (empty text when there
 * is none) so the server can pair captions to images by 1:1 index.
 */
export function buildSingleShotFormData(options: SingleShotFormDataOptions): FormData {
  const { config, imageFiles, imageNames, captionTexts } = options;

  const fd = new FormData();
  fd.append("config", JSON.stringify(config));
  fd.append("imageNames", JSON.stringify(imageNames));

  for (let i = 0; i < imageFiles.length; i++) {
    fd.append("images", imageFiles[i]);
    // Always append a caption part (possibly empty) to keep the `captions`
    // parts 1:1 index-aligned with the `images` parts on the server.
    // A File (not Blob) is required: empty Blobs lose their filename in
    // the multipart encoding.
    fd.append(
      "captions",
      new File([captionTexts[i] ?? ""], `${imageNames[i]}.txt`, { type: "text/plain" })
    );
  }

  return fd;
}
