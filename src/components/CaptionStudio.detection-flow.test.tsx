import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCropDetection } from "./hooks/useCropDetection";
import type {
  BoundingBox,
  CropRuleset,
  DetectionResult,
  UseCropDetectionOptions,
} from "./CaptionStudioCropTypes";

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

const makeHookOptions = (count = 2): UseCropDetectionOptions => ({
  imageNames: Array.from({ length: count }, (_, i) => `img${i}.png`),
});

const makeDetectionResults = (count = 2): DetectionResult[] =>
  Array.from({ length: count }, (_, i) => ({
    imageIndex: i,
    imageName: `img${i}.png`,
    faceBoxes: [makeBox(0.9)],
    bodyBoxes: [makeBodyBox(0.3)],
  }));

// ---------------------------------------------------------------------------
// Bug: Stale state after setState calls in same tick
//
// In handleDetect's SSE done handler, this sequence runs synchronously:
//   1. setDetectionResults(results)  → setState (batched)
//   2. autoAssignCrops()             → setState (batched)
//   3. getFinalCrops()               → reads state.crops = [] (STALE!)
//   4. hasCrops check                → false (STALE!)
//   5. Error path fires → resets to "upload"
//
// These tests assert the CORRECT behavior (what should happen after the fix).
// They FAIL with the current code because setState is async.
// ---------------------------------------------------------------------------

describe("detection flow — state must be immediately readable after setState", () => {
  let staleCrops: import("./CaptionStudioCropTypes").ImageCrop[] = [];
  let staleHasCrops = false;

  it("getFinalCrops() returns crops inside the same act() block after setDetectionResults + autoAssignCrops", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions(2)));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });

    // Capture state INSIDE act() — this is what handleDetect sees
    act(() => {
      result.current.setDetectionResults(makeDetectionResults(2));
      result.current.autoAssignCrops();
      staleCrops = result.current.getFinalCrops();
      staleHasCrops = result.current.hasCrops;
    });

    // After the fix: staleCrops should have 2 items (readable immediately)
    // Current behavior: [] because setState hasn't flushed within act()
    expect(staleCrops).toHaveLength(2);
  });

  it("hasCrops is true inside the same act() block after autoAssignCrops", () => {
    const { result } = renderHook(() => useCropDetection(makeHookOptions(2)));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });

    act(() => {
      result.current.setDetectionResults(makeDetectionResults(2));
      result.current.autoAssignCrops();
      staleHasCrops = result.current.hasCrops;
    });

    // After fix: true. Current: false.
    expect(staleHasCrops).toBe(true);
  });

  it("state.detections is populated inside the same act() block after setDetectionResults", () => {
    let staleDetections: DetectionResult[] = [];

    const { result } = renderHook(() => useCropDetection(makeHookOptions(2)));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });

    act(() => {
      result.current.setDetectionResults(makeDetectionResults(2));
      staleDetections = result.current.state.detections;
    });

    // After fix: 2 items. Current: [].
    expect(staleDetections).toHaveLength(2);
  });

  it("SSE done handler pattern: can determine crop validity inside the same act() block", () => {
    let capturedHasValidCrops = false;
    let capturedCropsLength = 0;

    const { result } = renderHook(() => useCropDetection(makeHookOptions(2)));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });

    // This replicates the EXACT sequence from handleDetect's SSE done handler:
    act(() => {
      const results = makeDetectionResults(2);
      result.current.setDetectionResults(results);
      result.current.autoAssignCrops();

      // handleDetect checks these immediately:
      const validCrops = result.current.getFinalCrops();
      capturedHasValidCrops = validCrops.length > 0;
      capturedCropsLength = validCrops.length;
    });

    // After fix: hasValidCrops = true, crops.length = 2
    // Current: hasValidCrops = false, crops.length = 0
    // This causes handleDetect to take the error path and reset to "upload"
    expect(capturedHasValidCrops).toBe(true);
    expect(capturedCropsLength).toBe(2);
  });

  it("state.crops is populated inside the same act() block after autoAssignCrops", () => {
    let staleCropsLength = 0;

    const { result } = renderHook(() => useCropDetection(makeHookOptions(3)));

    act(() => {
      result.current.setRuleset(makeRuleset());
    });

    act(() => {
      result.current.setDetectionResults(makeDetectionResults(3));
    });

    act(() => {
      result.current.autoAssignCrops();
      staleCropsLength = result.current.state.crops.length;
    });

    // After fix: 3. Current: 0.
    expect(staleCropsLength).toBe(3);
  });
});
