import type { DetectionResult } from "@/components/CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// Confidence warning
// ---------------------------------------------------------------------------

/** Threshold below which an average confidence triggers a warning message. */
export const CONFIDENCE_WARNING_THRESHOLD = 0.60;

/**
 * Build a low-confidence warning message from detection results.
 * Returns null when all categories are above the confidence threshold.
 */
export function buildLowConfidenceWarning(
  results: DetectionResult[]
): string | null {
  const validResults = results.filter((r) => !r.error);
  if (validResults.length === 0) return null;

  const categories: Array<{ name: string; avgConfidence: number; count: number }> = [];

  // Compute average face confidence
  const faceConfidences = validResults.flatMap((r) => r.faceBoxes.map((b) => b.confidence));
  if (faceConfidences.length > 0) {
    const avg = faceConfidences.reduce((sum, c) => sum + c, 0) / faceConfidences.length;
    categories.push({ name: "face", avgConfidence: avg, count: faceConfidences.length });
  }

  // Compute average body confidence
  const bodyConfidences = validResults.flatMap((r) => r.bodyBoxes.map((b) => b.confidence));
  if (bodyConfidences.length > 0) {
    const avg = bodyConfidences.reduce((sum, c) => sum + c, 0) / bodyConfidences.length;
    categories.push({ name: "body", avgConfidence: avg, count: bodyConfidences.length });
  }

  const lowConfidence = categories.filter((c) => c.avgConfidence < CONFIDENCE_WARNING_THRESHOLD);
  if (lowConfidence.length === 0) return null;

  const parts = lowConfidence.map((c) =>
    `${c.name} (avg ${(c.avgConfidence * 100).toFixed(0)}% across ${c.count} detection(s))`
  );
  return `Low detection confidence for: ${parts.join(", ")}. The body/face crop split will still be respected, but consider using images with clearer ${lowConfidence.map((c) => c.name).join("/")} visibility for better results.`;
}
