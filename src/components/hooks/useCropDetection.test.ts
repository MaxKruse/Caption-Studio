import { describe, it, expect } from "vitest";
import type { BoundingBox } from "../CaptionStudioCropTypes";
import {
  allocateCropTypes,
  computeBoxQuality,
  buildCropRectFromBox,
  buildCropRectFromBestBox,
  buildDefaultCrop,
} from "@/lib/crop-allocation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBox(confidence: number): BoundingBox {
  return {
    bbox_2d: [100, 100, 400, 400] as [number, number, number, number],
    label: "face",
    confidence,
  };
}

function makeDetection(faceConf: number, bodyConf: number) {
  return {
    faceBoxes: faceConf > 0 ? [makeBox(faceConf)] : [],
    bodyBoxes: bodyConf > 0 ? [{ ...makeBox(bodyConf), label: "body" }] : [],
  };
}

function makeDetections(pairs: Array<[number, number]>) {
  return pairs.map(([f, b]) => makeDetection(f, b));
}

// ---------------------------------------------------------------------------
// computeBoxQuality
// ---------------------------------------------------------------------------

describe("computeBoxQuality", () => {
  it("returns 0 for empty array", () => {
    expect(computeBoxQuality([])).toBe(0);
  });

  it("returns highest confidence", () => {
    const boxes = [
      { ...makeBox(0.3), label: "face" },
      { ...makeBox(0.9), label: "face" },
      { ...makeBox(0.5), label: "face" },
    ];
    expect(computeBoxQuality(boxes)).toBe(0.9);
  });

  it("returns single box confidence", () => {
    expect(computeBoxQuality([makeBox(0.72)])).toBe(0.72);
  });
});

// ---------------------------------------------------------------------------
// allocateCropTypes — SFW scenarios
// ---------------------------------------------------------------------------

describe("allocateCropTypes — SFW", () => {
  it("50/50 split: assigns face to highest-face-confidence images", () => {
    // SFW: all faces score high (0.70-1.00), all bodies low (0.10-0.45)
    const detections = makeDetections([
      [0.95, 0.30], // img 0 — striking face
      [0.80, 0.20], // img 1 — normal face
      [0.75, 0.40], // img 2 — face + nice outfit
      [0.70, 0.15], // img 3 — face, generic body
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // portraitCount = round(4 * 0.5) = 2
    // Preferences: +0.65, +0.60, +0.35, +0.55
    // Sorted by preference desc: img0(+0.65), img1(+0.60), img3(+0.55), img2(+0.35)
    // Top 2 → face, rest → body
    expect(result).toEqual(["face", "face", "body", "body"]);
  });

  it("80/20 split: most images get face crops", () => {
    const detections = makeDetections([
      [0.95, 0.30], // img 0
      [0.85, 0.25], // img 1
      [0.80, 0.20], // img 2
      [0.75, 0.35], // img 3
    ]);

    const result = allocateCropTypes(detections, 0.8);

    // portraitCount = round(4 * 0.8) = 3
    // Preferences: +0.65, +0.60, +0.60, +0.40
    // Sorted: img0, img1, img2, img3
    // Top 3 → face
    expect(result).toEqual(["face", "face", "face", "body"]);
  });

  it("20/80 split: only the most face-dominant image gets face crop", () => {
    const detections = makeDetections([
      [0.95, 0.30], // img 0 — biggest face advantage
      [0.80, 0.20], // img 1
      [0.75, 0.40], // img 2 — smallest face advantage
      [0.70, 0.15], // img 3
    ]);

    const result = allocateCropTypes(detections, 0.2);

    // portraitCount = round(4 * 0.2) = 1
    // Preferences: +0.65, +0.60, +0.35, +0.55
    // Sorted: img0(+0.65), img1(+0.60), img3(+0.55), img2(+0.35)
    // Top 1 → face
    expect(result).toEqual(["face", "body", "body", "body"]);
  });

  it("6 images 50/50: picks top 3 by face preference", () => {
    const detections = makeDetections([
      [0.98, 0.20], // img 0 — preference +0.78
      [0.90, 0.35], // img 1 — preference +0.55
      [0.85, 0.30], // img 2 — preference +0.55 (tied with img1)
      [0.80, 0.25], // img 3 — preference +0.55 (tied)
      [0.75, 0.40], // img 4 — preference +0.35
      [0.70, 0.15], // img 5 — preference +0.55 (tied)
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // portraitCount = round(6 * 0.5) = 3
    // img0 wins outright (+0.78)
    // img1, img2, img3, img5 all tied at +0.55 — stable sort keeps original order
    // Top 3: img0, img1, img2
    expect(result).toEqual(["face", "face", "face", "body", "body", "body"]);
  });

  it("edge case: all SFW images get body crops when 0/100 split", () => {
    const detections = makeDetections([
      [0.95, 0.30],
      [0.90, 0.25],
      [0.85, 0.20],
    ]);

    const result = allocateCropTypes(detections, 0);

    // portraitCount = 0 — all body
    expect(result).toEqual(["body", "body", "body"]);
  });

  it("edge case: all SFW images get face crops when 100/0 split", () => {
    const detections = makeDetections([
      [0.95, 0.30],
      [0.90, 0.25],
      [0.85, 0.20],
    ]);

    const result = allocateCropTypes(detections, 1.0);

    // portraitCount = 3 — all face
    expect(result).toEqual(["face", "face", "face"]);
  });
});

// ---------------------------------------------------------------------------
// allocateCropTypes — NSFW scenarios
// ---------------------------------------------------------------------------

describe("allocateCropTypes — NSFW", () => {
  it("50/50 split: assigns body to highest-body-confidence images", () => {
    // NSFW: bodies score high (0.70-1.00), faces low (0.10-0.55)
    const detections = makeDetections([
      [0.50, 0.95], // img 0 — seductive face + provocative body
      [0.30, 0.90], // img 1 — normal face + great body
      [0.25, 0.85], // img 2 — small face + good body
      [0.20, 0.95], // img 3 — tiny face + provocative body
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // portraitCount = round(4 * 0.5) = 2
    // Preferences: -0.45, -0.60, -0.60, -0.75
    // Sorted desc: img0(-0.45), img1(-0.60), img2(-0.60), img3(-0.75)
    // Top 2 → face (least body-dominant)
    expect(result).toEqual(["face", "face", "body", "body"]);
  });

  it("face crops go to images with most striking expressions", () => {
    // The image with tongue-out (0.50 face) should get face crop over plain face (0.20)
    const detections = makeDetections([
      [0.50, 0.90], // img 0 — tongue out, seductive
      [0.35, 0.88], // img 1 — smiling
      [0.25, 0.92], // img 2 — neutral face
      [0.15, 0.95], // img 3 — face barely visible
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // Preferences: -0.40, -0.53, -0.67, -0.80
    // Sorted: img0(-0.40), img1(-0.53), img2(-0.67), img3(-0.80)
    // Top 2 → face: img0 (tongue out) and img1 (smiling)
    expect(result).toEqual(["face", "face", "body", "body"]);
  });

  it("80/20 split: mostly face crops even for NSFW", () => {
    const detections = makeDetections([
      [0.50, 0.95], // img 0
      [0.40, 0.90], // img 1
      [0.30, 0.85], // img 2
      [0.20, 0.80], // img 3
    ]);

    const result = allocateCropTypes(detections, 0.8);

    // portraitCount = round(4 * 0.8) = 3
    // Preferences: -0.45, -0.50, -0.55, -0.60
    // Top 3 → face
    expect(result).toEqual(["face", "face", "face", "body"]);
  });

  it("20/80 split: only most face-positive image gets face crop", () => {
    const detections = makeDetections([
      [0.50, 0.90], // img 0 — biggest face advantage (-0.40)
      [0.30, 0.90], // img 1 — (-0.60)
      [0.25, 0.85], // img 2 — (-0.60)
      [0.15, 0.95], // img 3 — (-0.80)
    ]);

    const result = allocateCropTypes(detections, 0.2);

    // portraitCount = round(4 * 0.2) = 1
    // img0 wins with least-negative preference
    expect(result).toEqual(["face", "body", "body", "body"]);
  });
});

// ---------------------------------------------------------------------------
// allocateCropTypes — edge cases
// ---------------------------------------------------------------------------

describe("allocateCropTypes — edge cases", () => {
  it("handles single image with face crop", () => {
    const detections = makeDetections([[0.85, 0.30]]);
    const result = allocateCropTypes(detections, 0.5);
    // portraitCount = round(1 * 0.5) = 1
    expect(result).toEqual(["face"]);
  });

  it("handles single image with body crop", () => {
    const detections = makeDetections([[0.85, 0.30]]);
    const result = allocateCropTypes(detections, 0);
    // portraitCount = 0
    expect(result).toEqual(["body"]);
  });

  it("handles empty face boxes (confidence = 0)", () => {
    const detections = [
      makeDetection(0, 0.80), // no face detected
      makeDetection(0.90, 0.30),
    ];

    const result = allocateCropTypes(detections, 0.5);

    // Preferences: -0.80, +0.60
    // img1 gets face, img0 gets body
    expect(result).toEqual(["body", "face"]);
  });

  it("handles empty body boxes (confidence = 0)", () => {
    const detections = [
      makeDetection(0.85, 0), // no body detected
      makeDetection(0.75, 0.30),
    ];

    const result = allocateCropTypes(detections, 0.5);

    // Preferences: +0.85, +0.45
    // img0 gets face (biggest preference), img1 gets body
    expect(result).toEqual(["face", "body"]);
  });

  it("handles both categories empty", () => {
    const detections = [
      makeDetection(0, 0), // nothing detected
      makeDetection(0.80, 0.30),
    ];

    const result = allocateCropTypes(detections, 0.5);

    // Preferences: 0, +0.50
    // img1 gets face, img0 gets body
    expect(result).toEqual(["body", "face"]);
  });

  it("preserves original index ordering in output", () => {
    const detections = makeDetections([
      [0.70, 0.30], // img 0 — preference +0.40
      [0.95, 0.20], // img 1 — preference +0.75
      [0.80, 0.25], // img 2 — preference +0.55
    ]);

    const result = allocateCropTypes(detections, 0.33);

    // portraitCount = round(3 * 0.33) = 1
    // img1 wins (+0.75)
    expect(result).toEqual(["body", "face", "body"]);
  });

  it("handles tied preferences with stable sort", () => {
    const detections = makeDetections([
      [0.85, 0.35], // img 0 — preference +0.50
      [0.85, 0.35], // img 1 — preference +0.50 (tied)
      [0.85, 0.35], // img 2 — preference +0.50 (tied)
      [0.70, 0.30], // img 3 — preference +0.40
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // portraitCount = 2
    // All tied at +0.50 except img3. Stable sort keeps 0,1,2 order.
    // Top 2: img0, img1
    expect(result).toEqual(["face", "face", "body", "body"]);
  });

  it("handles large dataset (20 images) with 50/50 split", () => {
    const pairs: Array<[number, number]> = [
      [0.95, 0.30], [0.90, 0.25], [0.88, 0.35], [0.85, 0.20],
      [0.82, 0.40], [0.80, 0.30], [0.78, 0.35], [0.75, 0.25],
      [0.73, 0.40], [0.72, 0.30], [0.71, 0.35], [0.70, 0.20],
      [0.70, 0.40], [0.68, 0.30], [0.65, 0.35], [0.60, 0.25],
      [0.55, 0.30], [0.50, 0.35], [0.45, 0.40], [0.40, 0.20],
    ];

    const detections = makeDetections(pairs);
    const result = allocateCropTypes(detections, 0.5);

    const faceCount = result.filter((r) => r === "face").length;
    const bodyCount = result.filter((r) => r === "body").length;

    expect(faceCount).toBe(10);
    expect(bodyCount).toBe(10);

    // Verify: images assigned "face" should have higher preference than "body" images
    const preferences = pairs.map(([f, b]) => f - b);
    const facePrefs = result.map((r, i) => r === "face" ? preferences[i] : -1).filter((p) => p >= 0);
    const bodyPrefs = result.map((r, i) => r === "body" ? preferences[i] : -1).filter((p) => p >= 0);

    if (facePrefs.length > 0 && bodyPrefs.length > 0) {
      expect(Math.min(...facePrefs)).toBeGreaterThanOrEqual(Math.max(...bodyPrefs));
    }
  });

  it("odd number of images rounds portrait count correctly", () => {
    const detections = makeDetections([
      [0.90, 0.30], // img 0
      [0.85, 0.25], // img 1
      [0.80, 0.20], // img 2
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // portraitCount = round(3 * 0.5) = 2 (rounds up from 1.5)
    expect(result.filter((r) => r === "face").length).toBe(2);
    expect(result.filter((r) => r === "body").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// allocateCropTypes — cross-mode (mixed confidence) scenarios
// ---------------------------------------------------------------------------

describe("allocateCropTypes — mixed confidence", () => {
  it("handles images where face and body have equal confidence", () => {
    const detections = makeDetections([
      [0.70, 0.70], // img 0 — preference 0.00
      [0.80, 0.30], // img 1 — preference +0.50
      [0.30, 0.80], // img 2 — preference -0.50
    ]);

    const result = allocateCropTypes(detections, 0.33);

    // portraitCount = 1
    // img1 wins (+0.50)
    expect(result).toEqual(["body", "face", "body"]);
  });

  it("handles borderline NSFW image (face nearly as high as body)", () => {
    // This simulates an image that's NSFW but has a very striking face
    const detections = makeDetections([
      [0.55, 0.70], // img 0 — face almost as important as body
      [0.20, 0.90], // img 1 — clearly body-dominant
      [0.15, 0.85], // img 2 — clearly body-dominant
      [0.30, 0.75], // img 3 — body-dominant but face visible
    ]);

    const result = allocateCropTypes(detections, 0.5);

    // Preferences: -0.15, -0.70, -0.70, -0.45
    // Sorted: img0(-0.15), img3(-0.45), img1(-0.70), img2(-0.70)
    // Top 2 → face: img0 (striking face) and img3 (visible face)
    expect(result).toEqual(["face", "body", "body", "face"]);
  });
});

// ---------------------------------------------------------------------------
// buildDefaultCrop
// ---------------------------------------------------------------------------

describe("buildDefaultCrop", () => {
  it("returns a crop with 20px margin on all sides", () => {
    const result = buildDefaultCrop();
    expect(result).toEqual({
      x: 20,
      y: 20,
      width: 960,
      height: 960,
    });
  });

  it("crop fits within 1000x1000 canvas", () => {
    const result = buildDefaultCrop();
    expect(result.x + result.width).toBeLessThanOrEqual(1000);
    expect(result.y + result.height).toBeLessThanOrEqual(1000);
  });

  it("crop has positive dimensions", () => {
    const result = buildDefaultCrop();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("returns consistent result on repeated calls", () => {
    const a = buildDefaultCrop();
    const b = buildDefaultCrop();
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// buildCropRectFromBox
// ---------------------------------------------------------------------------

describe("buildCropRectFromBox", () => {
  it("creates crop rect from box with zero padding", () => {
    const box: BoundingBox = {
      bbox_2d: [100, 200, 400, 500] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0);
    // box: x=100, y=200, w=300, h=300
    expect(result).toEqual({ x: 100, y: 200, width: 300, height: 300 });
  });

  it("applies 25% padding for face crops", () => {
    const box: BoundingBox = {
      bbox_2d: [100, 200, 400, 500] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=100, y=200, w=300, h=300
    // paddingW = 300 * 0.25 = 75, paddingH = 300 * 0.25 = 75
    // cropX = 100 - 75 = 25, cropY = 200 - 75 = 125
    // cropWidth = 300 + 75*2 = 450, cropHeight = 300 + 75*2 = 450
    expect(result).toEqual({ x: 25, y: 125, width: 450, height: 450 });
  });

  it("clamps crop to 0 when padding extends beyond left edge", () => {
    const box: BoundingBox = {
      bbox_2d: [10, 200, 110, 500] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=10, y=200, w=100, h=300
    // paddingW = 100 * 0.25 = 25
    // cropX = 10 - 25 = -15 → clamped to 0, cropWidth += -15 → 100+50-15 = 135
    expect(result.x).toBe(0);
    expect(result.width).toBe(135);
  });

  it("clamps crop to 0 when padding extends beyond top edge", () => {
    const box: BoundingBox = {
      bbox_2d: [200, 10, 500, 110] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=200, y=10, w=300, h=100
    // paddingH = 100 * 0.25 = 25
    // cropY = 10 - 25 = -15 → clamped to 0, cropHeight += -15 → 100+50-15 = 135
    expect(result.y).toBe(0);
    expect(result.height).toBe(135);
  });

  it("clamps crop width when padding extends beyond right edge (1000)", () => {
    const box: BoundingBox = {
      bbox_2d: [800, 200, 990, 500] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=800, y=200, w=190, h=300
    // paddingW = 190 * 0.25 = 47.5
    // cropX = 800 - 47.5 = 752.5
    // cropWidth = 190 + 95 = 285
    // cropX + cropWidth = 752.5 + 285 = 1037.5 > 1000 → cropWidth = 1000 - 752.5 = 247.5
    expect(result.x + result.width).toBeLessThanOrEqual(1000);
  });

  it("clamps crop height when padding extends beyond bottom edge (1000)", () => {
    const box: BoundingBox = {
      bbox_2d: [200, 800, 500, 990] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    expect(result.y + result.height).toBeLessThanOrEqual(1000);
  });

  it("handles box at origin (0,0)", () => {
    const box: BoundingBox = {
      bbox_2d: [0, 0, 100, 100] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=0, y=0, w=100, h=100
    // paddingW = 100 * 0.25 = 25
    // cropX = 0 - 25 = -25 → clamped to 0, cropWidth += -25 → 150 + (-25) = 125
    // cropY = 0 - 25 = -25 → clamped to 0, cropHeight += -25 → 150 + (-25) = 125
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(125);
    expect(result.height).toBe(125);
  });

  it("handles box at far corner (near 1000)", () => {
    const box: BoundingBox = {
      bbox_2d: [900, 900, 1000, 1000] as [number, number, number, number],
      label: "face",
      confidence: 0.85,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=900, y=900, w=100, h=100
    // paddingW = 25
    // cropX = 900 - 25 = 875
    // cropWidth = 100 + 50 = 150
    // cropX + cropWidth = 875 + 150 = 1025 > 1000 → cropWidth = 1000 - 875 = 125
    expect(result.x).toBe(875);
    expect(result.width).toBe(125);
    expect(result.y).toBe(875);
    expect(result.height).toBe(125);
  });

  it("handles full-image box with zero padding", () => {
    const box: BoundingBox = {
      bbox_2d: [0, 0, 1000, 1000] as [number, number, number, number],
      label: "body",
      confidence: 0.5,
    };
    const result = buildCropRectFromBox(box, 0);
    expect(result).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it("handles tiny box with large padding", () => {
    const box: BoundingBox = {
      bbox_2d: [495, 495, 505, 505] as [number, number, number, number],
      label: "face",
      confidence: 0.9,
    };
    const result = buildCropRectFromBox(box, 0.25);
    // box: x=495, y=495, w=10, h=10
    // paddingW = 10 * 0.25 = 2.5
    // cropX = 495 - 2.5 = 492.5
    // cropWidth = 10 + 5 = 15
    expect(result.x).toBeCloseTo(492.5);
    expect(result.width).toBeCloseTo(15);
  });
});

// ---------------------------------------------------------------------------
// buildCropRectFromBestBox
// ---------------------------------------------------------------------------

describe("buildCropRectFromBestBox", () => {
  it("returns null for empty array", () => {
    expect(buildCropRectFromBestBox([], 0.25)).toBeNull();
  });

  it("selects the largest box by area", () => {
    const boxes: BoundingBox[] = [
      { bbox_2d: [100, 100, 200, 200] as [number, number, number, number], label: "face", confidence: 0.9 }, // area = 10000
      { bbox_2d: [300, 300, 600, 600] as [number, number, number, number], label: "face", confidence: 0.5 }, // area = 90000
    ];
    const result = buildCropRectFromBestBox(boxes, 0);
    // Should pick the second box (larger area)
    expect(result).toEqual({ x: 300, y: 300, width: 300, height: 300 });
  });

  it("selects the box with largest area regardless of confidence", () => {
    const boxes: BoundingBox[] = [
      { bbox_2d: [100, 100, 150, 150] as [number, number, number, number], label: "face", confidence: 0.99 }, // area = 2500
      { bbox_2d: [200, 200, 400, 500] as [number, number, number, number], label: "face", confidence: 0.3 }, // area = 90000
    ];
    const result = buildCropRectFromBestBox(boxes, 0);
    // Should pick the second box (larger area, lower confidence)
    expect(result).toEqual({ x: 200, y: 200, width: 200, height: 300 });
  });

  it("uses single box when only one provided", () => {
    const boxes: BoundingBox[] = [
      { bbox_2d: [100, 200, 400, 500] as [number, number, number, number], label: "face", confidence: 0.85 },
    ];
    const result = buildCropRectFromBestBox(boxes, 0.25);
    // box: x=100, y=200, w=300, h=300
    // paddingW = 75, paddingH = 75
    // cropX = 25, cropY = 125, cropWidth = 450, cropHeight = 450
    expect(result).toEqual({ x: 25, y: 125, width: 450, height: 450 });
  });

  it("handles boxes with same area (picks first)", () => {
    const boxes: BoundingBox[] = [
      { bbox_2d: [100, 100, 200, 200] as [number, number, number, number], label: "face", confidence: 0.8 }, // area = 10000
      { bbox_2d: [300, 300, 400, 400] as [number, number, number, number], label: "face", confidence: 0.9 }, // area = 10000
    ];
    const result = buildCropRectFromBestBox(boxes, 0);
    // First box wins (same area, reduce keeps first max)
    expect(result).toEqual({ x: 100, y: 100, width: 100, height: 100 });
  });

  it("applies padding factor to selected box", () => {
    const boxes: BoundingBox[] = [
      { bbox_2d: [400, 400, 600, 600] as [number, number, number, number], label: "face", confidence: 0.8 },
    ];
    const result = buildCropRectFromBestBox(boxes, 0.25);
    // box: x=400, y=400, w=200, h=200
    // paddingW = 50, paddingH = 50
    // cropX = 350, cropY = 350, cropWidth = 300, cropHeight = 300
    expect(result).toEqual({ x: 350, y: 350, width: 300, height: 300 });
  });

  it("handles body boxes (zero padding)", () => {
    const boxes: BoundingBox[] = [
      { bbox_2d: [100, 100, 500, 900] as [number, number, number, number], label: "body", confidence: 0.85 },
    ];
    const result = buildCropRectFromBestBox(boxes, 0);
    expect(result).toEqual({ x: 100, y: 100, width: 400, height: 800 });
  });
});

// ---------------------------------------------------------------------------
// allocateCropTypes — empty input
// ---------------------------------------------------------------------------

describe("allocateCropTypes — empty input", () => {
  it("returns empty array for empty detections", () => {
    const result = allocateCropTypes([], 0.5);
    expect(result).toEqual([]);
  });

  it("returns empty array with zero ratio", () => {
    const result = allocateCropTypes([], 0);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeBoxQuality — additional edge cases
// ---------------------------------------------------------------------------

describe("computeBoxQuality — edge cases", () => {
  it("returns 0 when all boxes have 0 confidence", () => {
    const boxes = [
      { bbox_2d: [100, 100, 200, 200] as [number, number, number, number], label: "face", confidence: 0 },
    ];
    expect(computeBoxQuality(boxes)).toBe(0);
  });

  it("returns 1 when any box has 1.0 confidence", () => {
    const boxes = [
      { bbox_2d: [100, 100, 200, 200] as [number, number, number, number], label: "face", confidence: 0.3 },
      { bbox_2d: [300, 300, 400, 400] as [number, number, number, number], label: "face", confidence: 1.0 },
    ];
    expect(computeBoxQuality(boxes)).toBe(1.0);
  });

  it("ignores box label — uses confidence only", () => {
    const boxes = [
      { bbox_2d: [100, 100, 200, 200] as [number, number, number, number], label: "body", confidence: 0.9 },
    ];
    expect(computeBoxQuality(boxes)).toBe(0.9);
  });

  it("handles very small confidence values", () => {
    const boxes = [
      { bbox_2d: [100, 100, 200, 200] as [number, number, number, number], label: "face", confidence: 0.01 },
    ];
    expect(computeBoxQuality(boxes)).toBe(0.01);
  });
});
