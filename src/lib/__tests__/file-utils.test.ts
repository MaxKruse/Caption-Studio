/**
 * Unit tests for file base64 helpers (WD Tagger payloads).
 *
 * Run with: bun test
 */

import { describe, it, expect } from "bun:test";
import { fileToBase64 } from "../file-utils";

// A 1x1 JPEG whose base64 is well known
const ONE_PIXEL_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

describe("fileToBase64", () => {
  it("returns raw base64 without the data URL prefix", async () => {
    const bytes = Buffer.from(ONE_PIXEL_JPEG_B64, "base64");
    const file = new File([bytes], "pixel.jpg", { type: "image/jpeg" });

    const b64 = await fileToBase64(file);

    expect(b64).toBe(ONE_PIXEL_JPEG_B64);
    expect(b64).not.toContain("data:");
    expect(b64).not.toContain(",");
  });

  it("round-trips arbitrary binary content", async () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 255]);
    const file = new File([bytes], "bin.bin", { type: "application/octet-stream" });

    const b64 = await fileToBase64(file);

    expect(Buffer.from(b64, "base64").equals(bytes)).toBe(true);
  });
});
