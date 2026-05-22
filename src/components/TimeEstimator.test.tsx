import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatDuration } from "./CaptionStudioTypes";
import { TimeEstimator } from "./TimeEstimator";

// ---------------------------------------------------------------------------
// formatDuration helper
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats seconds correctly", () => {
    expect(formatDuration(45000)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3725000)).toBe("1h 2m 5s");
  });

  it("formats zero as <1s", () => {
    expect(formatDuration(0)).toBe("<1s");
  });

  it("omits trailing zero seconds for exact minutes", () => {
    expect(formatDuration(180000)).toBe("3m");
  });

  it("omits trailing zero minutes/seconds for exact hours", () => {
    expect(formatDuration(7200000)).toBe("2h");
  });

  it("formats sub-second values as <1s", () => {
    expect(formatDuration(500)).toBe("<1s");
  });

  it("formats large durations", () => {
    expect(formatDuration(3661000)).toBe("1h 1m 1s");
  });
});

// ---------------------------------------------------------------------------
// TimeEstimator rendering
// ---------------------------------------------------------------------------

describe("TimeEstimator component", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders when estimatedRemainingMs and remaining are provided", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={60000}
        avgTimeMs={12000}
        remaining={5}
        isDone={false}
      />
    );
    expect(screen.getByText("Est. remaining:")).toBeDefined();
    expect(screen.getByText("1m")).toBeDefined();
    expect(screen.getByText("~12s per image")).toBeDefined();
    expect(screen.getByText("5 images left")).toBeDefined();
  });

  it("shows singular 'image left' when remaining is 1", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={12000}
        avgTimeMs={12000}
        remaining={1}
        isDone={false}
      />
    );
    expect(screen.getByText("1 image left")).toBeDefined();
  });

  it("shows Waiting... when estimatedRemainingMs is undefined", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={undefined}
        avgTimeMs={12000}
        remaining={5}
        isDone={false}
      />
    );
    expect(screen.getByText("Est. remaining:")).toBeDefined();
    expect(screen.getByText("Waiting...")).toBeDefined();
    expect(screen.getByText("~12s per image")).toBeDefined();
    expect(screen.getByText("5 images left")).toBeDefined();
  });

  it("shows estimate without image count when remaining is 0", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={0}
        avgTimeMs={12000}
        remaining={0}
        isDone={false}
      />
    );
    expect(screen.getByText("Est. remaining:")).toBeDefined();
    expect(screen.getByText("<1s")).toBeDefined();
    expect(screen.getByText("~12s per image")).toBeDefined();
    expect(screen.queryByText(/images left/)).toBeNull();
  });

  it("does not render when remaining is negative", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={0}
        avgTimeMs={12000}
        remaining={-1}
        isDone={false}
      />
    );
    expect(screen.queryByText("Est. remaining:")).toBeNull();
  });

  it("shows per-image time when avgTimeMs is provided", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={60000}
        avgTimeMs={12500}
        remaining={5}
        isDone={false}
      />
    );
    expect(screen.getByText("~12s per image")).toBeDefined();
  });

  it("omits per-image time when avgTimeMs is undefined", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={60000}
        avgTimeMs={undefined}
        remaining={5}
        isDone={false}
      />
    );
    expect(screen.queryByText(/per image/)).toBeNull();
  });

  it("shows Done! when isDone is true", () => {
    render(
      <TimeEstimator
        estimatedRemainingMs={0}
        avgTimeMs={12000}
        remaining={0}
        isDone={true}
      />
    );
    expect(screen.getByText("Done!")).toBeDefined();
    expect(screen.queryByText("Est. remaining:")).toBeNull();
    expect(screen.queryByText(/images left/)).toBeNull();
  });
});
