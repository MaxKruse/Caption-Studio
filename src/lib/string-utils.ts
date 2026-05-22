/**
 * Shared string utilities used by both client and server code.
 */

/**
 * Returns the file extension (lowercase, no dot) from a filename.
 */
export function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}
