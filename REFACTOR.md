# Refactoring Plan

Guidelines from AGENTS.md: **files < 500 lines**, **functions < 50 lines**.

## Current Violations

### Source Files Over 500 Lines

| File | Lines | Over By |
|------|-------|---------|
| `src/components/CaptionStudio.tsx` | 610 | +110 |
| `src/components/CropEditor.tsx` | 556 | +56 |
| `src/app/api/detect/route.ts` | 529 | +29 |
| `src/components/hooks/useCropDetection.ts` | 520 | +20 |

### Functions Over 50 Lines

| Function | File | Lines |
|----------|------|-------|
| `handleDetect` | CaptionStudio.tsx | ~70 |
| `processDetectionJob` | detect/route.ts | ~55 |
| `captionImage` | caption/route.ts | ~48 |
| `CropEditorView` (render JSX) | CropEditor.tsx | ~100+ |
| `useCropDetection` (full hook body) | useCropDetection.ts | ~200+ |

---

## Refactoring Tasks

### Task 1: Extract `CropEditorView` into its own file

**Priority:** P0 — Clean split, low risk
**Target:** CropEditor.tsx 556 → ~300, new file ~250

- Move `CropEditorView` component (lines ~17–~260) to `src/components/CropEditorView.tsx`
- `CropEditor` remains in `CropEditor.tsx` with an import of `CropEditorView`
- No logic changes — purely a file split

**Files affected:**
- `src/components/CropEditor.tsx` (reduce)
- `src/components/CropEditorView.tsx` (new)

---

### Task 2: Extract detection parsing from `detect/route.ts`

**Priority:** P0 — Pure functions, already exported, already tested separately
**Target:** detect/route.ts 529 → ~300, new file ~230

Move the following into `src/lib/detect-parsing.ts`:
- `normalizeBoxEntry()`
- `classifyLabel()`
- `FACE_KEYWORDS` / `BODY_KEYWORDS` constants
- `extractBalanced()`
- `parseDetectionResponse()`

**Files affected:**
- `src/app/api/detect/route.ts` (reduce)
- `src/lib/detect-parsing.ts` (new)
- Update imports in `detect-parsing.test.ts` if needed

---

### Task 3: Refactor `CaptionStudio.tsx`

**Priority:** P1 — Largest file, most responsibilities
**Target:** CaptionStudio.tsx 610 → ~350

#### 3a. Extract `handleDetect` into `useDetection` hook

Move the detection workflow (~70 lines of `handleDetect` + `handleAbortDetection` + related state) into `src/components/hooks/useDetection.ts`:

```
useDetection({ images, config, cropDetection, selectedModel })
  → { isDetecting, detectionError, handleDetect, handleAbortDetection }
```

#### 3b. Extract crop keyboard navigation into hook

Move the crop-step keyboard `useEffect` (~40 lines) into `src/components/hooks/useCropKeyboardNav.ts`:

```
useCropKeyboardNav({ workflowStep, images, cropDetection })
```

#### 3c. Extract derived values into hook

Move the ~30 lines of computed booleans (`canDetect`, `canProceedToCaption`, `jobDone`, `mergedImageStatuses`, `failedImages`, `progressPercent`) into `src/components/hooks/useCaptionStudioDerived.ts`:

```
useCaptionStudioDerived({ captionJob, cropDetection, imageUpload, config, isDetecting, selectedModel })
  → { canDetect, canProceedToCaption, jobDone, progressPercent, mergedImageStatuses, failedImages, actionBarStep, ... }
```

**Files affected:**
- `src/components/CaptionStudio.tsx` (reduce)
- `src/components/hooks/useDetection.ts` (new)
- `src/components/hooks/useCropKeyboardNav.ts` (new)
- `src/components/hooks/useCaptionStudioDerived.ts` (new)

---

### Task 4: Split `useCropDetection.ts` helpers

**Priority:** P1 — Pure logic already exported
**Target:** useCropDetection.ts 520 → ~380, new file ~140

Move into `src/lib/crop-allocation.ts`:
- `FACE_CROP_PADDING` / `BODY_CROP_PADDING` constants
- `buildCropRectFromBestBox()`
- `buildCropRectFromBox()`
- `buildDefaultCrop()`
- `computeBoxQuality()`
- `allocateCropTypes()`

Move into `src/lib/crop-warnings.ts`:
- `CONFIDENCE_WARNING_THRESHOLD`
- `buildLowConfidenceWarning()`

Keep in `useCropDetection.ts`:
- Hook body, state management, SSE handlers, ruleset validation

**Files affected:**
- `src/components/hooks/useCropDetection.ts` (reduce)
- `src/lib/crop-allocation.ts` (new)
- `src/lib/crop-warnings.ts` (new)

---

### Task 5: Split large test files (lower priority)

**Priority:** P2 — Tests are naturally longer; split only if maintenance becomes hard

| File | Lines | Suggested Split |
|------|-------|-----------------|
| `download.test.ts` | 969 | `download-post.test.ts` + `download-edge-cases.test.ts` |
| `detect-parsing.test.ts` | 733 | Keep as-is (single focused module) or split by format |
| `useCropDetection.test.ts` | 697 | `...state.test.ts` + `...auto-assign.test.ts` |
| `useCropDetection.failure.test.ts` | 581 | Keep as-is (focused on failure paths) |
| `CropEditor.test.tsx` | 544 | `...render.test.tsx` + `...interaction.test.tsx` |

---

## Execution Order

1. **Task 1** — CropEditorView extraction (simplest, lowest risk)
2. **Task 2** — Parsing extraction (pure functions, already tested)
3. **Task 4** — Crop helpers extraction (pure functions, already exported)
4. **Task 3** — CaptionStudio refactor (most complex, do after deps are clean)
5. **Task 5** — Test file splits (as needed)

## Verification After Each Task

- `bunx tsc --noEmit` — type check passes
- `bun run lint` — no new warnings
- `bun run test` — all tests pass
- No file exceeds 500 lines
