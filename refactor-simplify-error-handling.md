# Refactor: Simplify Error Handling in Caption Route

## Rule
`error-separate-concerns` — Separate error handling from business logic.

## The Problem

`captionImage()` in `src/app/api/caption/route.ts` has nested try/catch blocks:

```
try {                              // Outer: image prep + API call
  prepare image
  try {                            // Inner: fetch with timeout
    fetch()
    parse response
    update status (completed)
  } catch (err) {
    clearTimeout
    if (AbortError) rethrow as timeout
    rethrow err
  }
} catch (error) {                  // Outer catch: mark as failed
  update status (failed)
}
```

The inner catch only exists to clear the timeout and re-wrap AbortError. This creates unnecessary nesting.

## What to Do

### Extract `fetchWithTimeout(url, options, timeoutMs)`

Create a small helper that encapsulates the timeout pattern:

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Rewrite `captionImage()` catch structure

After extraction:
```typescript
try {
  const { buffer, mimeType } = await prepareForApi(filename, entry.data);
  const base64 = buffer.toString("base64");
  const promptText = buildPromptText(job);
  const messages = buildApiMessages(job, base64, mimeType, promptText);

  const response = await fetchWithTimeout(
    `${baseUrl}/v1/chat/completions`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: job.model, messages }), cache: "no-store" },
    API_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const caption = (data?.choices?.[0]?.message?.content ?? "(empty response)").trim();
  const reasoningContent = data?.choices?.[0]?.message?.reasoning_content;
  updateImageStatus(jobId, filename, "completed", caption, undefined, promptText, reasoningContent);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "AbortError") {
    updateImageStatus(jobId, filename, "failed", undefined, `API request timed out after ${API_TIMEOUT_MS / 1000 / 60} minute(s)`);
  } else {
    updateImageStatus(jobId, filename, "failed", undefined, message);
  }
}
```

## Files Affected
- `src/app/api/caption/route.ts`

## Acceptance Criteria
- No nested try/catch blocks in `captionImage`.
- Timeout behavior is identical (5-minute timeout, same error message).
- `fetchWithTimeout` properly cleans up the timeout in all cases (success, error, abort).
- `bun run test` passes.
- `bun run build` succeeds.
