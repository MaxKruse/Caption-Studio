import { useCallback, useRef, useState } from "react";
import { ALLOWED_EXTENSIONS, getFileExtension, ImageFile } from "../CaptionStudioTypes";
import { resizeImage } from "@/lib/image-client-utils";

export interface UseImageUploadOptions {
  isProcessing: boolean;
}

export function useImageUpload({ isProcessing }: UseImageUploadOptions) {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -----------------------------------------------------------------------
  // Process files (shared by file input and drag-drop)
  // -----------------------------------------------------------------------
  const processFiles = useCallback((fileList: FileList | File[]) => {
    if (fileList.length === 0) return;

    const newImages: ImageFile[] = [];
    const rejected: string[] = [];
    let loaded = 0;
    const total = fileList.length;

    for (const file of Array.from(fileList)) {
      const ext = getFileExtension(file.name);
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        rejected.push(file.name);
        loaded++;
        continue;
      }

      // Create a small preview for the UI (max 1440px biggest dimension)
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        const previewUrl = await resizeImage(result).catch(() => result);

        newImages.push({
          name: file.name,
          file: file,
          preview: previewUrl,
        });
        loaded++;

        if (loaded === total) {
          setImages((prev) => [...prev, ...newImages]);
          if (rejected.length > 0) {
            // Error message is handled by the parent component
          }
        }
      };
      reader.onerror = () => {
        rejected.push(file.name);
        loaded++;
        if (loaded === total) {
          setImages((prev) => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Drag and drop handlers
  // -----------------------------------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      if (isProcessing) return;
      processFiles(e.dataTransfer.files);
    },
    [isProcessing, processFiles]
  );

  // -----------------------------------------------------------------------
  // Remove an image
  // -----------------------------------------------------------------------
  const removeImage = useCallback((name: string) => {
    setImages((prev) => prev.filter((img) => img.name !== name));
  }, []);

  // -----------------------------------------------------------------------
  // Clear all images
  // -----------------------------------------------------------------------
  const clearAll = useCallback(() => {
    setImages([]);
  }, []);

  return {
    images,
    dragOver,
    galleryOpen,
    setGalleryOpen,
    clearAllConfirm,
    setClearAllConfirm,
    processFiles,
    removeImage,
    clearAll,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    fileInputRef,
  };
}
