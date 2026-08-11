import { describe, it, expect } from "bun:test";
import { createSession, saveImage, deleteSession } from "@/lib/temp-files";

describe("temp-files size limits", () => {
  it("rejects image larger than max size", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    // 11 MB buffer with valid PNG header
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    bigBuffer[0] = 0x89;
    bigBuffer[1] = 0x50;
    bigBuffer[2] = 0x4E;
    bigBuffer[3] = 0x47;
    const name = await saveImage(session.id, "big.png", bigBuffer, usedBases);
    // Should be rejected due to size limit
    expect(name).toBeNull();
    deleteSession(session.id);
  });

  it("accepts image within size limit", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const smallBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    const name = await saveImage(session.id, "small.png", smallBuffer, usedBases);
    expect(name).toBe("small.png");
    deleteSession(session.id);
  });

  it("rejects when max image count exceeded", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    // Fill up to max 100 images
    for (let i = 0; i < 100; i++) {
      const name = await saveImage(session.id, `img${i}.png`, png, usedBases);
      expect(name).not.toBeNull();
    }
    // 101st should be rejected
    const name = await saveImage(session.id, "img101.png", png, usedBases);
    expect(name).toBeNull();
    deleteSession(session.id);
  });
});
