/**
 * Tests for caption helper utilities.
 * Tests the functions BEFORE refactor (inline in route files) to establish a baseline,
 * then verify they still pass AFTER refactor (extracted to shared lib).
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Inline the current implementations for testing (same as in all 4 route files)
// ---------------------------------------------------------------------------

function replaceVariables(
  text: string,
  imageName: string,
  index: number,
  total: number
): string {
  return text
    .replace(/{image_name}/g, imageName)
    .replace(/{index}/g, String(index + 1))
    .replace(/{total}/g, String(total));
}

async function readFileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

// ---------------------------------------------------------------------------
// replaceVariables tests
// ---------------------------------------------------------------------------

describe("replaceVariables", () => {
  it("replaces {image_name} with the actual filename", () => {
    const result = replaceVariables("Caption for {image_name}", "photo.jpg", 0, 5);
    expect(result).toBe("Caption for photo.jpg");
  });

  it("replaces {index} with 1-based index", () => {
    const result = replaceVariables("Image {index} of {total}", "photo.jpg", 0, 5);
    expect(result).toBe("Image 1 of 5");
  });

  it("replaces {index} for middle element", () => {
    const result = replaceVariables("Image {index}", "photo.jpg", 3, 10);
    expect(result).toBe("Image 4");
  });

  it("replaces {total} with total count", () => {
    const result = replaceVariables("Total: {total}", "photo.jpg", 0, 8);
    expect(result).toBe("Total: 8");
  });

  it("replaces multiple placeholders in same string", () => {
    const result = replaceVariables(
      "Processing {image_name} ({index}/{total})",
      "beach.png",
      2,
      10
    );
    expect(result).toBe("Processing beach.png (3/10)");
  });

  it("replaces duplicate placeholders", () => {
    const result = replaceVariables(
      "{image_name} - {image_name}",
      "test.jpg",
      0,
      1
    );
    expect(result).toBe("test.jpg - test.jpg");
  });

  it("is a no-op when no placeholders present", () => {
    const result = replaceVariables("Just a plain caption", "photo.jpg", 0, 5);
    expect(result).toBe("Just a plain caption");
  });

  it("handles empty text", () => {
    const result = replaceVariables("", "photo.jpg", 0, 5);
    expect(result).toBe("");
  });

  it("handles last image (index = total - 1)", () => {
    const result = replaceVariables("Image {index} of {total}", "end.jpg", 9, 10);
    expect(result).toBe("Image 10 of 10");
  });

  it("handles single image batch", () => {
    const result = replaceVariables("{image_name} ({index}/{total})", "solo.jpg", 0, 1);
    expect(result).toBe("solo.jpg (1/1)");
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
