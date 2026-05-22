# Refactor: Remove Duplicate Keyboard Navigation

## Rule
`cond-consolidate` — Consolidate duplicate conditional fragments.

## The Problem

Keyboard navigation for the image preview modal is implemented in **two places**:

### 1. `usePreviewKeyboardNav` hook (`src/components/hooks/usePreviewKeyboardNav.ts`)
- Listens for `Escape`, `ArrowLeft`, `ArrowRight`
- Called from `CaptionStudio.tsx`
- Navigates via `onNavigate(index)`

### 2. `ImagePreviewModal` component (`src/components/ImagePreviewModal.tsx`)
- Has its own `useEffect` with `keydown` listener
- Handles `ArrowLeft`, `ArrowRight` (but NOT Escape — Escape is handled by `onClose` on the backdrop click)
- Navigates via `onNavigate(currentIndex ± 1)`

**Result:** Two `keydown` event listeners fire simultaneously when the modal is open. Arrow keys trigger navigation twice.

## What to Do

1. **Remove** the `useEffect` keyboard handler from `ImagePreviewModal.tsx` entirely.
2. **Verify** that `usePreviewKeyboardNav` already handles `Escape` → `onClose()`. If not, add it.
3. **Verify** that arrow key navigation in `usePreviewKeyboardNav` works correctly with boundary checks (no wrap-around at first/last image).

## Files Affected
- `src/components/ImagePreviewModal.tsx` — remove the keyboard `useEffect`
- `src/components/hooks/usePreviewKeyboardNav.ts` — ensure it handles all keys (Escape + arrows)
- `src/components/CaptionStudio.tsx` — no changes needed if hook is already wired correctly

## Acceptance Criteria
- Pressing arrow keys in the modal navigates exactly once per keypress.
- Escape still closes the modal.
- Boundary behavior: ArrowLeft on first image and ArrowRight on last image are no-ops.
- `bun run build` succeeds.
