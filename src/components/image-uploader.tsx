/**
 * Image uploader with drag-and-drop and file picker support.
 * Displays thumbnails of uploaded images with remove buttons.
 */

"use client";

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  onImagesReady: (count: number) => void;
}

export function ImageUploader({ onImagesReady }: ImageUploaderProps) {
  const { state, addImage, removeImage, clearImages } = useSession();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );

      for (const file of imageFiles) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          addImage(dataUrl, file.name, file);
        };
        reader.readAsDataURL(file);
      }
    },
    [addImage]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [processFiles]
  );

  // Notify parent when images change
  if (state.images.length > 0) {
    onImagesReady(state.images.length);
  }

  return (
    <Card className="w-full">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-100">Upload Images</h3>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
            transition-colors min-h-[120px] flex flex-col items-center justify-center
            ${isDragging
              ? "border-indigo-400 bg-indigo-900/20"
              : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/30"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <span className="text-2xl mb-2">
            {isDragging ? "D" : "+"}
          </span>
          <p className="text-sm text-slate-400">
            {isDragging
              ? "Drop images here"
              : "Drag & drop images here, or click to browse"}
          </p>
        </div>

        {/* Image thumbnails */}
        {state.images.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">
                {state.images.length} image{state.images.length !== 1 ? "s" : ""} uploaded
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearImages}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Clear all
              </Button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
              {state.images.map((dataUrl, index) => (
                <div
                  key={index}
                  className="relative group aspect-square rounded-lg overflow-hidden border border-slate-600"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt={state.imageNames[index] || `Image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(index);
                    }}
                    className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[10px] text-slate-300 truncate block">
                      {state.imageNames[index]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
