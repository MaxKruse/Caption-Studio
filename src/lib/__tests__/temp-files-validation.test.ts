import { describe, it, expect } from "bun:test";
import { isValidImageBuffer } from "@/lib/temp-files";

describe("temp-files image validation", () => {
  it("accepts PNG magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    expect(isValidImageBuffer(png)).toBe(true);
  });

  it("accepts JPEG magic bytes", () => {
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);
    expect(isValidImageBuffer(jpeg)).toBe(true);
  });

  it("accepts GIF magic bytes", () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(isValidImageBuffer(gif)).toBe(true);
  });

  it("accepts WEBP magic bytes", () => {
    // RIFF....WEBP
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50  // WEBP
    ]);
    expect(isValidImageBuffer(webp)).toBe(true);
  });

  it("accepts AVIF magic bytes (avif brand)", () => {
    // ISO BMFF: ....ftypavif
    const avif = Buffer.from([
      0x00, 0x00, 0x00, 0x12, // box size
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x61, 0x76, 0x69, 0x66, // "avif"
    ]);
    expect(isValidImageBuffer(avif)).toBe(true);
  });

  it("accepts AVIF magic bytes (avis brand)", () => {
    const avis = Buffer.from([
      0x00, 0x00, 0x00, 0x12,
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x61, 0x76, 0x69, 0x73, // "avis"
    ]);
    expect(isValidImageBuffer(avis)).toBe(true);
  });

  it("accepts TIFF magic bytes (little-endian)", () => {
    const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00]); // II*\0
    expect(isValidImageBuffer(tiff)).toBe(true);
  });

  it("accepts TIFF magic bytes (big-endian)", () => {
    const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]); // MM\0*
    expect(isValidImageBuffer(tiff)).toBe(true);
  });

  it("rejects non-image buffer", () => {
    const txt = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    expect(isValidImageBuffer(txt)).toBe(false);
  });

  it("rejects empty buffer", () => {
    const empty = Buffer.from([]);
    expect(isValidImageBuffer(empty)).toBe(false);
  });

  it("rejects HEIC magic bytes (mif1 brand)", () => {
    // Deliberately unsupported: sharp's prebuilt libvips decodes AVIF, not
    // HEVC payloads. The guard test keeps the exclusion intentional.
    const heic = Buffer.from([
      0x00, 0x00, 0x00, 0x20, // box size
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x6d, 0x69, 0x66, 0x31, // "mif1"
    ]);
    expect(isValidImageBuffer(heic)).toBe(false);
  });
});
