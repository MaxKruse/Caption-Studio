import { describe, it, expect } from "bun:test";
import fsp from "fs/promises";
import { createSession, saveImage, saveImagesBatch, deleteSession } from "@/lib/temp-files";

describe("temp-files saveImage validation", () => {
  it("saves valid image buffer", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    const name = await saveImage(session.id, "test.png", png, usedBases);
    expect(name).toBe("test.png");
    await deleteSession(session.id);
  });

  it("rejects invalid image buffer", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const txt = Buffer.from("hello world");
    const name = await saveImage(session.id, "test.txt", txt, usedBases);
    expect(name).toBeNull();
    await deleteSession(session.id);
  });

  it("rejects empty buffer", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const empty = Buffer.from([]);
    const name = await saveImage(session.id, "empty.jpg", empty, usedBases);
    expect(name).toBeNull();
    await deleteSession(session.id);
  });
});

// ---------------------------------------------------------------------------
// saveImagesBatch
// ---------------------------------------------------------------------------

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("temp-files saveImagesBatch", () => {
  it("saves all images and maps results to input order", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const results = await saveImagesBatch(
      session.id,
      [
        { originalName: "a.png", data: PNG_BYTES },
        { originalName: "b.jpg", data: PNG_BYTES },
        { originalName: "c.png", data: PNG_BYTES },
      ],
      usedBases
    );
    expect(results).toEqual(["a.png", "b.jpg", "c.png"]);

    const files = await fsp.readdir(session.dir);
    expect(files.sort()).toEqual(["a.png", "b.jpg", "c.png"]);
    await deleteSession(session.id);
  });

  it("deduplicates colliding base names in input order", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const results = await saveImagesBatch(
      session.id,
      [
        { originalName: "1.png", data: PNG_BYTES },
        { originalName: "1.jpg", data: PNG_BYTES },
        { originalName: "1.png", data: PNG_BYTES },
      ],
      usedBases
    );
    expect(results).toEqual(["1.png", "1_1.jpg", "1_2.png"]);
    await deleteSession(session.id);
  });

  it("returns null for invalid items while saving the rest", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const results = await saveImagesBatch(
      session.id,
      [
        { originalName: "good.png", data: PNG_BYTES },
        { originalName: "bad.txt", data: Buffer.from("not an image") },
        { originalName: "good2.png", data: PNG_BYTES },
        { originalName: "empty.png", data: Buffer.from([]) },
      ],
      usedBases
    );
    expect(results).toEqual(["good.png", null, "good2.png", null]);

    const files = (await fsp.readdir(session.dir)).sort();
    expect(files).toEqual(["good.png", "good2.png"]);
    await deleteSession(session.id);
  });

  it("enforces the per-session image cap like saveImage does", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    const items = Array.from({ length: 105 }, (_, i) => ({
      originalName: `img-${i}.png`,
      data: PNG_BYTES,
    }));
    const results = await saveImagesBatch(session.id, items, usedBases);
    const saved = results.filter((r) => r !== null).length;
    expect(saved).toBe(100);
    // First 100 keep input order, the rest are rejected
    expect(results[99]).toBe("img-99.png");
    expect(results[100]).toBeNull();
    expect(results[104]).toBeNull();
    await deleteSession(session.id);
  });

  it("returns all null for an unknown session", async () => {
    const results = await saveImagesBatch(
      "does-not-exist",
      [{ originalName: "a.png", data: PNG_BYTES }],
      new Set()
    );
    expect(results).toEqual([null]);
  });

  it("returns an empty array for no items", async () => {
    const session = await createSession();
    const results = await saveImagesBatch(session.id, [], new Set());
    expect(results).toEqual([]);
    await deleteSession(session.id);
  });
});
