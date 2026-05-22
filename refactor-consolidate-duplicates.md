# Refactor: Consolidate Duplicate Code

## Rule
`cond-consolidate` — Consolidate duplicate conditional fragments and shared logic.

## What to Consolidate

### 1. File Extension Helpers

**Two identical functions:**
- `getFileExtension(name: string)` in `src/components/CaptionStudioTypes.ts`
- `getExtension(filename: string)` in `src/lib/image-utils.ts`

Both split on `.`, pop the last part, and return lowercase.

**Action:**
- Keep one implementation in `src/lib/image-utils.ts` (server-side lib is the right home for shared utilities).
- Re-export it from `src/components/CaptionStudioTypes.ts` as `getFileExtension` for backward compatibility with existing imports, OR update all client-side callers to import from `@/lib/image-utils`.
- The kept function should be the one with the broader usage. Check which callers use which.

### 2. URL Normalization

**Pattern appears in 2 files:**
```typescript
url.replace(/\/+$/, "").replace(/\/v1$/, "")
```
- `src/app/api/caption/route.ts` (`processJob` function)
- `src/app/api/models/route.ts`

**Action:**
- Create `normalizeServerUrl(url: string): string` in `src/lib/store.ts` (or a new `src/lib/url-utils.ts`).
- Replace both inline occurrences with the function call.

### 3. Status Map Building

**Identical object construction in 2 route files:**
```typescript
statuses[filename] = {
  status: entry.status,
  caption: entry.caption,
  error: entry.error,
  prompt: entry.prompt,
  reasoningContent: entry.reasoningContent,
};
```
- `src/app/api/caption/route.ts` (inside SSE interval, ~line 175)
- `src/app/api/status/route.ts` (entire handler body)

**Action:**
- Create `buildStatusMap(job: CaptionJob): Record<string, { status: string; caption?: string; error?: string; prompt?: string; reasoningContent?: string }>` in `src/lib/store.ts`.
- Replace both occurrences with the function call.

## Files Affected
- `src/lib/image-utils.ts`
- `src/components/CaptionStudioTypes.ts`
- `src/lib/store.ts` (new functions added here)
- `src/app/api/caption/route.ts`
- `src/app/api/models/route.ts`
- `src/app/api/status/route.ts`

## Acceptance Criteria
- No duplicate logic remains for extension extraction, URL normalization, or status map building.
- All imports resolve correctly.
- `bun run test` passes.
- `bun run build` succeeds.
