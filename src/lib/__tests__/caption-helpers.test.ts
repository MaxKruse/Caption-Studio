/**
 * Tests for caption helper utilities.
 */

import { describe, it, expect } from "bun:test";
import { readFileBuffer, sleep } from "@/lib/caption-helpers";

// ---------------------------------------------------------------------------
// sleep tests
// ---------------------------------------------------------------------------

describe("sleep", () => {
  it("resolves after approximately the requested delay", async () => {
    const start = Date.now();
    await sleep(80);
    expect(Date.now() - start).toBeGreaterThanOrEqual(70);
  });

  it("resolves immediately for a zero delay", async () => {
    const start = Date.now();
    await sleep(0);
    expect(Date.now() - start).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// readFileBuffer tests
// ---------------------------------------------------------------------------

describe("readFileBuffer", () => {
  it("returns correct buffer content for a text file", async () => {
    const content = "Hello, World!";
    const file = new File([content], "test.txt", { type: "text/plain" });
    const buffer = await readFileBuffer(file);
    expect(buffer.toString()).toBe(content);
  });

  it("returns correct buffer content for binary data", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });
    const buffer = await readFileBuffer(file);
    expect(buffer.length).toBe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      expect(buffer[i]).toBe(bytes[i]);
    }
  });

  it("handles empty file", async () => {
    const file = new File([""], "empty.txt", { type: "text/plain" });
    const buffer = await readFileBuffer(file);
    expect(buffer.length).toBe(0);
  });

  it("handles different file types", async () => {
    const content = "PNG data here";
    const file = new File([content], "test.png", { type: "image/png" });
    const buffer = await readFileBuffer(file);
    expect(buffer.toString()).toBe(content);
  });
});
