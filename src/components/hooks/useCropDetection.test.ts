import { describe, it, expect } from "vitest";
import type { BoundingBox } from "../CaptionStudioCropTypes";
import { allocateCropTypes, computeBoxQuality } from "./useCropDetection";

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
