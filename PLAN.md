# Refactor Testing Plan

## Goal

Verify the shared-utilities refactor (commit `34ec9cb`) does not break any behavior.
Strategy: write unit tests against the **current** (pre-refactor) code, confirm they pass,
then apply the refactor and confirm they still pass.

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
