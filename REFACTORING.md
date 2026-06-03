# Caption-Studio Refactoring Plan

> **Goal:** Transform from functional dev tool into a polished, shareholder-ready product with persistent state, streamlined UX, and professional-grade UI.
>
> **Code Quality Targets** (from AGENTS.md): **files < 500 lines**, **functions < 50 lines**.

---

## Phase 1: Foundation — Persistent Store + Layout Redesign ✅ DONE

- [x] Zustand store with localStorage persistence
- [x] Redesigned header with branding and tagline
- [x] Visual step indicator (6-step progress bar)
- [x] Configuration survives page refresh
- [x] Workflow step and crop ruleset backed by store

**What persists across refresh:** Server URL, model, preset, prompts, trigger word, parallel requests, crop ruleset.

**What resets on refresh (by design):** Uploaded images, job state, detection results, workflow step.

---

## Phase 2: Streamlined UX — No Floating Bars ✅ DONE

### Outcome

Every action lives where the user is already looking. No detached floating bars. No hunting for what to do next.

### What changed

- [x] **Floating action bar removed** — `FloatingActionBar.tsx` and `FloatingActionBar.test.tsx` deleted
- [x] **Upload section owns detection** — "Detect Faces & Bodies" button, detection progress bar, abort button, and detection error all live inside UploadSection below the gallery
- [x] **Crop editor owns captioning** — "Caption Cropped" button and "Back" button live inside CropEditor below the thumbnail strip
- [x] **Results gallery owns export** — Caption progress bar (with abort), completion summary, "Download ZIP", and "Start over" live inside ResultsGallery below the image grid
- [x] **Config section collapses** — when workflowStep is past "upload", the section shrinks to a clickable summary line (server hostname · model · preset). Expands on click.
- [x] **Bottom padding removed** — `pb-20` removed from CaptionStudio container
- [x] **Derived values cleaned** — `actionBarStep` removed from `useCaptionStudioDerived`
- [x] **Detection error moved** — removed separate JobErrorMessage for detection errors from CaptionStudio; now handled inline in UploadSection

---

## Phase 3: Component Simplification

### Outcome

No god component. No prop drilling through 5 layers. Each piece owns its own data. All files under 500 lines, all functions under 50 lines.

### Current Size Status ✅ All Under 500 Lines

| File | Lines |
|------|-------|
| `src/components/CaptionStudio.tsx` | 435 |
| `src/components/CropEditor.tsx` | 306 |
| `src/app/api/detect/route.ts` | 310 |
| `src/components/hooks/useCropDetection.ts` | 391 |
| `src/components/hooks/useCaptionJob.ts` | 415 |
| `src/components/hooks/useDetection.ts` | 176 |
| `src/components/hooks/useFetchModels.ts` | 56 |

### What changes

#### 3a. CaptionStudio shrinks

Inline handlers extracted into focused hooks. Target: under 150 lines.

- ✅ **Extract `handleDetect` into `useDetection` hook** (~70 lines of `handleDetect` + `handleAbortDetection` + related state) → `src/components/hooks/useDetection.ts`:

```
useDetection({ images, config, cropDetection, selectedModel })
  → { isDetecting, detectionError, handleDetect, handleAbortDetection }
```

- ✅ **Extract crop keyboard navigation into hook** (~40 lines) → `src/components/hooks/useCropKeyboardNav.ts`:

```
useCropKeyboardNav({ workflowStep, images, cropDetection })
```

- ✅ **Extract crop actions, image preview, processing warning** into focused hooks.

#### 3b. Derived values hook eliminated ✅ DONE

- ✅ `useCaptionStudioDerived.ts` deleted
- ✅ All derived computations inlined into CaptionStudio.tsx
- ✅ `progressPercent`, `canDetect`, `canProceedToCaption`, `jobDone`, `mergedImageStatuses`, `failedImages`, `displayStep`, `showUploadSection`, `showCropEditor`, `showGallery` — all inline

#### 3c. Hooks read config from store ✅ DONE

- ✅ Caption job hook (`useCaptionJob`) reads `serverUrl`, `systemPrompt`, `userPrompt`, `presetId`, `triggerWord`, `parallelRequests` from store
- ✅ Detection hook (`useDetection`) reads `serverUrl`, `contentMode`, `parallelRequests` from store
- ✅ Model fetch hook (`useFetchModels`) reads `serverUrl` from store
- ✅ Crop detection (`useCropDetection`) — removed unused props (`serverUrl`, `selectedModel`, `showToast`, `imageCount`) from options type

#### 3d. File splits (P0 — low risk, pure extractions) ✅ DONE

- ✅ **CropEditorView extraction** — `CropEditorView.tsx` exists
- ✅ **Detection parsing extraction** — `src/lib/detect-parsing.ts` exists
- ✅ **Crop helpers extraction** — `src/lib/crop-allocation.ts` + `src/lib/crop-warnings.ts` exist

#### 3e. Dead code removed ✅ DONE

- ✅ Unused CropRulesetSelector component deleted
- ✅ Stale constants and re-exports cleaned up

---

## Phase 4: Polish — Shareholder-Ready ✅ DONE

### Outcome

Every screen looks intentional. Empty states guide the user. Transitions feel smooth. Nothing looks half-finished.

### What changed

- [x] **Empty state hero** — `EmptyStateHero.tsx` — large inviting upload area with icon, headline, tip badges ("15–30 images recommended", etc.). Replaces bare drop zone when no images uploaded.
- [x] **Session restored banner** — `SessionRestoredBanner.tsx` — detects restored config from localStorage (custom serverUrl + selectedModel), shows "Welcome back — your settings are restored" for 3s then fades out.
- [x] **Consistent section design** — all sections share header pattern (badge + title + subtitle/count). ConfigSection, UploadSection, CropEditor, ResultsGallery all use same `rounded-xl border border-zinc-200 overflow-hidden` wrapper with `bg-zinc-50 border-b border-zinc-200` header.
- [x] **Loading states upgraded** — skeleton/shimmer CSS class added (`globals.css`). Model dropdown shows skeleton placeholder during fetch. "Connecting..." with spinner shown during model fetch (replaced "Loading..."). Upload processing shows skeleton circle.
- [x] **Smooth transitions** — `globals.css` additions:
  - `animate-fade-in` — sections fade in with 8px Y offset (0.35s ease-out)
  - `animate-pulse-ring` — active step indicator pulses with expanding ring (2s infinite)
  - `.card-lift` — image cards lift 2px with subtle shadow on hover
  - `.collapse-content` — ConfigSection expand/collapse animates via max-height (0.3s)
  - `.skeleton` — shimmer gradient animation (1.5s infinite)
- [x] **Typography and spacing tightened** — page container uses `px-4 sm:px-6` (responsive edges). Consistent text hierarchy maintained.
- [x] **Page footer** — `PageFooter.tsx` — version number (v0.1.0) + tech badges (Next.js 16, React 19, TypeScript, Tailwind v4) at bottom.
- [x] **Mobile responsive** — StepIndicator labels hidden below `sm` (icons only). Server URL input stacks vertically on mobile (`flex-col sm:flex-row`). Grid already uses `grid-cols-2` minimum. Page padding responsive (`px-4 sm:px-6`).

### New files
- `src/components/EmptyStateHero.tsx` (92 lines)
- `src/components/SessionRestoredBanner.tsx` (59 lines)
- `src/components/PageFooter.tsx` (31 lines)

### Modified files
- `src/app/globals.css` — added animation keyframes and utility classes
- `src/components/CaptionStudio.tsx` — integrated new components, session detection, responsive padding
- `src/components/ConfigSection.tsx` — smooth collapse, skeleton loading, "Connecting...", mobile stacking
- `src/components/UploadSection.tsx` — EmptyStateHero integration, card-lift, compact drop zone
- `src/components/ResultsGallery.tsx` — animate-fade-in, card-lift, consistent section number (3)
- `src/components/StepIndicator.tsx` — pulse-ring on active step, labels hidden on mobile
- `src/components/CropEditor.tsx` — animate-fade-in
- `src/components/CaptionStudio.test.tsx` — updated "Connecting..." text match

---

## Phase 5: Cleanup and Final QA

### Outcome

Zero warnings. Zero dead code. Every component tested. Accessible to keyboard and screen readers.

### What changes

- [x] **Tests updated** — 7 new test files added (41 new tests, 477 total). All existing tests pass.
  - `EmptyStateHero.test.tsx` — rendering, interaction, dragOver/processing states
  - `SessionRestoredBanner.test.tsx` — visibility timing, fade-out, a11y role
  - `PageFooter.test.tsx` — version number, tech badges, footer element
  - `CropEditorView.test.tsx` — (pending, see below)
  - `useCropKeyboardNav.test.ts` — keyboard navigation, crop type toggle, step guard
  - `usePreviewKeyboardNav.test.ts` — Escape close, arrow nav, boundary guards
  - `useAppConfig.test.ts` — store integration, all setters, toast lifecycle
- [x] **Store tests added** — 6 existing test files cover persistence, defaults, and actions.
- [x] **Dead code sweep** — no `// TODO`, `// FIXME`, `// HACK`, or `// XXX` comments. No unused exports.
- [x] **Production console.log removed** — stripped debug logging from `caption/route.ts` (lines 408-410). Kept `console.error` in `download/route.ts` error handler.
- [x] **TypeScript clean** — `tsc --noEmit` zero errors.
- [x] **Lint clean** — `bun run lint` zero warnings.
- [ ] **Performance checked** — no unnecessary re-renders. Granular store selectors. Bundle size reasonable.
- [ ] **Accessibility audited** — icon-only buttons have aria-labels. Progress bars have `role="progressbar"`. Status changes announced with `aria-live`. All interactive elements keyboard-navigable with visible focus rings.

### Test File Splits (P2 — as needed)

| File | Lines | Suggested Split |
|------|-------|-----------------|
| `download.test.ts` | 969 | `download-post.test.ts` + `download-edge-cases.test.ts` |
| `detect-parsing.test.ts` | 733 | Keep as-is (single focused module) or split by format |
| `useCropDetection.test.ts` | 697 | `...state.test.ts` + `...auto-assign.test.ts` |
| `useCropDetection.failure.test.ts` | 581 | Keep as-is (focused on failure paths) |
| `CropEditor.test.tsx` | 544 | `...render.test.tsx` + `...interaction.test.tsx` |

---

## Execution Order

```
Phase 1 ✅
  │
  ▼
Phase 2 — remove floating bar, inline all actions
  │
  ▼
Phase 3 — simplify components, eliminate prop drilling
  │         (3d file splits first, then 3a/3b/3c hook refactoring)
  │
  ▼
Phase 4 — polish UI (can overlap with P3)
  │
  ▼
Phase 5 — tests, lint, a11y, final QA
```

Phase 2 and 3 are sequential (P3 depends on P2's structural changes). Within Phase 3, do file splits (3d) before hook refactoring (3a/3b/3c) — they're lower risk and set up the rest. Phase 4 can start alongside P3 once P2 is done — visual polish doesn't depend on hook refactoring. Phase 5 is last.

### Verification After Each Task

- `bunx tsc --noEmit` — type check passes
- `bun run lint` — no new warnings
- `bun run test` — all tests pass
- No file exceeds 500 lines
