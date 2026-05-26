import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloatingActionBar } from "./FloatingActionBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockProgress = {
  total: 10,
  queued: 4,
  processing: 2,
  completed: 3,
  failed: 1,
};

const mockDetectionProgress = {
  total: 5,
  queued: 1,
  processing: 1,
  completed: 2,
  failed: 1,
};

// ---------------------------------------------------------------------------
// Hidden when no images
// ---------------------------------------------------------------------------

describe("FloatingActionBar visibility", () => {
  it("does not render when no images", () => {
    render(
      <FloatingActionBar
        step="upload"
        imagesCount={0}
        onClearAll={() => {}}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Upload step — detect button + clear all
// ---------------------------------------------------------------------------

describe("FloatingActionBar upload step", () => {
  it("shows detect button when images uploaded", () => {
    render(
      <FloatingActionBar
        step="upload"
        imagesCount={5}
        canDetect={true}
        onDetect={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Detect Faces & Bodies/ })
    ).toBeDefined();
    expect(screen.getByText(/5 images/)).toBeDefined();
  });

  it("shows singular image count", () => {
    render(
      <FloatingActionBar
        step="upload"
        imagesCount={1}
        canDetect={true}
        onDetect={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.getByText(/1 image/)).toBeDefined();
  });

  it("disables detect button when canDetect is false", () => {
    render(
      <FloatingActionBar
        step="upload"
        imagesCount={3}
        canDetect={false}
        onDetect={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Detect Faces & Bodies/ })
    ).toBeDisabled();
  });

  it("shows Clear all button in upload step", () => {
    render(
      <FloatingActionBar
        step="upload"
        imagesCount={3}
        canDetect={true}
        onDetect={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Detect step — progress bar + abort
// ---------------------------------------------------------------------------

describe("FloatingActionBar detect step", () => {
  it("shows progress bar and abort button during detection", () => {
    render(
      <FloatingActionBar
        step="detect"
        imagesCount={5}
        detectionProgress={mockDetectionProgress}
        onAbortDetection={() => {}}
      />
    );
    expect(screen.getByText("2 detected")).toBeDefined();
    expect(screen.getByText(/1 retrying/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Abort detection" })).toBeDefined();
  });

  it("shows skipped count when images are permanently skipped", () => {
    render(
      <FloatingActionBar
        step="detect"
        imagesCount={5}
        detectionProgress={{
          total: 5,
          queued: 0,
          processing: 0,
          completed: 3,
          failed: 0,
          skipped: 2,
        }}
        onAbortDetection={() => {}}
      />
    );
    expect(screen.getByText(/2 skipped/)).toBeDefined();
  });

  it("shows progress percentage", () => {
    render(
      <FloatingActionBar
        step="detect"
        imagesCount={5}
        detectionProgress={{
          total: 5,
          queued: 0,
          processing: 0,
          completed: 3,
          failed: 1,
        }}
        onAbortDetection={() => {}}
      />
    );
    expect(screen.getByText("80%")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Crop step — proceed + back
// ---------------------------------------------------------------------------

describe("FloatingActionBar crop step", () => {
  it("shows proceed and back buttons in crop step", () => {
    render(
      <FloatingActionBar
        step="crop"
        imagesCount={5}
        canProceedToCaption={true}
        rulesetValid={true}
        onProceedToCaption={() => {}}
        onBackToUpload={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Caption Cropped/ })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
  });

  it("disables proceed button when canProceedToCaption is false", () => {
    render(
      <FloatingActionBar
        step="crop"
        imagesCount={5}
        canProceedToCaption={false}
        rulesetValid={false}
        rulesetValidation={{ valid: false, faceCount: 5, bodyCount: 0, expectedFaceRange: [2, 3], expectedBodyRange: [2, 3] }}
        onProceedToCaption={() => {}}
        onBackToUpload={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Caption Cropped/ })
    ).toBeDisabled();
  });

  it("shows ruleset validation warning when invalid", () => {
    render(
      <FloatingActionBar
        step="crop"
        imagesCount={5}
        canProceedToCaption={false}
        rulesetValid={false}
        rulesetValidation={{ valid: false, faceCount: 5, bodyCount: 0, expectedFaceRange: [2, 3], expectedBodyRange: [2, 3] }}
        onProceedToCaption={() => {}}
        onBackToUpload={() => {}}
      />
    );
    expect(screen.getByText(/Need 2\u20133 face/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Caption step — progress bar + time estimate + abort
// ---------------------------------------------------------------------------

describe("FloatingActionBar caption step", () => {
  it("shows progress bar and abort button during captioning", () => {
    render(
      <FloatingActionBar
        step="caption"
        imagesCount={10}
        captionProgress={mockProgress}
        captionProgressPercent={40}
        estimatedRemainingMs={30000}
        avgTimeMs={5000}
        onAbortCaption={() => {}}
      />
    );
    expect(screen.getByText("3 captioned")).toBeDefined();
    expect(screen.getByText(/1 failed/)).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();
    expect(screen.getByRole("button", { name: "Abort captioning" })).toBeDefined();
  });

  it("shows time estimate with remaining, per-image, and images left", () => {
    render(
      <FloatingActionBar
        step="caption"
        imagesCount={10}
        captionProgress={{
          total: 10,
          queued: 5,
          processing: 2,
          completed: 3,
          failed: 0,
        }}
        captionProgressPercent={30}
        estimatedRemainingMs={60000}
        avgTimeMs={12000}
        onAbortCaption={() => {}}
      />
    );
    expect(screen.getByText("1m remaining")).toBeDefined();
    expect(screen.getByText("~12s per image")).toBeDefined();
    expect(screen.getByText("5 images left")).toBeDefined();
  });

  it("shows 'Waiting...' when estimatedRemainingMs is undefined", () => {
    render(
      <FloatingActionBar
        step="caption"
        imagesCount={10}
        captionProgress={{
          total: 10,
          queued: 10,
          processing: 0,
          completed: 0,
          failed: 0,
        }}
        captionProgressPercent={0}
        onAbortCaption={() => {}}
      />
    );
    expect(screen.getByText("Waiting...")).toBeDefined();
  });

  it("shows singular 'image left' when one remains", () => {
    render(
      <FloatingActionBar
        step="caption"
        imagesCount={10}
        captionProgress={{
          total: 10,
          queued: 1,
          processing: 0,
          completed: 9,
          failed: 0,
        }}
        captionProgressPercent={90}
        estimatedRemainingMs={5000}
        avgTimeMs={5000}
        onAbortCaption={() => {}}
      />
    );
    expect(screen.getByText("1 image left")).toBeDefined();
  });

  it("omits failed count when no failures", () => {
    render(
      <FloatingActionBar
        step="caption"
        imagesCount={10}
        captionProgress={{
          total: 10,
          queued: 3,
          processing: 2,
          completed: 5,
          failed: 0,
        }}
        captionProgressPercent={50}
        estimatedRemainingMs={30000}
        avgTimeMs={5000}
        onAbortCaption={() => {}}
      />
    );
    expect(screen.queryByText(/failed/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Done step — download + start over
// ---------------------------------------------------------------------------

describe("FloatingActionBar done step", () => {
  it("shows download and start over buttons when job done", () => {
    render(
      <FloatingActionBar
        step="done"
        imagesCount={10}
        captionProgress={{
          total: 10,
          queued: 0,
          processing: 0,
          completed: 8,
          failed: 2,
        }}
        captionProgressPercent={100}
        onDownloadZip={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Download ZIP" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Start over" })).toBeDefined();
  });

  it("shows completion summary with failures", () => {
    render(
      <FloatingActionBar
        step="done"
        imagesCount={10}
        captionProgress={{
          total: 10,
          queued: 0,
          processing: 0,
          completed: 7,
          failed: 3,
        }}
        captionProgressPercent={100}
        onDownloadZip={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.getByText("7 captioned")).toBeDefined();
    expect(screen.getByText(/3 failed/)).toBeDefined();
  });

  it("shows completion summary without failures", () => {
    render(
      <FloatingActionBar
        step="done"
        imagesCount={5}
        captionProgress={{
          total: 5,
          queued: 0,
          processing: 0,
          completed: 5,
          failed: 0,
        }}
        captionProgressPercent={100}
        onDownloadZip={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.getByText("5 captioned")).toBeDefined();
    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("does not show detect button when done", () => {
    render(
      <FloatingActionBar
        step="done"
        imagesCount={5}
        captionProgress={{
          total: 5,
          queued: 0,
          processing: 0,
          completed: 5,
          failed: 0,
        }}
        captionProgressPercent={100}
        onDownloadZip={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /Detect/ })).toBeNull();
  });

  it("does not show proceed button when done", () => {
    render(
      <FloatingActionBar
        step="done"
        imagesCount={5}
        captionProgress={{
          total: 5,
          queued: 0,
          processing: 0,
          completed: 5,
          failed: 0,
        }}
        captionProgressPercent={100}
        onDownloadZip={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /Caption Cropped/ })).toBeNull();
  });
});
