import { describe, it, expect } from "bun:test";
import {
  createSession,
  deduplicateFileName,
  deleteSession,
  sanitizeFileName,
} from "@/lib/temp-files";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("temp-files session ids", () => {
  it("createSession generates a UUIDv4 id (unpredictable, not Math.random)", async () => {
    const session = await createSession();
    expect(session.id).toMatch(UUID_V4_RE);
    await deleteSession(session.id);
  });

  it("createSession ids are unique across sessions", async () => {
    const a = await createSession();
    const b = await createSession();
    expect(a.id).not.toBe(b.id);
    await deleteSession(a.id);
    await deleteSession(b.id);
  });
});

describe("temp-files", () => {
  it("sanitize: removes path traversal segments", () => {
    expect(sanitizeFileName("../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\secret.txt")).toBe("secret.txt");
    expect(sanitizeFileName("folder/../file.jpg")).toBe("file.jpg");
  });

  it("sanitize: strips path separators", () => {
    expect(sanitizeFileName("path/to/file.jpg")).toBe("file.jpg");
    expect(sanitizeFileName("path\\to\\file.png")).toBe("file.png");
  });

  it("sanitize: removes dangerous characters", () => {
    expect(sanitizeFileName("file<>:\"|?*.jpg")).toBe("file.jpg");
  });

  it("sanitize: normalizes whitespace", () => {
    expect(sanitizeFileName("  my file .jpg  ")).toBe("my_file_.jpg");
  });

  it("sanitize: preserves valid names", () => {
    expect(sanitizeFileName("photo-123.jpg")).toBe("photo-123.jpg");
  });

  it("dedup: returns original name when base is unused", () => {
    const used = new Set<string>();
    expect(deduplicateFileName("photo.jpg", used)).toBe("photo.jpg");
  });

  it("dedup: adds suffix on first collision", () => {
    const used = new Set<string>();
    used.add("photo");
    expect(deduplicateFileName("photo.jpg", used)).toBe("photo_1.jpg");
  });

  it("dedup: increments suffix when photo_1 also taken", () => {
    const used = new Set<string>();
    used.add("photo");
    used.add("photo_1");
    expect(deduplicateFileName("photo.jpg", used)).toBe("photo_2.jpg");
  });

  it("dedup: handles files without extension", () => {
    const used = new Set<string>();
    expect(deduplicateFileName("README", used)).toBe("README");
    used.add("README");
    expect(deduplicateFileName("README", used)).toBe("README_1");
  });

  it("dedup: handles files with multiple dots", () => {
    const used = new Set<string>();
    expect(deduplicateFileName("my.photo.jpg", used)).toBe("my.photo.jpg");
    used.add("my.photo");
    expect(deduplicateFileName("my.photo.jpg", used)).toBe("my.photo_1.jpg");
  });

  it("dedup: collision between different extensions uses same base", () => {
    const used = new Set<string>();
    expect(deduplicateFileName("1.png", used)).toBe("1.png");
    expect(deduplicateFileName("1.jpg", used)).toBe("1_1.jpg");
  });
});
