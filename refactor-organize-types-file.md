# Refactor: Organize `CaptionStudioTypes.ts`

## Rule
`struct-single-responsibility` — A single file should not mix types, constants, and utility functions.

## Current State

`src/components/CaptionStudioTypes.ts` contains three distinct categories:
1. **Interfaces** — `ModelInfo`, `ImageFile`, `ProgressState`, `ToastState`, `ImageStatus`
2. **Constants** — `ALLOWED_EXTENSIONS`, `PROMPT_PREFIX_DEFAULT`, `TOAST_DURATION`
3. **Utilities** — `getFileExtension()`, `formatDuration()`

## Proposed Structure

### Option A: Split into 3 files (recommended)

```
src/components/
  CaptionStudioTypes.ts      — interfaces only
  CaptionStudioConstants.ts  — constants only
  CaptionStudioUtils.ts      — utility functions only
```

- `CaptionStudioTypes.ts` keeps all interfaces + re-exports from the other two for backward compatibility:
  ```typescript
  export * from "./CaptionStudioConstants";
  export * from "./CaptionStudioUtils";
  // interfaces defined inline
  ```

### Option B: Add section headers only (minimal)

If splitting feels too disruptive, at minimum add clear section separators:
```typescript
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// [interfaces]

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// [constants]

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
// [utility functions]
```

This already exists but could use stronger documentation that the file is intentionally mixed and why.

## Also Move: `ContentMode` type

**From:** `src/components/hooks/useAppConfig.ts`
**To:** `src/components/CaptionStudioTypes.ts`

`ContentMode = "sfw" | "nsfw"` is a shared type that belongs with other shared types, not inside a hook file.

## Files Affected
- `src/components/CaptionStudioTypes.ts` (primary)
- `src/components/hooks/useAppConfig.ts` (move `ContentMode` out)
- All files that import from any of the above (update import paths)

## Acceptance Criteria
- All existing imports still resolve (use re-exports if needed).
- `ContentMode` is importable from `CaptionStudioTypes`.
- `bun run lint` passes.
- `bun run test` passes.
- `bun run build` succeeds.
