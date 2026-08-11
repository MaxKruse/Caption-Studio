import { describe, it, expect } from "bun:test";
import { createSession, saveImage, deleteSession } from "@/lib/temp-files";

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
