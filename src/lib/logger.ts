/**
 * Simple structured logger for Caption Studio.
 * Logs JSON lines with timestamp, level, message, and metadata.
 */

export function generateRequestId(): string {
  // UUID v4
  const crypto = globalThis.crypto as Crypto;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function logStructured(level: string, message: string, meta: Record<string, unknown> = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
  };
  // In production, consider using a proper logger sink
  console.log(JSON.stringify(entry));
}
