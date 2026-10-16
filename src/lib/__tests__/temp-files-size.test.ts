import { describe, it, expect } from "bun:test";
import fsp from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  createSession,
  saveImage,
  saveImagesBatch,
  deleteSession,
  MAX_IMAGES_PER_SESSION,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/temp-files";
import { makeOversizedPng } from "./test-helpers";

describe("temp-files size limits", () => {
  it("downsizes a decodable oversized image so the intermediate file fits", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const oversized = await makeOversizedPng();
    expect(oversized.length).toBeGreaterThan(MAX_IMAGE_SIZE_BYTES);
    const name = await saveImage(session.id, "big.png", oversized, usedBases);
    // Accepted, stored under a .jpg name at or below the limit.
    expect(name).toBe("big.jpg");
    const written = await fsp.readFile(path.join(session.dir, "big.jpg"));
    expect(written.length).toBeLessThanOrEqual(MAX_IMAGE_SIZE_BYTES);
    expect((await sharp(written).metadata()).format).toBe("jpeg");
    await deleteSession(session.id);
  });

  it("rejects an oversized image sharp cannot decode", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    // 11 MB of zero bytes with only the PNG magic: passes the magic-byte
    // check but fails to decode at the downscale step -> rejected.
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    bigBuffer[0] = 0x89;
    bigBuffer[1] = 0x50;
    bigBuffer[2] = 0x4e;
    bigBuffer[3] = 0x47;
    const name = await saveImage(session.id, "big.png", bigBuffer, usedBases);
    expect(name).toBeNull();
    await deleteSession(session.id);
  });

  it("accepts image within size limit", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const smallBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const name = await saveImage(session.id, "small.png", smallBuffer, usedBases);
    expect(name).toBe("small.png");
    await deleteSession(session.id);
  });

  it("accepts far more than the old 100-image limit", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    // 150 valid images must all be accepted (large-batch workflow, e.g. 700+)
    const names = await saveImagesBatch(
      session.id,
      Array.from({ length: 150 }, (_, i) => ({ originalName: `img${i}.png`, data: png })),
      usedBases
    );
    expect(names.every((n) => n.name !== null)).toBe(true);
    expect(session.imageCount).toBe(150);
    await deleteSession(session.id);
  });

  it("rejects images beyond the per-session cap", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    // Pre-fill the session to cap-1 (same object reference the module uses)
    session.imageCount = MAX_IMAGES_PER_SESSION - 1;
    const names = await saveImagesBatch(
      session.id,
      [
        { originalName: "last.png", data: png },
        { originalName: "over.png", data: png },
      ],
      usedBases
    );
    expect(names[0]).toEqual({ name: "last.png" });
    expect(names[1]).toEqual({ name: null, reason: "session-full" });
    await deleteSession(session.id);
  });
});
