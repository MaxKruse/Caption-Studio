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

    // First occurrence keeps original name; second gets suffixed (both image + caption)
    expect(text).toContain("1.png");
    expect(text).toContain("1.txt");       // caption for 1.png
    expect(text).toContain("1 (1).jpg");   // renamed image
    expect(text).toContain("1 (1).txt");   // matching caption
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

    // All three unique caption files present (paired with matching image names)
    expect(text).toContain("photo.png");       // first keeps original
    expect(text).toContain("photo.txt");
    expect(text).toContain("photo (1).jpg");   // second gets suffixed
    expect(text).toContain("photo (1).txt");
    expect(text).toContain("photo (2).webp");  // third gets suffixed
    expect(text).toContain("photo (2).txt");
  });

  // -----------------------------------------------------------------------
  // Collision-renaming depth tests (image + caption stay paired)
  // -----------------------------------------------------------------------

  /** Parse filenames from a ZIP central directory. */
  function extractZipEntries(buffer: Buffer): string[] {
    const entries: string[] = [];
    // Central directory file header signature: 0x02014b50 (little-endian = PK\x01\x02)
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

  it("two separate collision groups — each independently suffixed", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "1.png", data: Buffer.from("a") },
        { name: "1.jpg", data: Buffer.from("b") },
        { name: "2.png", data: Buffer.from("c") },
        { name: "2.jpg", data: Buffer.from("d") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    store.updateImageStatus(jobId, "1.png", "completed", "cap 1png");
    store.updateImageStatus(jobId, "1.jpg", "completed", "cap 1jpg");
    store.updateImageStatus(jobId, "2.png", "completed", "cap 2png");
    store.updateImageStatus(jobId, "2.jpg", "completed", "cap 2jpg");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    // Group "1": first keeps name, second gets (1)
    expect(entries).toContain("1.png");
    expect(entries).toContain("1.txt");
    expect(entries).toContain("1 (1).jpg");
    expect(entries).toContain("1 (1).txt");

    // Group "2": first keeps name, second gets (1) — independent from group "1"
    expect(entries).toContain("2.png");
    expect(entries).toContain("2.txt");
    expect(entries).toContain("2 (1).jpg");
    expect(entries).toContain("2 (1).txt");

    // Exactly 8 entries (4 images + 4 captions)
    expect(entries).toHaveLength(8);
  });

  it("four-way basename collision — all but first suffixed", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "x.png", data: Buffer.from("a") },
        { name: "x.jpg", data: Buffer.from("b") },
        { name: "x.webp", data: Buffer.from("c") },
        { name: "x.gif", data: Buffer.from("d") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    store.updateImageStatus(jobId, "x.png", "completed", "cap png");
    store.updateImageStatus(jobId, "x.jpg", "completed", "cap jpg");
    store.updateImageStatus(jobId, "x.webp", "completed", "cap webp");
    store.updateImageStatus(jobId, "x.gif", "completed", "cap gif");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    expect(entries).toContain("x.png");
    expect(entries).toContain("x.txt");
    expect(entries).toContain("x (1).jpg");
    expect(entries).toContain("x (1).txt");
    expect(entries).toContain("x (2).webp");
    expect(entries).toContain("x (2).txt");
    expect(entries).toContain("x (3).gif");
    expect(entries).toContain("x (3).txt");
    expect(entries).toHaveLength(8);
  });

  it("mixed unique and collision entries — only collisions get suffixed", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "unique-a.png", data: Buffer.from("a") },
        { name: "shared.png", data: Buffer.from("b") },
        { name: "shared.jpg", data: Buffer.from("c") },
        { name: "unique-b.bmp", data: Buffer.from("d") },
        { name: "shared.webp", data: Buffer.from("e") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    store.updateImageStatus(jobId, "unique-a.png", "completed", "cap ua");
    store.updateImageStatus(jobId, "shared.png", "completed", "cap sp");
    store.updateImageStatus(jobId, "shared.jpg", "completed", "cap sj");
    store.updateImageStatus(jobId, "unique-b.bmp", "completed", "cap ub");
    store.updateImageStatus(jobId, "shared.webp", "completed", "cap sw");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    // Unique files keep their names
    expect(entries).toContain("unique-a.png");
    expect(entries).toContain("unique-a.txt");
    expect(entries).toContain("unique-b.bmp");
    expect(entries).toContain("unique-b.txt");

    // Collision group "shared": first keeps name, rest suffixed
    expect(entries).toContain("shared.png");
    expect(entries).toContain("shared.txt");
    expect(entries).toContain("shared (1).jpg");
    expect(entries).toContain("shared (1).txt");
    expect(entries).toContain("shared (2).webp");
    expect(entries).toContain("shared (2).txt");
    expect(entries).toHaveLength(10);
  });

  it("five-way collision — suffixes reach (4)", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "img.png", data: Buffer.from("a") },
        { name: "img.jpg", data: Buffer.from("b") },
        { name: "img.webp", data: Buffer.from("c") },
        { name: "img.gif", data: Buffer.from("d") },
        { name: "img.bmp", data: Buffer.from("e") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    for (const [name, cap] of Object.entries({
      "img.png": "a", "img.jpg": "b", "img.webp": "c",
      "img.gif": "d", "img.bmp": "e",
    })) {
      store.updateImageStatus(jobId, name, "completed", `cap ${cap}`);
    }

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    expect(entries).toContain("img.png");
    expect(entries).toContain("img.txt");
    expect(entries).toContain("img (1).jpg");
    expect(entries).toContain("img (1).txt");
    expect(entries).toContain("img (2).webp");
    expect(entries).toContain("img (2).txt");
    expect(entries).toContain("img (3).gif");
    expect(entries).toContain("img (3).txt");
    expect(entries).toContain("img (4).bmp");
    expect(entries).toContain("img (4).txt");
    expect(entries).toHaveLength(10);
  });

  it("six elements — three collision groups of two", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a1") },
        { name: "a.jpg", data: Buffer.from("a2") },
        { name: "b.png", data: Buffer.from("b1") },
        { name: "b.jpg", data: Buffer.from("b2") },
        { name: "c.png", data: Buffer.from("c1") },
        { name: "c.jpg", data: Buffer.from("c2") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    for (const name of ["a.png", "a.jpg", "b.png", "b.jpg", "c.png", "c.jpg"]) {
      store.updateImageStatus(jobId, name, "completed", `cap ${name}`);
    }

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    // Each group: first original, second suffixed (1)
    expect(entries).toContain("a.png");
    expect(entries).toContain("a.txt");
    expect(entries).toContain("a (1).jpg");
    expect(entries).toContain("a (1).txt");

    expect(entries).toContain("b.png");
    expect(entries).toContain("b.txt");
    expect(entries).toContain("b (1).jpg");
    expect(entries).toContain("b (1).txt");

    expect(entries).toContain("c.png");
    expect(entries).toContain("c.txt");
    expect(entries).toContain("c (1).jpg");
    expect(entries).toContain("c (1).txt");

    expect(entries).toHaveLength(12);
  });

  it("seven elements — one group of 4 + one group of 3", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "alpha.png", data: Buffer.from("a") },
        { name: "alpha.jpg", data: Buffer.from("b") },
        { name: "alpha.webp", data: Buffer.from("c") },
        { name: "alpha.gif", data: Buffer.from("d") },
        { name: "beta.png", data: Buffer.from("e") },
        { name: "beta.jpg", data: Buffer.from("f") },
        { name: "beta.webp", data: Buffer.from("g") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    for (const name of [
      "alpha.png", "alpha.jpg", "alpha.webp", "alpha.gif",
      "beta.png", "beta.jpg", "beta.webp",
    ]) {
      store.updateImageStatus(jobId, name, "completed", `cap ${name}`);
    }

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    // alpha: 4-way
    expect(entries).toContain("alpha.png");
    expect(entries).toContain("alpha.txt");
    expect(entries).toContain("alpha (1).jpg");
    expect(entries).toContain("alpha (1).txt");
    expect(entries).toContain("alpha (2).webp");
    expect(entries).toContain("alpha (2).txt");
    expect(entries).toContain("alpha (3).gif");
    expect(entries).toContain("alpha (3).txt");

    // beta: 3-way
    expect(entries).toContain("beta.png");
    expect(entries).toContain("beta.txt");
    expect(entries).toContain("beta (1).jpg");
    expect(entries).toContain("beta (1).txt");
    expect(entries).toContain("beta (2).webp");
    expect(entries).toContain("beta (2).txt");

    expect(entries).toHaveLength(14);
  });

  it("eight-way collision — all suffixes through (7)", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "d.png", data: Buffer.from("a") },
        { name: "d.jpg", data: Buffer.from("b") },
        { name: "d.webp", data: Buffer.from("c") },
        { name: "d.gif", data: Buffer.from("d") },
        { name: "d.bmp", data: Buffer.from("e") },
        { name: "d.tiff", data: Buffer.from("f") },
        { name: "d.svg", data: Buffer.from("g") },
        { name: "d.ico", data: Buffer.from("h") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    for (const name of [
      "d.png", "d.jpg", "d.webp", "d.gif",
      "d.bmp", "d.tiff", "d.svg", "d.ico",
    ]) {
      store.updateImageStatus(jobId, name, "completed", `cap ${name}`);
    }

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    const expected = [
      "d.png", "d.txt",
      "d (1).jpg", "d (1).txt",
      "d (2).webp", "d (2).txt",
      "d (3).gif", "d (3).txt",
      "d (4).bmp", "d (4).txt",
      "d (5).tiff", "d (5).txt",
      "d (6).svg", "d (6).txt",
      "d (7).ico", "d (7).txt",
    ];
    for (const entry of expected) {
      expect(entries).toContain(entry);
    }
    expect(entries).toHaveLength(16);
  });

  it("collision with dots in base name — suffix inserted before extension only", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "my.photo.png", data: Buffer.from("a") },
        { name: "my.photo.jpg", data: Buffer.from("b") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    store.updateImageStatus(jobId, "my.photo.png", "completed", "cap png");
    store.updateImageStatus(jobId, "my.photo.jpg", "completed", "cap jpg");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    expect(entries).toContain("my.photo.png");
    expect(entries).toContain("my.photo.txt");
    expect(entries).toContain("my.photo (1).jpg");
    expect(entries).toContain("my.photo (1).txt");
    expect(entries).toHaveLength(4);
  });

  it("every image-caption pair shares the same base name in the ZIP", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "a.png", data: Buffer.from("a") },
        { name: "a.jpg", data: Buffer.from("b") },
        { name: "a.webp", data: Buffer.from("c") },
        { name: "b.png", data: Buffer.from("d") },
        { name: "b.jpg", data: Buffer.from("e") },
        { name: "c.png", data: Buffer.from("f") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    for (const name of ["a.png", "a.jpg", "a.webp", "b.png", "b.jpg", "c.png"]) {
      store.updateImageStatus(jobId, name, "completed", `cap ${name}`);
    }

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    // For every .txt entry, there must be an image with the same base
    const captions = entries.filter((e) => e.endsWith(".txt"));
    const images = entries.filter((e) => !e.endsWith(".txt"));

    for (const caption of captions) {
      const base = caption.replace(/\.txt$/, "");
      // At least one image should share this base
      const matched = images.find((img) => {
        const imgBase = img.replace(/\.[^.]+$/, "");
        return imgBase === base;
      });
      expect(matched).toBeDefined();
    }
  });

  it("no duplicate entries in the ZIP after collision resolution", async () => {
    const store = await import("@/lib/store");

    const jobId = store.createJob(
      [
        { name: "x.png", data: Buffer.from("a") },
        { name: "x.jpg", data: Buffer.from("b") },
        { name: "x.webp", data: Buffer.from("c") },
        { name: "x.gif", data: Buffer.from("d") },
        { name: "y.png", data: Buffer.from("e") },
        { name: "y.jpg", data: Buffer.from("f") },
      ],
      "http://localhost:8080",
      "llama3",
      "", "", "describe", "", false, 1
    );

    for (const name of ["x.png", "x.jpg", "x.webp", "x.gif", "y.png", "y.jpg"]) {
      store.updateImageStatus(jobId, name, "completed", `cap ${name}`);
    }

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
    );
    expect(res.status).toBe(200);

    const entries = extractZipEntries(Buffer.from(await res.arrayBuffer()));

    // Every entry must be unique
    const unique = new Set(entries);
    expect(unique.size).toBe(entries.length);
    expect(entries).toHaveLength(12);
  });

  // -----------------------------------------------------------------------
  // Other edge cases
  // -----------------------------------------------------------------------

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
