/**
 * Tests for prepareForApi / resizeIfNeeded: default max dimension and
 * the optional per-request override.
 *
 * The default is lowered to 1536px because llama.cpp's default
 * --image-max-tokens (8192) truncates larger images server-side anyway,
 * so upscaling the wire size to 3072px only burns bandwidth and prefill.
 */

import { describe, it, expect } from "bun:test";
import sharp from "sharp";
import {
  prepareForApi,
  resizeIfNeeded,
  API_MAX_DIMENSION,
} from "@/lib/image-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 100, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function dims(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API_MAX_DIMENSION default", () => {
  it("defaults to 1536 (within llama.cpp's default 8192 vision-token budget)", () => {
    expect(API_MAX_DIMENSION).toBe(1536);
  });
});

describe("prepareForApi", () => {
  it("resizes a 2000px image down to the 1536 default", async () => {
    const big = await makeJpeg(2000, 1000);
    const { buffer } = await prepareForApi("img.jpg", big);
    const { width } = await dims(buffer);
    expect(width).toBe(1536);
  });

  it("passes through a small PNG unchanged in size and format", async () => {
    const small = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const { buffer, mimeType } = await prepareForApi("img.png", small);
    const { width, height } = await dims(buffer);
    expect(width).toBe(400);
    expect(height).toBe(300);
    expect(mimeType).toBe("image/png");
  });

  it("respects an explicit larger maxDimension override", async () => {
    const big = await makeJpeg(2000, 1000);
    const { buffer } = await prepareForApi("img.jpg", big, 2048);
    const { width } = await dims(buffer);
    expect(width).toBe(2000); // no resize needed at 2048
  });

  it("converts WebP to JPEG and resizes to the default", async () => {
    const webp = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .webp()
      .toBuffer();
    const { buffer, mimeType } = await prepareForApi("img.webp", webp);
    const { width } = await dims(buffer);
    expect(mimeType).toBe("image/jpeg");
    expect(width).toBe(1536);
  });
});

describe("resizeIfNeeded", () => {
  it("never enlarges images smaller than the target", async () => {
    const small = await makeJpeg(300, 200);
    const { buffer } = await resizeIfNeeded(small, 1536);
    const { width, height } = await dims(buffer);
    expect(width).toBe(300);
    expect(height).toBe(200);
  });
});
