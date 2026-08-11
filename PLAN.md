# Caption Studio - Living Improvement Plan

This document tracks technical, UI/UX and prompting improvements identified during repo analysis.
Items are prioritized roughly: Stability > Performance > UX > Prompting.

## Completed

- [x] Extract shared caption helpers to `src/lib/caption-helpers.ts`: `readFileBuffer`, `fetchWithTimeout`, `streamResponse`
- [x] Remove duplicated `replaceVariables` implementation from routes and tests. Placeholder replacement is deprecated - prompts are used as-is
- [x] Update `for-anima` and `krea-2` routes to import from shared helpers
- [x] Update `caption-helpers.test.ts` to import from shared lib
- [x] Extract `activeSessions` registry to `src/lib/session-registry.ts` with `registerSession`, `unregisterSession`, `abortSession`. Remove duplicated `Map` + interval from all routes
- [x] Extract SSE stream factory `createSseStream()` to `src/lib/sse.ts`. Unify SSE stream creation across routes
- [x] Sanitize filenames to prevent path traversal with `sanitizeFileName` in `src/lib/temp-files.ts`

## Technical - Stability & Maintainability

### Code duplication
- [x] Extract `activeSessions` registry to `src/lib/session-registry.ts` with `registerSession`, `unregisterSession`, `abortSession`. Remove duplicated `Map` + interval from all routes
- [x] Extract SSE stream factory `createSseStream()` to `src/lib/sse.ts`. Currently each route builds its own `ReadableStream` and `sendEvent`. Unify format
- [x] Extract `createSseStream` tests: verify event formatting, close behavior, no-op before start

### File I/O
- [ ] Replace sync `fs` calls in `temp-files.ts` with `fs.promises`. Avoid blocking event loop during batch uploads
- [ ] Add magic-byte validation for images before saving, not just extension
- [ ] Enforce per-session file size limits and max image count. Return 413 with clear message
- [ ] Make temp dir cleanup resilient to SIGKILL: persist session meta to a small JSON index so restart can resume cleanup

### API robustness
- [ ] Add Zod validation for all FormData configs. Return structured errors
- [ ] Add request ID and structured logging for SSE streams and API calls
- [ ] Implement retry with exponential backoff for 5xx/429 from llama.cpp. Currently only one retry for detection
- [ ] Use `AbortSignal.timeout` where possible instead of manual timeout controller
- [ ] Add health endpoint `GET /api/health` with temp dir writable check and cleanup status
- [ ] Add rate limiting per IP for model discovery and caption endpoints

### Performance
- [ ] Parallelise WD Tagger calls in For Anima mode. Currently sequential `for i` loop
- [ ] Stream ZIP download instead of buffering entire archive in memory
- [ ] Add per-image timeout per phase in Krea 2 to avoid 15 min worst case
- [ ] Add concurrency tuning UI: allow user to set parallel requests, cap at server parallel

### Security
- [x] Sanitize filenames to prevent path traversal. Current dedup uses base name but not full sanitization
- [ ] Validate image dimensions before loading into Sharp to avoid decompression bombs

## Technical - Testing

- [ ] Unit tests for `session-registry` and `createSseStream`
- [ ] Integration tests for `for-anima` route with mocked llama.cpp
- [ ] Add property tests for `deduplicateFileName` edge cases
- [ ] Add e2e Playwright tests for error states: server down, model missing, abort mid-batch

## UI / UX

### Progress & feedback
- [ ] Add progress bar with ETA using average processing time from `store.ts`
- [ ] Show per-image status icons, copy button, and inline edit for captions
- [ ] Show reasoning panel toggle per image, with token count
- [ ] Toast notifications for API errors, abort, and download complete
- [ ] Server check UI: show latency, model count, last successful poll

### Workflow
- [ ] Drag to reorder images, with re-numbering of captions
- [ ] Allow editing prompts per image batch and save as preset
- [ ] Prompt presets UI with import/export JSON
- [ ] Keyboard shortcuts: Ctrl+Enter start, Esc stop, Ctrl+S download
- [ ] Image zoom modal and preview during processing
- [ ] For Anima: allow skip tagging, use existing .txt files directly

### Accessibility & polish
- [ ] Add aria labels, focus rings, color-blind safe status indicators
- [ ] Mobile responsive phase indicator - horizontal scroll
- [ ] Autosave prompts and trigger words to localStorage
- [ ] Better empty states and error messages

## Prompting

### Krea 2
- [ ] Make system and user prompts configurable per preset, with prompt versioning
- [ ] Add temperature / top_p / max_tokens controls in UI, expose in API
- [ ] Truncate or summarize `characterDescription` and warn if > ~800 tokens
- [ ] Improve `buildRefineUserPrompt` with explicit negative instructions and example
- [ ] Add prompt preview with variable substitution removed - show final prompt before start

### For Anima
- [ ] Make system prompt editable per preset
- [ ] Normalize punctuation in `assembleFinalCaption` to avoid `..`
- [ ] Add linter for booru tags: warn on underscores vs spaces

### General
- [ ] Add prompt library UI with search and tags
- [ ] Log prompt version with session metadata for reproducibility
- [ ] Consider structured output for detection to reduce parsing fragility

## What to Test

### 1. `replaceVariables()` (duplicated in 4 route files)

Pure function - easiest to test. Verify placeholder substitution:
- `{image_name}` → actual filename
- `{index}` → 1-based index
- `{total}` → total count
- Multiple replacements in same string
- No-op when no placeholders present

### 2. `readFileBuffer()` (duplicated in 4 route files)

Trivial wrapper around `file.arrayBuffer()`. Test with a mock File:
- Returns correct buffer content
- Handles different file types

### 3. `fetchWithTimeout()` (duplicated in 4 route files)

Hard to test without mocking `global.fetch`. Two approaches:
- **Option A:** Skip unit tests (low risk - identical logic, no behavioral change)
- **Option B:** Mock `global.fetch` and `setTimeout` in test

Decision: **Option A** - the function is a thin wrapper with no branching logic that changes.

### 4. `streamResponse()` / SSE parsing (duplicated in 4 route files)

Core logic that parses SSE streams. Test with a mock ReadableStream:
- Accumulates `delta.content` tokens correctly
- Accumulates `delta.reasoning_content` tokens correctly
- Handles `[DONE]` sentinel
- Skips malformed JSON lines
- Returns null on abort signal
- Returns trimmed caption and reasoningContent

### 5. `activeSessions` registry (duplicated in 4 route files)

Test the shared registry pattern:
- `registerSession()` stores abort controller
- `unregisterSession()` removes it
- `abortSession()` aborts and removes
- `abortSession()` returns false for unknown sessions
- Cleanup interval removes aborted controllers

### 6. `createSseStream()` helper

Test the stream factory:
- Returns [stream, sendEvent, closeStream] tuple
- `sendEvent()` enqueues correctly formatted SSE data
- `closeStream()` closes the controller
- `sendEvent()` is a no-op before stream starts

### 7. `triggerDownload()` (duplicated in 4 components)

Hard to test in Node (needs `document.createElement`). Two approaches:
- **Option A:** Skip unit tests (identical logic, no behavioral change)
- **Option B:** Mock DOM APIs with jsdom

Decision: **Option A** - trivial function, zero risk.

### 8. `default-prompts.ts` (extracted from use-session.tsx)

Verify the extracted constants match the originals:
- `DEFAULT_SYSTEM_PROMPT` matches original
- `DEFAULT_USER_PROMPT` matches original
- `DEFAULT_MULTI_STEP_SYSTEM_PROMPT` matches original
- `DEFAULT_MULTI_STEP_MESSAGES` matches original

### 9. Integration: krea-2 route still works

End-to-end test mocking the llama.cpp API:
- POST with valid FormData returns SSE stream with `session` event
- POST with missing config returns 400
- POST with no images returns 400
- DELETE with valid sessionId aborts session
- DELETE with unknown sessionId returns 404

## Test Infrastructure

- **Runner:** Bun's built-in test runner (`bun test`)
- **Assertions:** `bun:test` built-in `expect`
- **Mocks:** Manual mocks (no jest/vitest needed)
- **Location:** `src/lib/__tests__/` for unit tests, `src/app/api/__tests__/` for integration

## Execution Order

1. Write tests against current (pre-refactor) code → all pass
2. Apply refactor commit (`34ec9cb`)
3. Run tests again → all still pass
4. If any fail, diagnose and fix

## Files to Create

```
src/lib/__tests__/
  caption-helpers.test.ts      (replaceVariables, readFileBuffer)
  sse-stream.test.ts           (streamResponse, createSseStream)
  caption-session.test.ts      (register/unregister/abortSession)
  default-prompts.test.ts      (extracted constants match originals)
src/app/api/__tests__/
  krea-2-route.test.ts         (POST/DELETE integration)
```
