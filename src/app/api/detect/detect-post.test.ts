/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Concurrency test — verify parallelRequests is respected
// ---------------------------------------------------------------------------

describe("detection concurrency", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DETECTION_CONCURRENCY constant is hardcoded to 3 (should use config instead)", async () => {
    // This test documents the current bug: DETECTION_CONCURRENCY is hardcoded
    // to 3, ignoring the user's parallelRequests setting.
    const constants = await import("@/components/CaptionStudioCropConstants");
    expect(constants.DETECTION_CONCURRENCY).toBe(3);
  });

  it("worker pool launches correct number of parallel workers based on parallelRequests", async () => {
    // Mock prepareForDetection to avoid sharp (native module) in jsdom
    vi.doMock("@/lib/image-utils", () => ({
      prepareForDetection: async (buf: Buffer) => ({
        buffer: buf,
        mimeType: "image/jpeg",
      }),
    }));

    // Track concurrent in-flight requests
    let maxConcurrency = 0;
    let currentConcurrency = 0;
    const resolutionPromises: Array<() => void> = [];

    // Mock fetch that pauses until manually resolved
    const fetchMock = vi.fn().mockImplementation(async () => {
      currentConcurrency++;
      if (currentConcurrency > maxConcurrency) {
        maxConcurrency = currentConcurrency;
      }

      // Pause until test resolves
      await new Promise<void>((resolve) => {
        resolutionPromises.push(resolve);
      });

      currentConcurrency--;

      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                faces: [{ bbox_2d: [100, 100, 400, 400], label: "face", confidence: 0.9 }],
                bodies: [{ bbox_2d: [50, 50, 950, 900], label: "body", confidence: 0.3 }],
              }),
            },
          }],
        }),
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    // Import route AFTER mocking
    const { POST } = await import("./route");

    // Create 8 images — enough to measure concurrency with parallelRequests=4
    const imageFiles: File[] = [];
    for (let i = 0; i < 8; i++) {
      const buf = new TextEncoder().encode(`test-content-${i}`);
      imageFiles.push(new File([buf], `img${i}.png`, { type: "image/png" }));
    }

    // Build FormData
    const formData = new FormData();
    formData.append("config", JSON.stringify({
      serverUrl: "http://localhost:8080",
      model: "gpt-4o",
      contentMode: "sfw",
      parallelRequests: 4,
    }));
    for (const file of imageFiles) {
      formData.append("images", file);
    }

    // Create mock request
    const mockRequest = {
      formData: async () => formData,
      signal: {
        aborted: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      },
    };

    // POST returns immediately (fire and forget)
    const res = await POST(mockRequest as any);
    const data = await res.json();
    expect(data.jobId).toBeDefined();

    // Give workers time to start (they'll be paused by our mock)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // With the bug (DETECTION_CONCURRENCY = 3), maxConcurrency would be 3
    // With the fix (parallelRequests = 4), maxConcurrency should be 4
    expect(maxConcurrency).toBe(4);

    // Release all paused fetch calls
    for (const resolve of resolutionPromises) {
      resolve();
    }

    // Wait for processing to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });
});
