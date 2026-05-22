import { useCallback, useRef, useState } from "react";
import { ALLOWED_EXTENSIONS, getFileExtension, ImageFile } from "../CaptionStudioTypes";
import { createThumbnail } from "@/lib/image-client-utils";

export interface UseImageUploadOptions {
  isProcessing: boolean;
}

/** Max concurrent image resize operations to keep the UI responsive. */
const RESIZE_CONCURRENCY = 3;

export function useImageUpload({ isProcessing }: UseImageUploadOptions) {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -----------------------------------------------------------------------
  // Resize a single file into an ImageFile (non-blocking)
  // -----------------------------------------------------------------------
  const resizeOne = useCallback(async (file: File): Promise<ImageFile> => {
    // Create a small thumbnail for gallery display (max 480px, low quality)
    const preview = await createThumbnail(file).catch(() => URL.createObjectURL(file));
    // Yield between items so React can repaint
    await new Promise((r) => setTimeout(r, 0));
    return { name: file.name, file, preview };
  }, []);

  // -----------------------------------------------------------------------
  // Process files with a concurrency queue
  // -----------------------------------------------------------------------
  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const rejected: string[] = [];
      const validFiles: File[] = [];

      for (const file of files) {
        const ext = getFileExtension(file.name);
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          rejected.push(file.name);
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) return;

      setIsUploading(true);

      // Process with concurrency limit
      const queue = [...validFiles];
      const results: ImageFile[] = [];

      async function worker() {
        while (queue.length > 0) {
          const file = queue.shift()!;
          const img = await resizeOne(file);
          results.push(img);
          // Add each image immediately so the gallery updates incrementally
          setImages((prev) => [...prev, img]);
        }
      }

      // Launch N workers
      await Promise.all(
        Array.from({ length: Math.min(RESIZE_CONCURRENCY, validFiles.length) }, () =>
          worker()
        )
      );

      setIsUploading(false);
    },
    [resizeOne]
  );

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
    isUploading,
    processFiles,
    removeImage,
    clearAll,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    fileInputRef,
  };
}
