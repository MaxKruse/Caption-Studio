import { describe, it, expect } from "bun:test";
import { RateLimiter } from "@/lib/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests under limit", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.check("1.2.3.4")).toBe(true);
    expect(limiter.check("1.2.3.4")).toBe(true);
  });

  it("blocks requests over limit", () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4")).toBe(false);
  });

  it("allows different IPs independently", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("1.2.3.4")).toBe(true);
    expect(limiter.check("5.6.7.8")).toBe(true);
  });

  it("resets after window", async () => {
    const limiter = new RateLimiter(1, 50);
    expect(limiter.check("1.2.3.4")).toBe(true);
    expect(limiter.check("1.2.3.4")).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(limiter.check("1.2.3.4")).toBe(true);
  });
});
