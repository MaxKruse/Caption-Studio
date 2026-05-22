import { useEffect } from "react";

import type { ImageFile } from "../CaptionStudioTypes";

// ---------------------------------------------------------------------------
// usePreviewKeyboardNav — keyboard shortcuts for image preview modal
//
// Escape closes the modal; arrow keys navigate between images.
// ---------------------------------------------------------------------------

export function usePreviewKeyboardNav({
  previewImage,
  allImages,
  onClose,
  onNavigate,
}: {
  previewImage: ImageFile | null;
  allImages: ImageFile[];
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  useEffect(() => {
    if (!previewImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        const idx = allImages.findIndex((img) => img.name === previewImage.name);
        if (idx > 0) {
          e.preventDefault();
          onNavigate(idx - 1);
        }
      } else if (e.key === "ArrowRight") {
        const idx = allImages.findIndex((img) => img.name === previewImage.name);
        if (idx < allImages.length - 1) {
          e.preventDefault();
          onNavigate(idx + 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage, allImages, onClose, onNavigate]);
}
