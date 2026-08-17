/**
 * Tests for shared filename string utilities.
 */

import { describe, it, expect } from "bun:test";
import { getExtension, baseAndExt } from "@/lib/string-utils";

// ---------------------------------------------------------------------------
// getExtension tests (existing behavior)
// ---------------------------------------------------------------------------

describe("getExtension", () => {
  it("returns lowercase extension without dot", () => {
    expect(getExtension("photo.JPG")).toBe("jpg");
    expect(getExtension("photo.png")).toBe("png");
  });

  it("returns empty string when there is no extension", () => {
    expect(getExtension("README")).toBe("");
  });

  it("uses the last dot for multi-dot names", () => {
    expect(getExtension("archive.tar.gz")).toBe("gz");
  });
});

// ---------------------------------------------------------------------------
// baseAndExt tests
// ---------------------------------------------------------------------------

describe("baseAndExt", () => {
  it("splits base name and extension (with dot)", () => {
    expect(baseAndExt("photo.jpg")).toEqual({ base: "photo", ext: ".jpg" });
    expect(baseAndExt("PHOTO.JPG")).toEqual({ base: "PHOTO", ext: ".JPG" });
  });

  it("keeps case intact (unlike getExtension)", () => {
    expect(baseAndExt("photo.Jpeg").ext).toBe(".Jpeg");
  });

  it("returns empty ext for extension-less names", () => {
    expect(baseAndExt("README")).toEqual({ base: "README", ext: "" });
  });

  it("splits on the last dot for multi-dot names", () => {
    expect(baseAndExt("archive.tar.gz")).toEqual({ base: "archive.tar", ext: ".gz" });
  });

  it("treats leading-dot names as extension-only", () => {
    // Matches the legacy lastIndexOf(".") semantics used by temp-files.
    expect(baseAndExt(".hidden")).toEqual({ base: "", ext: ".hidden" });
  });

  it("returns empty parts for an empty name", () => {
    expect(baseAndExt("")).toEqual({ base: "", ext: "" });
  });
});
