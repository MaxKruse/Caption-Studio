import { describe, it, expect } from "bun:test";
import fsp from "fs/promises";
import {
  createSession,
  saveImage,
  saveImagesBatch,
  deleteSession,
  MAX_IMAGES_PER_SESSION,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/temp-files";

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
    expect(results).toEqual([
      { name: "a.png" },
      { name: "b.jpg" },
      { name: "c.png" },
    ]);

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
    expect(results).toEqual([
      { name: "1.png" },
      { name: "1_1.jpg" },
      { name: "1_2.png" },
    ]);
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
    expect(results).toEqual([
      { name: "good.png" },
      { name: null, reason: "invalid-format" },
      { name: "good2.png" },
      { name: null, reason: "invalid-format" },
    ]);

    const files = (await fsp.readdir(session.dir)).sort();
    expect(files).toEqual(["good.png", "good2.png"]);
    await deleteSession(session.id);
  });

  it("enforces the per-session image cap like saveImage does", async () => {
    const session = await createSession();
    const usedBases = new Set<string>();
    // Pre-fill the session to cap-2 (same object reference the module uses)
    session.imageCount = MAX_IMAGES_PER_SESSION - 2;
    const items = Array.from({ length: 5 }, (_, i) => ({
      originalName: `img-${i}.png`,
      data: PNG_BYTES,
    }));
    const results = await saveImagesBatch(session.id, items, usedBases);
    const saved = results.filter((r) => r.name !== null).length;
    expect(saved).toBe(2);
    // First two keep input order, the rest are rejected as session-full
    expect(results[0].name).toBe("img-0.png");
    expect(results[1].name).toBe("img-1.png");
    expect(results[2]).toEqual({ name: null, reason: "session-full" });
    expect(results[4]).toEqual({ name: null, reason: "session-full" });
    await deleteSession(session.id);
  });

  it("returns all null for an unknown session", async () => {
    const results = await saveImagesBatch(
      "does-not-exist",
      [{ originalName: "a.png", data: PNG_BYTES }],
      new Set()
    );
    expect(results).toEqual([{ name: null }]);
  });

  it("reports oversized and invalid-format reasons per item", async () => {
    const session = await createSession();
    // 10 MB + 1 byte with a valid PNG header: oversized wins over format
    const big = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    const results = await saveImagesBatch(
      session.id,
      [
        { originalName: "big.png", data: big },
        { originalName: "bad.png", data: Buffer.from("not an image") },
      ],
      new Set<string>()
    );
    expect(results).toEqual([
      { name: null, reason: "oversized" },
      { name: null, reason: "invalid-format" },
    ]);
    await deleteSession(session.id);
  });

  it("returns an empty array for no items", async () => {
    const session = await createSession();
    const results = await saveImagesBatch(session.id, [], new Set());
    expect(results).toEqual([]);
    await deleteSession(session.id);
  });
});
