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

/**
 * Split a filename into its base name (without extension) and extension
 * (including the dot, original case). Splits on the last dot, so
 * "archive.tar.gz" -> { base: "archive.tar", ext: ".gz" }.
 *
 * Extension-less names yield an empty ext: "README" -> { base: "README", ext: "" }.
 */
export function baseAndExt(filename: string): { base: string; ext: string } {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return { base: filename, ext: "" };
  return { base: filename.slice(0, lastDot), ext: filename.slice(lastDot) };
}
