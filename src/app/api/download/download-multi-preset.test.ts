import { describe, it, expect, beforeEach } from "vitest";

/** Parse filenames from a ZIP central directory. */
function extractZipEntries(buffer: Buffer): string[] {
  const entries: string[] = [];
  const sigBytes = [0x50, 0x4b, 0x01, 0x02];
  let offset = 0;
  while (offset <= buffer.length - 46) {
    if (
      buffer[offset] === sigBytes[0] &&
      buffer[offset + 1] === sigBytes[1] &&
      buffer[offset + 2] === sigBytes[2] &&
      buffer[offset + 3] === sigBytes[3]
    ) {
      const filenameLen = buffer.readUInt16LE(offset + 28);
      const extraLen = buffer.readUInt16LE(offset + 30);
      const commentLen = buffer.readUInt16LE(offset + 32);
      const name = buffer.toString("utf8", offset + 46, offset + 46 + filenameLen);
      entries.push(name);
      offset += 46 + filenameLen + extraLen + commentLen;
    } else {
      offset++;
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// POST /api/download — multi-preset (multi-job) ZIP export
// ---------------------------------------------------------------------------

describe("POST /api/download — multi-preset", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 when jobIds array is empty", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: [] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("no jobs");
  });

  it("returns 404 when one of the jobIds does not exist", async () => {
    const store = await import("@/lib/store");

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "",
      1,
      undefined,
      "flux1-dev",
      "Flux1-Dev",
    );

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: [jobId, "nonexistent"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("creates ZIP with preset folders for multiple jobs", async () => {
    const store = await import("@/lib/store");

    const job1 = await store.createJob(
      [{ name: "photo1.png", data: Buffer.from("img1") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "trigger1",
      1,
      undefined,
      "flux1-dev",
      "Flux1-Dev",
    );
    store.updateImageStatus(job1, "photo1.png", "completed", "flux caption for photo1");

    const job2 = await store.createJob(
      [{ name: "photo1.png", data: Buffer.from("img1") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe minimal",
      "trigger1",
      1,
      undefined,
      "z-image-turbo-char",
      "ZImageTurbo-Char",
    );
    store.updateImageStatus(job2, "photo1.png", "completed", "z-image caption for photo1");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: [job1, job2] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    // Filename should reference "AllPresets"
    expect(res.headers.get("Content-Disposition")).toContain("AllPresets");

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer[0]).toBe(0x50); // ZIP magic
    expect(buffer[1]).toBe(0x4b);

    const entries = extractZipEntries(buffer);

    // Each preset should have its own folder
    expect(entries.some((e) => e.startsWith("Flux1-Dev/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("ZImageTurbo-Char/"))).toBe(true);

    // Each folder should contain image + caption
    expect(entries).toContain("Flux1-Dev/photo1.png");
    expect(entries).toContain("Flux1-Dev/photo1.txt");
    expect(entries).toContain("ZImageTurbo-Char/photo1.png");
    expect(entries).toContain("ZImageTurbo-Char/photo1.txt");
  });

  it("deletes all jobs from store after multi-job download", async () => {
    const store = await import("@/lib/store");

    const job1 = await store.createJob(
      [{ name: "a.png", data: Buffer.from("a") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "trigger1",
      1,
      undefined,
      "flux1-dev",
      "Flux1-Dev",
    );
    store.updateImageStatus(job1, "a.png", "completed", "cap1");

    const job2 = await store.createJob(
      [{ name: "a.png", data: Buffer.from("a") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "trigger1",
      1,
      undefined,
      "z-image-turbo-char",
      "ZImageTurbo-Char",
    );
    store.updateImageStatus(job2, "a.png", "completed", "cap2");

    expect(store.getJob(job1)).toBeDefined();
    expect(store.getJob(job2)).toBeDefined();

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: [job1, job2] }),
    });

    await POST(req);

    expect(store.getJob(job1)).toBeUndefined();
    expect(store.getJob(job2)).toBeUndefined();
  });

  it("handles failed captions in multi-preset ZIP", async () => {
    const store = await import("@/lib/store");

    const job1 = await store.createJob(
      [{ name: "photo.png", data: Buffer.from("img") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "trigger1",
      1,
      undefined,
      "flux1-dev",
      "Flux1-Dev",
    );
    store.updateImageStatus(job1, "photo.png", "completed", "good caption");

    const job2 = await store.createJob(
      [{ name: "photo.png", data: Buffer.from("img") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "trigger1",
      1,
      undefined,
      "z-image-turbo-char",
      "ZImageTurbo-Char",
    );
    store.updateImageStatus(job2, "photo.png", "failed", undefined, "API error");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: [job1, job2] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buffer = Buffer.from(await res.arrayBuffer());
    const entries = extractZipEntries(buffer);

    // Both presets should have their folders
    expect(entries).toContain("Flux1-Dev/photo.png");
    expect(entries).toContain("Flux1-Dev/photo.txt");
    expect(entries).toContain("ZImageTurbo-Char/photo.png");
    expect(entries).toContain("ZImageTurbo-Char/photo.txt");
  });

  it("single jobId still works (backward compatibility)", async () => {
    const store = await import("@/lib/store");

    const jobId = await store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "describe",
      "trigger1",
      1,
      undefined,
      "flux1-dev",
      "Flux1-Dev",
    );
    store.updateImageStatus(jobId, "test.png", "completed", "a cat");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const buffer = Buffer.from(await res.arrayBuffer());
    const entries = extractZipEntries(buffer);

    // Single job = flat structure (no preset folder)
    expect(entries).toContain("test.png");
    expect(entries).toContain("test.txt");
  });
});
