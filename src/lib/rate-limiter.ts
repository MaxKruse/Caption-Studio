/**
 * Simple in-memory rate limiter per IP.
 * Allows maxRequests per windowMs.
 */

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  /**
   * Sliding-window state: IP -> request timestamps still inside the window.
   * check() prunes stale entries on every call, so the array only ever holds
   * timestamps from the current window.
   */
  private records = new Map<string, number[]>();

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(ip: string): boolean {
    const now = Date.now();
    const timestamps = this.records.get(ip) ?? [];
    // Remove old timestamps
    const recent = timestamps.filter(t => now - t < this.windowMs);
    if (recent.length >= this.maxRequests) {
      this.records.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.records.set(ip, recent);
    return true;
  }

  reset(ip?: string) {
    if (ip) {
      this.records.delete(ip);
    } else {
      this.records.clear();
    }
  }
}
