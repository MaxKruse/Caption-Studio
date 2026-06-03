import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { parseDetectionResponse } from "@/lib/detect-parsing";
import { useCropDetection } from "./useCropDetection";
import type {
  BoundingBox,
  CropRuleset,
  DetectionResult,
  UseCropDetectionOptions,
} from "../CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRuleset = (): CropRuleset => ({
  id: "crop_50_50",
  label: "50 / 50",
  portraitRatio: 0.5,
  description: "Equal split",
});

const makeBox = (confidence = 0.85): BoundingBox => ({
  bbox_2d: [100, 100, 400, 400] as [number, number, number, number],
  label: "face",
  confidence,
});

const makeBodyBox = (confidence = 0.30): BoundingBox => ({
  ...makeBox(confidence),
  label: "body",
  bbox_2d: [50, 100, 950, 900] as [number, number, number, number],
});

const makeHookOptions = (): UseCropDetectionOptions => ({
  imageCount: 2,
  imageNames: ["a.png", "b.jpg"],
  serverUrl: "http://localhost:8080",
  selectedModel: "gpt-4o",
  showToast: () => {},
});

const makeDetection = (
  imageIndex: number,
  imageName: string,
  options?: { faceConfidence?: number; bodyConfidence?: number; error?: string }
): DetectionResult => ({
  imageIndex,
  imageName,
  faceBoxes: options?.faceConfidence ? [makeBox(options.faceConfidence)] : [],
  bodyBoxes: options?.bodyConfidence ? [makeBodyBox(options.bodyConfidence)] : [],
  error: options?.error,
});

// ---------------------------------------------------------------------------
// setDetectionResults — all images permanently fail
// ---------------------------------------------------------------------------

describe("setDetectionResults — all images permanently fail", () => {
  it("sets detectionError with 'failed permanently' message", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry: API timeout" }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry: API timeout" }),
      ]);
    });

    expect(result.current.state.detectionError).toContain("failed detection");
    expect(result.current.state.detectionError).toContain("set their crop boxes manually");
    expect(result.current.state.detectionError).toContain("a.png");
    expect(result.current.state.detectionError).toContain("b.jpg");
  });

  it("marks images as skipped", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry: API timeout" }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry: API timeout" }),
      ]);
    });

    expect(result.current.skippedImages).toContain("a.png");
    expect(result.current.skippedImages).toContain("b.jpg");
  });

  it("sets isDetecting to false", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });

    expect(result.current.state.isDetecting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setDetectionResults — mixed success and permanent failure
// ---------------------------------------------------------------------------

describe("setDetectionResults — mixed success and permanent failure", () => {
  it("reports only the permanently failed images in error", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.85, bodyConfidence: 0.30 }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry: API timeout" }),
      ]);
    });

    expect(result.current.state.detectionError).toContain("b.jpg");
    expect(result.current.state.detectionError).not.toContain("a.png");
  });

  it("only marks permanently failed images as skipped", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.85, bodyConfidence: 0.30 }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });

    expect(result.current.skippedImages).toEqual(["b.jpg"]);
  });

  it("stores valid detections alongside failed ones", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.85, bodyConfidence: 0.30 }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });

    expect(result.current.state.detections).toHaveLength(2);
    expect(result.current.state.detections[0].faceBoxes).toHaveLength(1);
    expect(result.current.state.detections[1].error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// setDetectionResults — all fail but NOT permanently (first attempt)
// ---------------------------------------------------------------------------

describe("setDetectionResults — all fail but not permanently", () => {
  it('uses "had detection issues" message when no permanent failures', () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "API error 500" }),
        makeDetection(1, "b.jpg", { error: "API error 500" }),
      ]);
    });

    expect(result.current.state.detectionError).toContain("had detection issues");
    expect(result.current.state.detectionError).not.toContain("failed permanently");
  });

  it("does not mark non-permanent failures as skipped", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "API error 500" }),
        makeDetection(1, "b.jpg", { error: "API error 500" }),
      ]);
    });

    expect(result.current.skippedImages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// autoAssignCrops — all detections failed (zero valid)
// ---------------------------------------------------------------------------

describe("autoAssignCrops — all detections failed (zero valid)", () => {
  it("assigns default full-image crops to all failed images", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.state.crops).toHaveLength(2);

    for (const crop of result.current.state.crops) {
      expect(crop.cropRect).toEqual({ x: 20, y: 20, width: 960, height: 960 });
      expect(crop.autoDetected).toBe(false);
      expect(crop.cropType).toBe("face");
    }
  });

  it("assigns correct imageIndex and imageName to default crops", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.state.crops[0].imageIndex).toBe(0);
    expect(result.current.state.crops[0].imageName).toBe("a.png");
    expect(result.current.state.crops[1].imageIndex).toBe(1);
    expect(result.current.state.crops[1].imageName).toBe("b.jpg");
  });
});

// ---------------------------------------------------------------------------
// autoAssignCrops — mixed success and failure
// ---------------------------------------------------------------------------

describe("autoAssignCrops — mixed success and failure", () => {
  it("gives auto crops to successes and default crops to failures", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.90, bodyConfidence: 0.20 }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.state.crops).toHaveLength(2);

    // a.png — valid detection, should get auto crop
    const aCrop = result.current.state.crops.find((c) => c.imageName === "a.png")!;
    expect(aCrop.autoDetected).toBe(true);
    expect(aCrop.cropRect).not.toEqual({ x: 20, y: 20, width: 960, height: 960 });

    // b.jpg — failed, should get default crop
    const bCrop = result.current.state.crops.find((c) => c.imageName === "b.jpg")!;
    expect(bCrop.autoDetected).toBe(false);
    expect(bCrop.cropRect).toEqual({ x: 20, y: 20, width: 960, height: 960 });
  });

  it("allocates crop types based on valid detections only", () => {
    const { result } = renderHook(() => useCropDetection({
      ...makeHookOptions(),
      imageCount: 3,
      imageNames: ["a.png", "b.jpg", "c.webp"],
    }));

    // a.png = good face (high face conf), b.jpg = good body (high body conf), c.webp = failed
    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.95, bodyConfidence: 0.10 }),
        makeDetection(1, "b.jpg", { faceConfidence: 0.10, bodyConfidence: 0.90 }),
        makeDetection(2, "c.webp", { error: "Detection failed permanently after retry" }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    const aCrop = result.current.state.crops.find((c) => c.imageName === "a.png")!;
    const bCrop = result.current.state.crops.find((c) => c.imageName === "b.jpg")!;
    const cCrop = result.current.state.crops.find((c) => c.imageName === "c.webp")!;

    // a.png has high face preference -> face
    expect(aCrop.cropType).toBe("face");
    // b.jpg has high body preference -> body
    expect(bCrop.cropType).toBe("body");
    // c.webp failed -> defaults to face
    expect(cCrop.cropType).toBe("face");
  });
});

// ---------------------------------------------------------------------------
// autoAssignCrops — no ruleset set
// ---------------------------------------------------------------------------

describe("autoAssignCrops — no ruleset set", () => {
  it("does nothing when ruleset is null", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.85, bodyConfidence: 0.30 }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.state.crops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// autoAssignCrops — no detections
// ---------------------------------------------------------------------------

describe("autoAssignCrops — no detections", () => {
  it("does nothing when detections array is empty", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.state.crops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// autoAssignCrops — detection returns boxes but all filtered out
// ---------------------------------------------------------------------------

describe("autoAssignCrops — detection returns boxes but buildCropRectFromBestBox returns null", () => {
  it("falls back to default crop when no valid box found", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    // Detection with empty boxes (valid detection but no boxes found)
    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0, bodyConfidence: 0 }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.state.crops).toHaveLength(1);
    expect(result.current.state.crops[0].cropRect).toEqual({ x: 20, y: 20, width: 960, height: 960 });
    expect(result.current.state.crops[0].autoDetected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Low confidence warning
// ---------------------------------------------------------------------------

describe("setDetectionResults — low confidence warning", () => {
  it("prepends low confidence warning when average confidence is below threshold", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    // Very low confidence scores
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.20, bodyConfidence: 0.10 }),
        makeDetection(1, "b.jpg", { faceConfidence: 0.15, bodyConfidence: 0.05 }),
      ]);
    });

    expect(result.current.state.detectionError).toContain("Low detection confidence");
  });

  it("does not show low confidence warning when scores are high", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.90, bodyConfidence: 0.80 }),
        makeDetection(1, "b.jpg", { faceConfidence: 0.85, bodyConfidence: 0.75 }),
      ]);
    });

    // No errors and high confidence -> detectionError is null
    expect(result.current.state.detectionError).toBeNull();
  });

  it("combines low confidence warning with permanent failure message", () => {
    const { result } = renderHook(() => useCropDetection({
      ...makeHookOptions(),
      imageCount: 3,
      imageNames: ["a.png", "b.jpg", "c.webp"],
    }));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { faceConfidence: 0.20, bodyConfidence: 0.10 }),
        makeDetection(1, "b.jpg", { faceConfidence: 0.25, bodyConfidence: 0.15 }),
        makeDetection(2, "c.webp", { error: "Detection failed permanently after retry" }),
      ]);
    });

    expect(result.current.state.detectionError).toContain("Low detection confidence");
    expect(result.current.state.detectionError).toContain("failed detection");
  });
});

// ---------------------------------------------------------------------------
// getFinalCrops — after all failures
// ---------------------------------------------------------------------------

describe("getFinalCrops — after all failures", () => {
  it("returns default crops even when all detections failed", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
        makeDetection(1, "b.jpg", { error: "Detection failed permanently after retry" }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    const finalCrops = result.current.getFinalCrops();
    expect(finalCrops).toHaveLength(2);
    expect(finalCrops.every((c) => c.autoDetected === false)).toBe(true);
  });

  it("returns empty array when no crops assigned", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    const finalCrops = result.current.getFinalCrops();
    expect(finalCrops).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasCrops — after failures
// ---------------------------------------------------------------------------

describe("hasCrops — after failures", () => {
  it("is true after autoAssignCrops assigns default crops to failed images", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });
    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
      ]);
    });
    act(() => {
      result.current.autoAssignCrops();
    });

    expect(result.current.hasCrops).toBe(true);
  });

  it("is false before autoAssignCrops", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
      ]);
    });

    expect(result.current.hasCrops).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reset after failures
// ---------------------------------------------------------------------------

describe("reset — after failures", () => {
  it("clears skipped images and detection error", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions()));

    act(() => {
      result.current.setDetectionResults([
        makeDetection(0, "a.png", { error: "Detection failed permanently after retry" }),
      ]);
    });

    expect(result.current.skippedImages.length).toBeGreaterThan(0);
    expect(result.current.state.detectionError).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.skippedImages).toEqual([]);
    expect(result.current.state.detectionError).toBeNull();
    expect(result.current.state.crops).toEqual([]);
    expect(result.current.state.detections).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseDetectionResponse — edge cases that trigger retries
// ---------------------------------------------------------------------------

describe("parseDetectionResponse — edge cases triggering retry path", () => {
  const parse = parseDetectionResponse;

  it("returns empty arrays for valid JSON with empty arrays (triggers retry in API)", () => {
    const result = parse(JSON.stringify({ faces: [], bodies: [] }));

    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
    // This triggers the "no face or body detected — retrying" path in the API
  });

  it("returns empty arrays for JSON with only whitespace content", () => {
    const result = parse("   ");
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("returns empty arrays for JSON that parses but has no bbox_2d arrays", () => {
    const result = parse(JSON.stringify({
      faces: [{ label: "face", confidence: 0.9 }],
      bodies: [],
    }));

    // Entry filtered out because bbox_2d is missing
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("returns empty arrays for completely unparseable response", () => {
    const result = parse("I cannot detect anything in this image");
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });

  it("returns empty arrays for null/undefined input", () => {
    expect(parse("").faceBoxes).toEqual([]);
    expect(parse("null").faceBoxes).toEqual([]);
  });

  it("returns empty arrays for JSON with wrong structure", () => {
    const result = parse(JSON.stringify({ detections: [{ x: 100, y: 200 }] }));
    expect(result.faceBoxes).toEqual([]);
    expect(result.bodyBoxes).toEqual([]);
  });
});
