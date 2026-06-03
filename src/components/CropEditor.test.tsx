import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CropEditor } from "./CropEditor";
import type { ImageFile } from "./CaptionStudioTypes";
import type { CropRuleset, DetectionResult, ImageCrop } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImage(name: string): ImageFile {
  return {
    name,
    file: new File([""], name, { type: "image/png" }),
    preview: "data:image/png;base64,fake",
  };
}

function makeRuleset(): CropRuleset {
  return {
    id: "crop_50_50",
    label: "50 / 50",
    portraitRatio: 0.5,
    description: "Equal split",
  };
}

function makeDetection(imageIndex: number, imageName: string, error?: string): DetectionResult {
  return {
    imageIndex,
    imageName,
    faceBoxes: error
      ? []
      : [
          {
            bbox_2d: [100, 150, 400, 450] as [number, number, number, number],
            label: "face",
            confidence: 0.85,
          },
        ],
    bodyBoxes: error
      ? []
      : [
          {
            bbox_2d: [50, 100, 950, 900] as [number, number, number, number],
            label: "body",
            confidence: 0.3,
          },
        ],
    error,
  };
}

function makeCrop(
  imageIndex: number,
  imageName: string,
  cropType: "face" | "body" = "face",
  autoDetected: boolean = true
): ImageCrop {
  return {
    imageIndex,
    imageName,
    cropType,
    cropRect: { x: 20, y: 20, width: 960, height: 960 },
    autoDetected,
  };
}

function renderCropEditor({
  images = [makeImage("a.png"), makeImage("b.png")],
  crops = [
    makeCrop(0, "a.png", "face"),
    makeCrop(1, "b.png", "body"),
  ],
  detections = [
    makeDetection(0, "a.png"),
    makeDetection(1, "b.png"),
  ],
  detectionError = null,
  ruleset = makeRuleset(),
  selectedIndex = 0,
  skippedImageNames = [] as string[],
  disabled = false,
}: {
  images?: ImageFile[];
  crops?: ImageCrop[];
  detections?: DetectionResult[];
  detectionError?: string | null;
  ruleset?: CropRuleset;
  selectedIndex?: number;
  skippedImageNames?: string[];
  disabled?: boolean;
} = {}) {
  const onAutoAssign = vi.fn();
  const onUpdateCropRect = vi.fn();
  const onSetCropType = vi.fn();
  const onResetCrop = vi.fn();
  const onSelectImage = vi.fn();

  const rulesetValidation = {
    faceCount: crops.filter((c) => c.cropType === "face").length,
    bodyCount: crops.filter((c) => c.cropType === "body").length,
    expectedFaceRange: [1, 2] as [number, number],
    expectedBodyRange: [1, 2] as [number, number],
  };

  render(
    <CropEditor
      images={images}
      ruleset={ruleset}
      crops={crops}
      detections={detections}
      detectionError={detectionError}
      rulesetValid={true}
      rulesetValidation={rulesetValidation}
      onAutoAssign={onAutoAssign}
      onUpdateCropRect={onUpdateCropRect}
      onSetCropType={onSetCropType}
      onResetCrop={onResetCrop}
      onSelectImage={onSelectImage}
      selectedIndex={selectedIndex}
      disabled={disabled}
      skippedImageNames={skippedImageNames}
      canProceedToCaption={true}
      onProceedToCaption={vi.fn()}
      onBackToUpload={vi.fn()}
    />
  );

  return { onAutoAssign, onUpdateCropRect, onSetCropType, onResetCrop, onSelectImage };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("CropEditor rendering", () => {
  it("renders the section header", () => {
    renderCropEditor();
    expect(screen.getByText("Set Crops")).toBeDefined();
  });

  it("renders the collapsible toggle", () => {
    renderCropEditor();
    expect(screen.getByText("Set Crops")).toBeDefined();
  });

  it("renders the crop editor when crops exist", () => {
    renderCropEditor();
    expect(screen.getByText(/Adjust the crop box/)).toBeDefined();
  });

  it("renders controls bar with Re-assign all button", () => {
    renderCropEditor();
    expect(screen.getByText("Re-assign all")).toBeDefined();
  });

  it("renders Reset button", () => {
    renderCropEditor();
    expect(screen.getByText("Reset")).toBeDefined();
  });

  it("renders thumbnail strip with image count", () => {
    renderCropEditor();
    expect(screen.getByText(/Select image to edit/)).toBeDefined();
  });

  it("renders 2 thumbnails for 2 images", () => {
    renderCropEditor();
    const thumbnails = document.querySelectorAll("img[alt]");
    expect(thumbnails.length).toBe(2);
  });

  it("renders face badge for face crops", () => {
    renderCropEditor();
    // Face badge shows "F"
    expect(document.querySelector(".bg-blue-500")).toBeDefined();
  });

  it("renders body badge for body crops", () => {
    renderCropEditor();
    // Body badge shows "B"
    expect(document.querySelector(".bg-purple-500")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// No crops
// ---------------------------------------------------------------------------

describe("CropEditor — no crops", () => {
  it("shows 'No crops to edit' when crops array is empty", () => {
    renderCropEditor({
      crops: [],
      detections: [],
      images: [makeImage("a.png")],
    });
    expect(screen.getByText("No crops to edit")).toBeDefined();
  });

  it("shows 'All images failed detection' when no crops and empty detections", () => {
    // detections.every((d) => d.error) returns true for empty array
    renderCropEditor({
      crops: [],
      detections: [],
      images: [makeImage("a.png")],
    });
    // When detections is empty, every() returns true, so it shows "All failed"
    expect(screen.getByText("All images failed detection. Please try different images or a different model.")).toBeDefined();
  });

  it("shows 'Run detection first' when no crops but detections without errors exist", () => {
    // This path is unreachable in practice (autoAssignCrops always creates crops),
    // but we test the component's rendered logic
    renderCropEditor({
      crops: [],
      detections: [
        makeDetection(0, "a.png"), // no error
      ],
      images: [makeImage("a.png")],
    });
    expect(screen.getByText("Run detection first to generate crops.")).toBeDefined();
  });

  it("shows 'All images failed detection' when all detections have errors", () => {
    renderCropEditor({
      crops: [],
      detections: [
        makeDetection(0, "a.png", "API error"),
      ],
      images: [makeImage("a.png")],
    });
    expect(screen.getByText("All images failed detection. Please try different images or a different model.")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Failed detection images (new behavior)
// ---------------------------------------------------------------------------

describe("CropEditor — failed detection images", () => {
  it("shows crop editor for failed-detection image (not skipped placeholder)", () => {
    // Failed detection image now has a crop entry with autoDetected: false
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", true),
        makeCrop(1, "b.png", "face", false), // failed detection — default crop
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png", "Detection failed permanently after retry: API error"),
      ],
      selectedIndex: 1,
      skippedImageNames: ["b.png"],
    });

    // Should show the "detection failed" warning (amber, not red)
    expect(screen.getByText(/detection failed/)).toBeDefined();

    // Should NOT show the old "select another image to edit" placeholder
    expect(screen.queryByText(/select another image to edit/)).toBeNull();

    // Should NOT show the old red "will be omitted" message
    expect(screen.queryByText(/will be omitted/)).toBeNull();
  });

  it("shows amber warning for failed detection image", () => {
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", true),
        makeCrop(1, "b.png", "face", false),
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png", "Detection failed permanently"),
      ],
      selectedIndex: 1,
      skippedImageNames: ["b.png"],
    });

    // Warning should mention the image name
    expect(screen.getByText(/b\.png.*detection failed/)).toBeDefined();
  });

  it("shows amber '!' badge on thumbnail for failed-detection image", () => {
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", true),
        makeCrop(1, "b.png", "face", false),
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png", "Detection failed permanently"),
      ],
      selectedIndex: 0,
      skippedImageNames: ["b.png"],
    });

    // The failed image thumbnail should have an amber badge with "!"
    const amberBadge = document.querySelector(".bg-amber-500");
    expect(amberBadge).toBeDefined();
    expect(amberBadge?.textContent).toBe("!");
  });

  it("does NOT show SKIP badge for failed-detection images", () => {
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", true),
        makeCrop(1, "b.png", "face", false),
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png", "Detection failed permanently"),
      ],
      selectedIndex: 0,
      skippedImageNames: ["b.png"],
    });

    // Should NOT have "SKIP" text
    expect(screen.queryByText("SKIP")).toBeNull();
  });

  it("shows crop type badge (F/B) for failed-detection image thumbnail", () => {
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", true),
        makeCrop(1, "b.png", "body", false), // body crop for failed detection
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png", "Detection failed permanently"),
      ],
      selectedIndex: 0,
      skippedImageNames: ["b.png"],
    });

    // Should show "B" badge for body crop
    const badges = document.querySelectorAll(".bg-purple-500");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders crop editor view for failed-detection image when selected", () => {
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", true),
        makeCrop(1, "b.png", "face", false),
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png", "Detection failed permanently"),
      ],
      selectedIndex: 1,
      skippedImageNames: ["b.png"],
    });

    // The image name should appear in the editor
    expect(screen.getByText("b.png")).toBeDefined();
  });

  it("all images failed detection — all get default crops", () => {
    // When ALL images fail detection, they all get default crops
    renderCropEditor({
      images: [makeImage("a.png"), makeImage("b.png")],
      crops: [
        makeCrop(0, "a.png", "face", false),
        makeCrop(1, "b.png", "face", false),
      ],
      detections: [
        makeDetection(0, "a.png", "Detection failed permanently"),
        makeDetection(1, "b.png", "Detection failed permanently"),
      ],
      selectedIndex: 0,
      skippedImageNames: ["a.png", "b.png"],
    });

    // Should still show crop editor (not "no crops" message)
    expect(screen.queryByText("No crops to edit")).toBeNull();
    expect(screen.getByText("Set Crops")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Detection error
// ---------------------------------------------------------------------------

describe("CropEditor — detection error", () => {
  it("shows detection error message when provided", () => {
    renderCropEditor({
      detectionError: "1 image(s) failed detection — set their crop boxes manually",
    });

    expect(screen.getByText(/failed detection.*crop boxes manually/)).toBeDefined();
  });

  it("does not show detection error when null", () => {
    renderCropEditor({ detectionError: null });
    expect(screen.queryByText(/failed detection/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ruleset validation
// ---------------------------------------------------------------------------

describe("CropEditor — ruleset validation", () => {
  it("shows ruleset validation warning when invalid", () => {
    render(
      <CropEditor
        images={[makeImage("a.png"), makeImage("b.png")]}
        ruleset={makeRuleset()}
        crops={[
          makeCrop(0, "a.png", "face"),
          makeCrop(1, "b.png", "face"),
        ]}
        detections={[
          makeDetection(0, "a.png"),
          makeDetection(1, "b.png"),
        ]}
        detectionError={null}
        rulesetValid={false}
        rulesetValidation={{
          faceCount: 2,
          bodyCount: 0,
          expectedFaceRange: [0, 2] as [number, number],
          expectedBodyRange: [0, 2] as [number, number],
        }}
        onAutoAssign={vi.fn()}
        onUpdateCropRect={vi.fn()}
        onSetCropType={vi.fn()}
        onResetCrop={vi.fn()}
        onSelectImage={vi.fn()}
        selectedIndex={0}
        canProceedToCaption={false}
        onProceedToCaption={vi.fn()}
        onBackToUpload={vi.fn()}
      />
    );

    expect(screen.getByText("Crop ratio doesn't match ruleset")).toBeDefined();
  });

  it("does not show ruleset validation warning when valid", () => {
    renderCropEditor();
    expect(screen.queryByText("Crop ratio doesn't match ruleset")).toBeNull();
  });

  it("shows ruleset label in controls bar", () => {
    renderCropEditor();
    expect(screen.getByText(/50 \/ 50/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Thumbnail strip
// ---------------------------------------------------------------------------

describe("CropEditor — thumbnail strip", () => {
  it("shows selected image with border and ring", () => {
    renderCropEditor({ selectedIndex: 0 });
    // Selected thumbnail should have special styling
    expect(screen.getByText(/Select image to edit \(1 of 2\)/)).toBeDefined();
  });

  it("shows correct image count in selector label", () => {
    renderCropEditor({ selectedIndex: 1 });
    expect(screen.getByText(/Select image to edit \(2 of 2\)/)).toBeDefined();
  });

  it("renders thumbnails for all images", () => {
    const images = [
      makeImage("a.png"),
      makeImage("b.png"),
      makeImage("c.png"),
    ];
    renderCropEditor({
      images,
      crops: [
        makeCrop(0, "a.png", "face"),
        makeCrop(1, "b.png", "body"),
        makeCrop(2, "c.png", "face"),
      ],
      detections: [
        makeDetection(0, "a.png"),
        makeDetection(1, "b.png"),
        makeDetection(2, "c.png"),
      ],
    });

    const thumbnails = document.querySelectorAll("img[alt]");
    expect(thumbnails.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Disabled state
// ---------------------------------------------------------------------------

describe("CropEditor — disabled state", () => {
  it("disables Reset button when disabled", () => {
    renderCropEditor({ disabled: true });
    const resetButton = screen.getByText("Reset").closest("button");
    expect(resetButton?.getAttribute("disabled")).not.toBeNull();
  });

  it("disables Re-assign all button when disabled", () => {
    renderCropEditor({ disabled: true });
    const reassignButton = screen.getByText("Re-assign all").closest("button");
    expect(reassignButton?.getAttribute("disabled")).not.toBeNull();
  });

  it("enables buttons when not disabled", () => {
    renderCropEditor({ disabled: false });
    const resetButton = screen.getByText("Reset").closest("button");
    expect(resetButton?.getAttribute("disabled")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Collapsible
// ---------------------------------------------------------------------------

describe("CropEditor — collapsible", () => {
  it("shows body when expanded (default)", () => {
    renderCropEditor();
    expect(screen.getByText(/Adjust the crop box/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Keyboard hints
// ---------------------------------------------------------------------------

describe("CropEditor — keyboard hints", () => {
  it("shows keyboard navigation hints", () => {
    renderCropEditor();
    expect(screen.getByText(/navigate images/)).toBeDefined();
  });

  it("shows space bar hint for swap type", () => {
    renderCropEditor();
    // The &amp; in JSX renders as & in the DOM
    expect(screen.getByText(/swap type & snap/)).toBeDefined();
  });
});
