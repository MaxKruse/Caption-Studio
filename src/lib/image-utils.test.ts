/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSharp = vi.fn();
vi.mock("sharp", () => ({
  default: mockSharp,
}));

// ---------------------------------------------------------------------------
// getExtension
// ---------------------------------------------------------------------------

describe("getExtension", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns lowercase extension for .png files", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("photo.PNG")).toBe("png");
  });

  it("returns lowercase extension for .jpg files", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("image.JPG")).toBe("jpg");
  });

  it("returns lowercase extension for .jpeg files", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("photo.JPEG")).toBe("jpeg");
  });

  it("returns lowercase extension for .webp files", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("image.WEBP")).toBe("webp");
  });

  it("returns lowercase extension for .gif files", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("anim.GIF")).toBe("gif");
  });

  it("returns empty string for files without extension", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("noextension")).toBe("");
  });

  it("returns the part after the dot for dotfiles", async () => {
    const { getExtension } = await import("./image-utils");
    // ".hidden" splits into ["", "hidden"] -> pop returns "hidden"
    expect(getExtension(".hidden")).toBe("hidden");
  });

  it("handles filenames with multiple dots", async () => {
    const { getExtension } = await import("./image-utils");
    expect(getExtension("my.photo.png")).toBe("png");
  });
});

// ---------------------------------------------------------------------------
// needsConversion
// ---------------------------------------------------------------------------

describe("needsConversion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false for .png files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.png")).toBe(false);
  });

  it("returns false for .jpg files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.jpg")).toBe(false);
  });

  it("returns false for .jpeg files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.jpeg")).toBe(false);
  });

  it("returns true for .webp files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.webp")).toBe(true);
  });

  it("returns true for .gif files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.gif")).toBe(true);
  });

  it("returns true for .bmp files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.bmp")).toBe(true);
  });

  it("returns true for .tiff files", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.tiff")).toBe(true);
  });

  it("returns true for files with no extension", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("noextension")).toBe(true);
  });

  it("handles uppercase extensions correctly", async () => {
    const { needsConversion } = await import("./image-utils");
    expect(needsConversion("photo.PNG")).toBe(false);
    expect(needsConversion("photo.JPG")).toBe(false);
    expect(needsConversion("photo.WEBP")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// convertToJpeg (mocked sharp)
// ---------------------------------------------------------------------------

describe("convertToJpeg", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("converts buffer to JPEG format using sharp", async () => {
    const mockJpeg = vi.fn().mockReturnThis();
    const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from("jpeg-data"));

    mockSharp.mockImplementation(() =>
      ({
        jpeg: mockJpeg,
        toBuffer: mockToBuffer,
      }) as any
    );

    const { convertToJpeg } = await import("./image-utils");

    const result = await convertToJpeg(Buffer.from("webp-data"));

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.buffer).toEqual(Buffer.from("jpeg-data"));
    expect(mockJpeg).toHaveBeenCalledWith({ quality: 90 });
    expect(mockToBuffer).toHaveBeenCalled();
  });

  it("preserves the converted buffer", async () => {
    const mockJpeg = vi.fn().mockReturnThis();
    const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from("converted-jpeg"));

    mockSharp.mockImplementation(() =>
      ({
        jpeg: mockJpeg,
        toBuffer: mockToBuffer,
      }) as any
    );

    const { convertToJpeg } = await import("./image-utils");

    const result = await convertToJpeg(Buffer.from("original-data"));

    expect(result.buffer.toString()).toBe("converted-jpeg");
  });
});

// ---------------------------------------------------------------------------
// prepareForDetection (mocked sharp)
// ---------------------------------------------------------------------------

describe("prepareForDetection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("scales image to max 1024px and converts to JPEG", async () => {
    const mockResize = vi.fn().mockReturnThis();
    const mockJpeg = vi.fn().mockReturnThis();
    const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from("scaled-jpeg"));

    mockSharp.mockImplementation(() =>
      ({
        resize: mockResize,
        jpeg: mockJpeg,
        toBuffer: mockToBuffer,
      }) as any
    );

    const { prepareForDetection, DETECTION_MAX_DIMENSION } = await import("./image-utils");

    const result = await prepareForDetection(Buffer.from("original-data"));

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.buffer).toEqual(Buffer.from("scaled-jpeg"));
    expect(mockResize).toHaveBeenCalledWith(
      DETECTION_MAX_DIMENSION,
      DETECTION_MAX_DIMENSION,
      { fit: "inside", withoutEnlargement: true }
    );
    expect(mockJpeg).toHaveBeenCalledWith({ quality: 85 });
  });

  it("uses DETECTION_MAX_DIMENSION constant of 1024", async () => {
    const { DETECTION_MAX_DIMENSION } = await import("./image-utils");
    expect(DETECTION_MAX_DIMENSION).toBe(1024);
  });
});


