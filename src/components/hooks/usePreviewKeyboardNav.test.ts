import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreviewKeyboardNav } from "./usePreviewKeyboardNav";
import type { ImageFile } from "../CaptionStudioTypes";

// ---------------------------------------------------------------------------
// usePreviewKeyboardNav — keyboard navigation in preview modal
// ---------------------------------------------------------------------------

describe("usePreviewKeyboardNav", () => {
  const createMockImage = (name: string): ImageFile =>
    ({
      name,
      file: new File([""], name, { type: "image/png" }),
      preview: "",
      detection: undefined,
    }) as unknown as ImageFile;

  const mockImages = [
    createMockImage("a.png"),
    createMockImage("b.png"),
    createMockImage("c.png"),
  ];

  let onClose: () => void;
  let onNavigate: (index: number) => void;

  beforeEach(() => {
    onClose = vi.fn();
    onNavigate = vi.fn();
  });

  it("does not register listeners when no preview image", () => {
    renderHook(() =>
      usePreviewKeyboardNav({
        previewImage: null,
        allImages: mockImages,
        onClose,
        onNavigate,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes modal on Escape", () => {
    renderHook(() =>
      usePreviewKeyboardNav({
        previewImage: mockImages[1],
        allImages: mockImages,
        onClose,
        onNavigate,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    window.dispatchEvent(event);
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates previous on ArrowLeft", () => {
    renderHook(() =>
      usePreviewKeyboardNav({
        previewImage: mockImages[1],
        allImages: mockImages,
        onClose,
        onNavigate,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true });
    window.dispatchEvent(event);
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it("navigates next on ArrowRight", () => {
    renderHook(() =>
      usePreviewKeyboardNav({
        previewImage: mockImages[1],
        allImages: mockImages,
        onClose,
        onNavigate,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
    window.dispatchEvent(event);
    expect(onNavigate).toHaveBeenCalledWith(2);
  });

  it("does not navigate left from first image", () => {
    renderHook(() =>
      usePreviewKeyboardNav({
        previewImage: mockImages[0],
        allImages: mockImages,
        onClose,
        onNavigate,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true });
    window.dispatchEvent(event);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate right from last image", () => {
    renderHook(() =>
      usePreviewKeyboardNav({
        previewImage: mockImages[2],
        allImages: mockImages,
        onClose,
        onNavigate,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
    window.dispatchEvent(event);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
