/**
 * Tests for sliding window computation used in Krea 2 re-captioning.
 * Window size = 8, step = 4 (overlap = 4).
 */

import { describe, test, expect } from "bun:test";
import { computeSlidingWindows } from "@/lib/krea2-window";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeSlidingWindows", () => {
  test("returns empty array for 0 images", () => {
    expect(computeSlidingWindows(0)).toEqual([]);
  });

  test("returns single window for 1 image", () => {
    const windows = computeSlidingWindows(1);
    expect(windows).toEqual([[0]]);
  });

  test("returns single window for 8 images (exact window size)", () => {
    const windows = computeSlidingWindows(8);
    expect(windows).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
  });

  test("returns single window for fewer than 8 images", () => {
    const windows = computeSlidingWindows(5);
    expect(windows).toEqual([[0, 1, 2, 3, 4]]);
  });

  test("returns two overlapping windows for 9 images", () => {
    const windows = computeSlidingWindows(9);
    expect(windows).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [4, 5, 6, 7, 8],
    ]);
  });

  test("returns two overlapping windows for 12 images", () => {
    const windows = computeSlidingWindows(12);
    expect(windows).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [4, 5, 6, 7, 8, 9, 10, 11],
    ]);
  });

  test("returns three windows for 13 images", () => {
    const windows = computeSlidingWindows(13);
    expect(windows).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [4, 5, 6, 7, 8, 9, 10, 11],
      [8, 9, 10, 11, 12],
    ]);
  });

  test("returns correct windows for 20 images", () => {
    const windows = computeSlidingWindows(20);
    expect(windows).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [4, 5, 6, 7, 8, 9, 10, 11],
      [8, 9, 10, 11, 12, 13, 14, 15],
      [12, 13, 14, 15, 16, 17, 18, 19],
    ]);
  });

  test("step equals windowSize produces non-overlapping windows", () => {
    const windows = computeSlidingWindows(16, 8, 8);
    expect(windows).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14, 15],
    ]);
  });

  test("step of 1 produces maximum overlap", () => {
    const windows = computeSlidingWindows(5, 3, 1);
    expect(windows).toEqual([
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
    ]);
  });

  test("every image index appears in at least one window", () => {
    for (let n = 1; n <= 30; n++) {
      const windows = computeSlidingWindows(n);
      const covered = new Set<number>();
      for (const window of windows) {
        for (const idx of window) {
          covered.add(idx);
        }
      }
      for (let i = 0; i < n; i++) {
        expect(covered.has(i)).toBe(true);
      }
    }
  });

  test("all window indices are in valid range", () => {
    for (let n = 1; n <= 30; n++) {
      const windows = computeSlidingWindows(n);
      for (const window of windows) {
        for (const idx of window) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(n);
        }
      }
    }
  });

  test("no window exceeds windowSize", () => {
    for (let n = 1; n <= 30; n++) {
      const windows = computeSlidingWindows(n);
      for (const window of windows) {
        expect(window.length).toBeLessThanOrEqual(8);
      }
    }
  });
});
