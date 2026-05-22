# Refactor: Extract Methods in Caption Route

## Rule
`struct-extract-method` + `struct-function-length` — Decompose long functions and extract pure helper functions.

## What to Extract

### Target File: `src/app/api/caption/route.ts`

### 1. Extract `captionImage()` (~100 lines → ~40 lines each)

The function currently does 4 things:
1. Prepares image for API (resize, format)
2. Builds prompt messages array
3. Makes HTTP call with timeout
4. Parses response and updates status

**Extract these pure functions:**

#### `buildApiMessages(job, imageBase64, mimeType, promptText)`
```typescript
// Returns: Array<Record<string, unknown>> (the messages array)
// Inputs: job config + prepared image data + prompt text
// Pure function — no side effects
```

#### `buildPromptText(job)`
```typescript
// Returns: string (the user text portion)
// Combines promptPrefix + captionName + userPrompt
// Pure function — testable in isolation
```

After extraction, `captionImage` should be a clear orchestration function:
```
prepare image → build prompt → build messages → fetch → parse → update status
```

### 2. Extract POST Handler Parsing (~100 lines)

The POST handler has two nearly identical branches (FormData vs JSON) that assign the same variables.

**Extract:**
#### `parseJobConfig(formData: FormData)` → JobConfig
#### `parseJobConfig(body: unknown)` → JobConfig

Where `JobConfig` is a local interface with all the config fields.

**After extraction**, the POST handler should be:
```typescript
const config = contentType.includes("multipart")
  ? await parseJobConfigFromFormData(formData)
  : await parseJobConfigFromJson(body);
// validate config
// create job
// fire and forget
```

## Files Affected
- `src/app/api/caption/route.ts`

## Acceptance Criteria
- `captionImage` is under 50 lines.
- `buildApiMessages` and `buildPromptText` are pure, testable functions.
- POST handler is under 40 lines.
- No behavior change — same output for same input.
- `bun run test` passes (especially `caption-post.test.ts`).
- `bun run build` succeeds.
