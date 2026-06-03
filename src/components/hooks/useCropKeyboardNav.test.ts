import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCropKeyboardNav } from "./useCropKeyboardNav";
import type { ImageFile } from "../CaptionStudioTypes";
import type { UseCropDetectionReturn } from "../CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// useCropKeyboardNav — keyboard navigation in crop mode
// ---------------------------------------------------------------------------

describe("useCropKeyboardNav", () => {
  let mockCropDetection: UseCropDetectionReturn;
  let mockImages: ImageFile[];

  const createMockImage = (name: string): ImageFile =>
    ({
      name,
      file: new File([""], name, { type: "image/png" }),
      preview: "",
      detection: undefined,
    }) as unknown as ImageFile;

  beforeEach(() => {
    mockCropDetection = {
      selectedImageIndex: 0,
      setSelectedImageIndex: vi.fn(),
      getCropType: vi.fn().mockReturnValue("face"),
      setCropType: vi.fn(),
      resetCrop: vi.fn(),
      getFinalCrops: vi.fn().mockReturnValue([
        { imageIndex: 0, cropType: "face" },
        { imageIndex: 2, cropType: "body" },
      ]),
    } as unknown as UseCropDetectionReturn;

    mockImages = [
      createMockImage("img1.png"),
      createMockImage("img2.png"),
      createMockImage("img3.png"),
    ];
  });

  it("does not register listeners when not in crop step", () => {
    renderHook(() =>
      useCropKeyboardNav({
        workflowStep: "upload",
        images: mockImages,
        cropDetection: mockCropDetection,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
    window.dispatchEvent(event);
    expect(mockCropDetection.setSelectedImageIndex).not.toHaveBeenCalled();
  });

  it("cycles to next image on ArrowRight", () => {
    renderHook(() =>
      useCropKeyboardNav({
        workflowStep: "crop",
        images: mockImages,
        cropDetection: mockCropDetection,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
    window.dispatchEvent(event);
    expect(mockCropDetection.setSelectedImageIndex).toHaveBeenCalledWith(2);
  });

  it("wraps to first on ArrowRight from last valid image", () => {
    mockCropDetection.selectedImageIndex = 2;
    mockCropDetection.getFinalCrops = vi.fn().mockReturnValue([
      { imageIndex: 0, cropType: "face" },
      { imageIndex: 2, cropType: "body" },
    ]);

    renderHook(() =>
      useCropKeyboardNav({
        workflowStep: "crop",
        images: mockImages,
        cropDetection: mockCropDetection,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
    window.dispatchEvent(event);
    expect(mockCropDetection.setSelectedImageIndex).toHaveBeenCalledWith(0);
  });

  it("cycles to previous image on ArrowLeft", () => {
    mockCropDetection.selectedImageIndex = 2;

    renderHook(() =>
      useCropKeyboardNav({
        workflowStep: "crop",
        images: mockImages,
        cropDetection: mockCropDetection,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true });
    window.dispatchEvent(event);
    expect(mockCropDetection.setSelectedImageIndex).toHaveBeenCalledWith(0);
  });

  it("toggles crop type on Space", () => {
    mockCropDetection.getFinalCrops = vi.fn().mockReturnValue([
      { imageIndex: 0, cropType: "face", cropRect: {} },
    ]);

    renderHook(() =>
      useCropKeyboardNav({
        workflowStep: "crop",
        images: mockImages,
        cropDetection: mockCropDetection,
      })
    );

    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true });
    window.dispatchEvent(event);
    expect(mockCropDetection.setCropType).toHaveBeenCalled();
    expect(mockCropDetection.resetCrop).toHaveBeenCalled();
  });

  it("does nothing on unrelated keys", () => {
    renderHook(() =>
      useCropKeyboardNav({
        workflowStep: "crop",
        images: mockImages,
        cropDetection: mockCropDetection,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
    window.dispatchEvent(event);
    expect(mockCropDetection.setSelectedImageIndex).not.toHaveBeenCalled();
  });
});
