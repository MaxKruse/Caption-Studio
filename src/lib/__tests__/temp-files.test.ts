import { describe, it, expect } from "bun:test";

function deduplicateFileName(
  originalName: string,
  usedBases: Set<string>
): string {
  const lastDot = originalName.lastIndexOf(".");
  const ext = lastDot === -1 ? "" : originalName.slice(lastDot);
  const base = lastDot === -1 ? originalName : originalName.slice(0, lastDot);

  if (!usedBases.has(base)) {
    usedBases.add(base);
    return originalName;
  }

  let suffix = 1;
  while (usedBases.has(`${base}_${suffix}`)) {
    suffix++;
  }
  const candidate = `${base}_${suffix}${ext}`;
  usedBases.add(`${base}_${suffix}`);
  return candidate;
}

describe("temp-files", () => {
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
