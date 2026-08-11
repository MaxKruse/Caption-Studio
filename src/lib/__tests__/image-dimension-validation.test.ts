import { describe, it, expect } from "bun:test";
import { validateImageDimensions } from "@/lib/image-utils";

describe("validateImageDimensions", () => {
  it("accepts small image", async () => {
    const buffer = await makeImageBuffer(800, 600);
    await expect(validateImageDimensions(buffer, 2000, 2000)).resolves.toBeUndefined();
  });

  it("rejects image exceeding max width", async () => {
    const buffer = await makeImageBuffer(3000, 1000);
    await expect(validateImageDimensions(buffer, 2000, 2000)).rejects.toThrow(/width/);
  });

  it("rejects image exceeding max height", async () => {
    const buffer = await makeImageBuffer(1000, 3000);
    await expect(validateImageDimensions(buffer, 2000, 2000)).rejects.toThrow(/height/);
  });

  it("rejects image exceeding both", async () => {
    const buffer = await makeImageBuffer(4000, 5000);
    await expect(validateImageDimensions(buffer, 2000, 2000)).rejects.toThrow();
  });
});

async function makeImageBuffer(width: number, height: number): Promise<Buffer> {
  const sharp = await import("sharp");
  return await sharp.default({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
}
