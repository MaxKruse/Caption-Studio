/**
 * File helpers for the client side.
 */

/**
 * Encode a Uint8Array as base64 (works in browser and Bun/Node).
 *
 * Uses btoa on a binary string built in 32k chunks - FileReader is not
 * available in all runtimes (e.g. Bun tests), and Buffer is not available
 * in the browser bundle.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Read a File as a raw base64 string (no `data:` prefix).
 *
 * Used for the WD Tagger payload: the tag service expects bare base64,
 * while image previews use object URLs so multi-MB data URLs never sit
 * in React state.
 *
 * @param file - The file to read
 * @returns base64-encoded file content
 */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return bytesToBase64(bytes);
}
