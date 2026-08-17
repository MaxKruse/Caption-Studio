import { CaptionResult, formatTokens } from "@/lib/caption-result";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KvCacheStatsProps {
  results: CaptionResult[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Batch-wide llama.cpp KV cache reuse stats (one line under the results).
 * Hidden until the first completion event reports prompt token usage.
 */
export function KvCacheStats({ results }: KvCacheStatsProps) {
  const cachedTotal = results.reduce((s, r) => s + (r.cachedTokens ?? 0), 0);
  const promptTotal = results.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  if (promptTotal === 0) return null;
  const pct = Math.round((cachedTotal / promptTotal) * 100);

  return (
    <p className="text-center text-xs text-slate-500">
      KV cache: {formatTokens(cachedTotal)}/{formatTokens(promptTotal)} prompt
      tokens reused ({pct}%)
    </p>
  );
}
