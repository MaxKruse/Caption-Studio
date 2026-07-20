/**
 * Tests for Krea 2 re-captioning prompt builders.
 */

import { describe, test, expect } from "bun:test";
import {
  buildRecaptionSystemPrompt,
  buildRecaptionUserPrompt,
  type ImageCaptionPair,
} from "@/lib/krea2-prompts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildRecaptionSystemPrompt", () => {
  test("returns a non-empty string", () => {
    const prompt = buildRecaptionSystemPrompt();
    expect(prompt.length).toBeGreaterThan(0);
  });

  test("mentions removing consistent features", () => {
    const prompt = buildRecaptionSystemPrompt();
    expect(prompt.toLowerCase()).toContain("consistent");
  });

  test("mentions focusing on unique aspects", () => {
    const prompt = buildRecaptionSystemPrompt();
    expect(prompt.toLowerCase()).toContain("unique");
  });
});

describe("buildRecaptionUserPrompt", () => {
  const samplePairs: ImageCaptionPair[] = [
    { index: 0, name: "img001.jpg", caption: "A blonde woman smiling in a red dress" },
    { index: 1, name: "img002.jpg", caption: "A blonde woman sitting on a bench" },
    { index: 2, name: "img003.jpg", caption: "A blonde woman standing by the ocean" },
  ];

  const sampleDesc = "A young woman with long blonde hair, blue eyes, and fair skin. She often wears elegant dresses.";

  test("includes the character description", () => {
    const prompt = buildRecaptionUserPrompt(sampleDesc, samplePairs);
    expect(prompt).toContain("long blonde hair");
    expect(prompt).toContain("blue eyes");
  });

  test("includes all image-caption pairs", () => {
    const prompt = buildRecaptionUserPrompt(sampleDesc, samplePairs);
    expect(prompt).toContain("--- Image [0] (img001.jpg) ---");
    expect(prompt).toContain("Original caption: A blonde woman smiling in a red dress");
    expect(prompt).toContain("--- Image [1] (img002.jpg) ---");
    expect(prompt).toContain("--- Image [2] (img003.jpg) ---");
  });

  test("requests JSON output format", () => {
    const prompt = buildRecaptionUserPrompt(sampleDesc, samplePairs);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("index");
    expect(prompt).toContain("caption");
  });

  test("handles single image pair", () => {
    const pairs: ImageCaptionPair[] = [
      { index: 5, name: "solo.jpg", caption: "Solo image caption" },
    ];
    const prompt = buildRecaptionUserPrompt(sampleDesc, pairs);
    expect(prompt).toContain("--- Image [5] (solo.jpg) ---");
    expect(prompt).toContain("1 image-caption");
  });

  test("handles 8 image pairs (full bucket)", () => {
    const pairs: ImageCaptionPair[] = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      name: `img${i}.jpg`,
      caption: `Caption for image ${i}`,
    }));
    const prompt = buildRecaptionUserPrompt(sampleDesc, pairs);
    expect(prompt).toContain("8 image-caption");
    for (let i = 0; i < 8; i++) {
      expect(prompt).toContain(`--- Image [${i}] (img${i}.jpg) ---`);
    }
  });

  test("preserves image indices (not zero-based within bucket)", () => {
    // Indices should be the global indices, not renumbered within the bucket
    const pairs: ImageCaptionPair[] = [
      { index: 4, name: "img4.jpg", caption: "Fourth image" },
      { index: 5, name: "img5.jpg", caption: "Fifth image" },
      { index: 6, name: "img6.jpg", caption: "Sixth image" },
      { index: 7, name: "img7.jpg", caption: "Seventh image" },
      { index: 8, name: "img8.jpg", caption: "Eighth image" },
    ];
    const prompt = buildRecaptionUserPrompt(sampleDesc, pairs);
    expect(prompt).toContain("--- Image [4] (img4.jpg) ---");
    expect(prompt).toContain("--- Image [8] (img8.jpg) ---");
  });
});
