import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// POST /api/download — ZIP export
// ---------------------------------------------------------------------------

describe("POST /api/download", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 when jobId is missing", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing jobId");
  });

  it("returns 404 when job not found", async () => {
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "nonexistent" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Job not found");
  });

  it("returns a ZIP file with correct Content-Type", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake-png-data") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "MyBatch",
      false,
      1
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
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="CaptionsMyBatch.zip"'
    );
  });

  it("includes both image and caption file entries in ZIP", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "photo1.png", data: Buffer.from("img1") },
        { name: "photo2.jpg", data: Buffer.from("img2") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "photo1.png", "completed", "a cat");
    store.updateImageStatus(jobId, "photo2.jpg", "completed", "a dog");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Read the ZIP content and verify it's a valid ZIP with expected entries
    const buffer = Buffer.from(await res.arrayBuffer());
    // ZIP magic number
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'

    // The ZIP central directory contains filenames
    const text = buffer.toString("utf-8");
    // Check central directory entries (PK\x01\x02)
    expect(text).toContain("photo1.png");
    expect(text).toContain("photo1.txt");
    expect(text).toContain("photo2.jpg");
    expect(text).toContain("photo2.txt");
  });

  it("uses default filename when captionName is empty", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "", // empty captionName
      false,
      1
    );

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);

    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="CaptionsUntitled.zip"'
    );
  });

  it("generates .txt caption files with correct names", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "my-photo.png", data: Buffer.from("img") },
        { name: "another.jpg", data: Buffer.from("img2") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "my-photo.png", "completed", "caption 1");
    store.updateImageStatus(jobId, "another.jpg", "completed", "caption 2");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Check ZIP contains expected filenames in central directory
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf-8");

    // The ZIP central directory stores filenames
    expect(text).toContain("my-photo.txt");
    expect(text).toContain("another.txt");
  });

  it("generates ZIP even when all captions failed", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "test.png",
      "failed",
      undefined,
      "API error"
    );

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buffer = Buffer.from(await res.arrayBuffer());
    // Valid ZIP
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    // Contains the .txt entry
    const text = buffer.toString("utf-8");
    expect(text).toContain("test.txt");
  });

  it("deletes the job from store after download", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "test.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    expect(store.getJob(jobId)).toBeDefined();

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    await POST(req);

    // Job should be deleted after download
    expect(store.getJob(jobId)).toBeUndefined();
  });

  it("renames caption files when basenames collide (same name, different extension)", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "1.png", data: Buffer.from("img-png") },
        { name: "1.jpg", data: Buffer.from("img-jpg") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "1.png", "completed", "caption for png");
    store.updateImageStatus(jobId, "1.jpg", "completed", "caption for jpg");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf-8");

    // Both images present
    expect(text).toContain("1.png");
    expect(text).toContain("1.jpg");

    // Caption files have unique names — one plain, one suffixed
    expect(text).toContain("1.txt");
    expect(text).toContain("1 (1).txt");
  });

  it("handles three-way basename collision", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "photo.png", data: Buffer.from("a") },
        { name: "photo.jpg", data: Buffer.from("b") },
        { name: "photo.webp", data: Buffer.from("c") },
      ],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(jobId, "photo.png", "completed", "cap png");
    store.updateImageStatus(jobId, "photo.jpg", "completed", "cap jpg");
    store.updateImageStatus(jobId, "photo.webp", "completed", "cap webp");

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf-8");

    // All three unique caption files present
    expect(text).toContain("photo.txt");
    expect(text).toContain("photo (1).txt");
    expect(text).toContain("photo (2).txt");
  });

  it("handles files with multiple dots in the name", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [{ name: "my.photo.backup.png", data: Buffer.from("fake") }],
      "http://localhost:8080",
      "llama3",
      "",
      "",
      "describe",
      "",
      false,
      1
    );

    store.updateImageStatus(
      jobId,
      "my.photo.backup.png",
      "completed",
      "caption"
    );

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
