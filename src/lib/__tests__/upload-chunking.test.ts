import { describe, it, expect } from "bun:test";
import {
  UPLOAD_CHUNK_SIZE,
  planChunkedUpload,
  buildChunkFormData,
  buildSingleShotFormData,
} from "@/lib/upload-chunking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFiles(count: number): File[] {
  return Array.from({ length: count }, (_, i) =>
    new File([new TextEncoder().encode(`img${i}`)], `img${i}.jpg`, { type: "image/jpeg" })
  );
}

function configOf(fd: FormData): Record<string, unknown> {
  return JSON.parse(fd.get("config") as string);
}

function namesOf(fd: FormData): string[] {
  return JSON.parse(fd.get("imageNames") as string) as string[];
}

// ---------------------------------------------------------------------------
// planChunkedUpload
// ---------------------------------------------------------------------------

describe("planChunkedUpload", () => {
  it("uses a single shot at or below the chunk size", () => {
    expect(planChunkedUpload(1)).toEqual({ isChunked: false, chunks: 1, chunkSize: UPLOAD_CHUNK_SIZE });
    expect(planChunkedUpload(UPLOAD_CHUNK_SIZE)).toEqual({ isChunked: false, chunks: 1, chunkSize: UPLOAD_CHUNK_SIZE });
  });

  it("splits large batches into fixed-size chunks", () => {
    expect(planChunkedUpload(UPLOAD_CHUNK_SIZE + 1)).toEqual({ isChunked: true, chunks: 2, chunkSize: UPLOAD_CHUNK_SIZE });
    expect(planChunkedUpload(700)).toEqual({ isChunked: true, chunks: 28, chunkSize: UPLOAD_CHUNK_SIZE });
  });
});

// ---------------------------------------------------------------------------
// buildChunkFormData
// ---------------------------------------------------------------------------

describe("buildChunkFormData", () => {
  const base = {
    sessionId: "11111111-2222-4333-8444-555555555555",
    expectedImageCount: 3,
    chunkSize: 2,
    baseConfig: { serverUrl: "http://localhost:8080", model: "m" },
    imageFiles: makeFiles(3),
    imageNames: ["a.jpg", "b.jpg", "c.jpg"],
  };

  it("chunk 0 carries the first images with their global names", () => {
    const fd = buildChunkFormData({ ...base, chunkIndex: 0, captionTexts: ["", "", ""] });
    expect(fd.getAll("images").length).toBe(2);
    expect(namesOf(fd)).toEqual(["a.jpg", "b.jpg"]);
    const config = configOf(fd);
    expect(config.sessionId).toBe(base.sessionId);
    expect(config.expectedImageCount).toBe(3);
    expect(config.chunkIndex).toBe(0);
    expect(config.chunkSize).toBe(2);
    expect(config.serverUrl).toBe("http://localhost:8080");
    expect(config.model).toBe("m");
    // Empty captions still get a (blank) part so captions stay 1:1 with images
    expect(fd.getAll("captions").length).toBe(2);
  });

  it("the last chunk carries only the remaining images", () => {
    const fd = buildChunkFormData({ ...base, chunkIndex: 1, captionTexts: ["", "", ""] });
    expect(fd.getAll("images").length).toBe(1);
    expect(namesOf(fd)).toEqual(["c.jpg"]);
    expect(configOf(fd).chunkIndex).toBe(1);
  });

  it("pairs captions with the chunk's images only", async () => {
    const fd = buildChunkFormData({
      ...base,
      chunkIndex: 1,
      captionTexts: ["1girl", "1boy", "2girls"],
    });
    const captions = fd.getAll("captions") as Blob[];
    expect(captions.length).toBe(1);
    expect((captions[0] as File).name).toBe("c.jpg.txt");
    expect(await captions[0].text()).toBe("2girls");
  });

  it("sends a (possibly empty) caption part per image so indexes stay aligned", async () => {
    const fd = buildChunkFormData({
      ...base,
      chunkIndex: 0,
      captionTexts: ["1girl", "", ""],
    });
    const images = fd.getAll("images") as File[];
    const captions = fd.getAll("captions") as File[];
    expect(images.length).toBe(2);
    expect(captions.length).toBe(2);
    expect(captions[0].name).toBe("a.jpg.txt");
    expect(await captions[0].text()).toBe("1girl");
    expect(captions[1].name).toBe("b.jpg.txt");
    expect(await captions[1].text()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildSingleShotFormData
// ---------------------------------------------------------------------------

describe("buildSingleShotFormData", () => {
  const config = { serverUrl: "http://localhost:8080", model: "m" };
  const imageFiles = makeFiles(3);
  const imageNames = imageFiles.map((f) => f.name);

  it("sends one image part per image, aligned with imageNames", () => {
    const fd = buildSingleShotFormData({
      config,
      imageFiles,
      imageNames,
      captionTexts: ["", "", ""],
    });
    const images = fd.getAll("images") as File[];
    expect(images.length).toBe(3);
    expect(images.map((f) => f.name)).toEqual(imageNames);
    expect(namesOf(fd)).toEqual(imageNames);
    // No chunk fields in the config - the server treats this as single-shot
    const parsed = configOf(fd);
    expect(parsed.sessionId).toBeUndefined();
    expect(parsed.expectedImageCount).toBeUndefined();
    expect(parsed.chunkIndex).toBeUndefined();
    expect(parsed.serverUrl).toBe("http://localhost:8080");
    expect(parsed.model).toBe("m");
  });

  it("sends a (possibly empty) caption part per image so indexes stay aligned", async () => {
    const fd = buildSingleShotFormData({
      config,
      imageFiles,
      imageNames,
      captionTexts: ["1girl", "", "2girls"],
    });
    const captions = fd.getAll("captions") as File[];
    expect(captions.length).toBe(3);
    expect(captions[0].name).toBe("img0.jpg.txt");
    expect(await captions[0].text()).toBe("1girl");
    expect(await captions[1].text()).toBe("");
    expect(captions[2].name).toBe("img2.jpg.txt");
    expect(await captions[2].text()).toBe("2girls");
  });
});
