# Refactor: Split `useCaptionJob` Hook

## Rule
`struct-single-responsibility` + `struct-function-length` — One hook, too many responsibilities (~240 lines).

## Current Responsibilities

`useCaptionJob` in `src/components/hooks/useCaptionJob.ts` handles:
1. **SSE connection lifecycle** — EventSource creation, cleanup, message parsing
2. **Polling fallback** — 2-second interval polling `/api/status`
3. **Start captioning** — FormData construction, POST request
4. **Download ZIP** — fetch blob, trigger download, reset state
5. **Abort job** — close SSE, DELETE request, mark queued as failed
6. **Reset state** — clear all job-related state
7. **Error management** — showErrorLog toggle, jobError state

## Proposed Split

Keep `useCaptionJob` as the **orchestrator** but extract logic into smaller hooks:

### New: `useCaptionSSE(jobId)`
- Manages EventSource lifecycle
- Listens for SSE messages
- Updates progress and statuses
- Handles cleanup on unmount
- Returns: `{ progress, imageStatusesFromSSE }`

### New: `useCaptionActions(options)`
- `startCaptioning()` — FormData + POST
- `abortJob()` — SSE close + DELETE
- `downloadZip()` — fetch + download trigger
- Returns: `{ isProcessing, isDownloading, startCaptioning, abortJob, downloadZip }`

### Keep: `useCaptionJob(options)` — Orchestrator
- Creates state shared across sub-hooks (jobId, jobError, showErrorLog)
- Calls `useCaptionSSE(jobId)` and `useCaptionActions(options)`
- Exposes unified return interface (same as current)
- Should be under 80 lines

## Important Constraints
- **The public return interface of `useCaptionJob` must NOT change.** All existing callers (i.e., `CaptionStudio.tsx`) should work without modification.
- Sub-hooks are internal implementation detail — they don't need to be exported.
- If the split feels too invasive, a softer approach is acceptable: extract `startCaptioning`, `downloadZip`, and `abortJob` into separate `useCallback` wrappers that are clearly sectioned, even if they stay in the same file.

## Files Affected
- `src/components/hooks/useCaptionJob.ts` (primary)
- `src/components/CaptionStudio.tsx` (should not need changes)

## Acceptance Criteria
- `useCaptionJob` return type is identical to before.
- `CaptionStudio.tsx` works without modification.
- SSE cleanup still works on unmount.
- `bun run test` passes.
- `bun run build` succeeds.
