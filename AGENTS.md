<!-- BEGIN:nextjs-agent-rules -->
<!-- This is NOT the Next.js you know -->
<!-- This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. -->
<!-- END:nextjs-agent-rules -->

# Caption-Studio — Agent Instructions

## What This Project Is

A batch captioning tool for llama.cpp vision models: web UI (Next.js App Router + React) plus the **llama.cpp server connectivity** layer (API routes + lib utilities). Two caption modes (Krea 2 three-phase pipeline, For Anima booru-tag enhancement) plus a face/body detection endpoint.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.6 (App Router only) |
| UI | React 19.2.4 |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`) |
| Package Manager | **Bun** (not npm, pnpm, or yarn) |
| Runtime | Bun 1.3 for dev/build; Docker image pinned to `oven/bun:1.3` and serves the Next.js standalone server (node) |
| Language | TypeScript 5 (strict mode) |
| Image Processing | sharp |

## Package Manager — Bun Only

- Use `bun install`, `bun add`, `bun remove`
- Run scripts with `bun run <script>`
- Run binaries with `bunx <binary>`
- **Do NOT** use `npm`, `yarn`, `pnpm`, or `npx`

## Repository Structure

```
src/
  app/
    api/
      caption/for-anima/route.ts — POST FormData (images + captions + config) → SSE stream
      caption/krea-2/route.ts    — POST FormData (images + config) → SSE stream
      detect/route.ts            — POST start detection job + GET ?jobId=<id> SSE progress
      download/route.ts          — GET ?sessionId=<id> streams zip of temp dir
      health/route.ts            — GET health check (temp dir writable, cleanup status)
      models/route.ts            — Model discovery proxy to /v1/models
      ping/route.ts              — GET liveness
      tag/route.ts               — WD Tagger proxy (For Anima workflow)
    home-client.tsx        — App shell (mode switching)
    page.tsx / layout.tsx  — Root page + layout
  components/              — krea2-mode, for-anima-mode, caption-viewer, kv-cache-stats,
                             image-uploader, model-selector, prompt-editor, server-check,
                             tag-stats, ui/*
  hooks/                   — use-session (in-memory UI state), use-server-check (polling)
  lib/
    llama-request.ts        — buildChatRequest(): id_slot pinning + cache_prompt + n_cache_reuse
    token-accumulate.ts     — applyTokenDelta(): client-side accumulation of delta token events
    caption-helpers.ts      — readFileBuffer, fetchWithTimeout, fetchWithRetry, streamResponse,
                              chatComplete (slot-pinned call + timeout + error mapping), sleep
    caption-route.ts        — parseCaptionRequest (multipart + Zod + images preamble),
                              handleSessionAbort (shared DELETE ?sessionId= handler)
    caption-result.ts       — shared client CaptionResult type, formatTokens, stopCaptionSession
    config-schema.ts        — Zod schemas (krea2ConfigSchema, forAnimaConfigSchema, detectConfigSchema)
    worker-pool.ts          — runWorkerPool(): shared parallel task pool (slot-pinned)
    session-registry.ts     — Active SSE session registry (abort controllers)
    temp-files.ts           — Session temp dirs under /tmp/caption-studio (30-min stale TTL only)
    image-utils.ts          — sharp conversion/resize (1536px default, maxImageDimension override)
    model-utils.ts          — fetchModels() (/v1/models primitive, typed error result),
                              parseParallelArgs(), getModelParallel() (non-throwing)
    sse.ts                  — createSseStream() factory
    rate-limiter.ts         — Per-IP rate limiting for discovery endpoints
    logger.ts               — Structured request logging
    url-utils.ts            — normalizeServerUrl(), toDockerHostUrl()
    detect-parsing.ts       — Bounding box parser (Gemma box_2d y-first, Qwen bbox_2d x-first)
    detection-prompts.ts    — Detection prompt builder
    detect-store.ts         — In-memory detection job store
    krea2-prompts.ts        — Phase 2/3 prompt builders
    krea2-system-prompt.ts  — Krea 2 system prompt
    anima-prompt.ts         — For Anima system + user prompts, assembleFinalCaption
    prompt-utils.ts         — Prompt text helpers
    string-utils.ts         — getExtension(), baseAndExt() (filename base/ext splitting)
    types.ts                — ModelInfo, CropRect
```

Top-level extras: `.env.example` (the three optional env vars), `tag-service/` (WD Tagger
microservice - Flask + ONNX Runtime, see `tag-service/README.md`),
`.github/workflows/ci.yml` (typecheck + lint + tests on push/PR).

## TypeScript Configuration

- **Strict mode**: All strict checks enabled
- **Path alias**: `@/*` maps to `./src/*`
- **Module resolution**: `bundler` mode, `esnext` modules
- **JSX**: `react-jsx` (automatic runtime)
- Run `bunx tsc --noEmit` to type-check

## Code Conventions

### Naming

- **Components**: PascalCase
- **Functions**: camelCase
- **Interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Files**: kebab-case

### File Organization

- Sections separated with `// ---------------------------------------------------------------------------` headers
- JSDoc on public functions and exports

### React Patterns

- `"use client"` directive at top of client components
- Server components are the default

## API Route Patterns

- Error responses: `Response.json({ error: "message" }, { status: code })`
- Input validation: early returns with 400 status
- URL normalization: strip trailing slashes and `/v1` suffix via `normalizeServerUrl()`
- SSE: `ReadableStream` with `TextEncoder`
- Outbound fetches: `cache: "no-store"`

## Architecture — Connectivity Layer

### Model Discovery

```
GET /api/models?serverUrl=http://localhost:8080
  → fetch("http://localhost:8080/v1/models")
  → filter for vision models (input_modalities includes "text" and "image")
  → return { models: [...] }
```

### Caption Job (shared flow for For Anima and Krea 2 modes)

Both modes share the same base flow:

1. Frontend sends `FormData` with `config` (JSON string), `imageNames` (JSON string), and `images` (File objects)
2. Server creates temp directory under `/tmp/caption-studio/<sessionId>/`
3. Images saved to disk with deduplicated names (base-name collision: `1.png` + `1.jpg` → `1.png` + `1_1.jpg`)
4. First SSE event sends `{ sessionId }` to frontend (immediately - `--parallel` discovery runs in the background)
5. Workers process images via API, stream token DELTAS back as SSE events (clients accumulate via `applyTokenDelta`)
6. On completion, caption `.txt` files written next to image files in temp dir
7. Temp dirs auto-cleaned 30 minutes after last activity (checked every 5 minutes; the only deletion path - no exit-handler wipe)

Each worker fetches `<serverUrl>/v1/chat/completions` via `buildChatRequest()` with:
- `stream: true` + `stream_options: { include_usage: true }` (detection uses `stream: false`)
- `id_slot: <workerIndex>` - pins the request to one llama.cpp slot for KV cache reuse
- `cache_prompt: true`, `n_cache_reuse: 256` - chunk-wise prompt KV reuse
- Messages array with `image_url` (data URL) + `text` content parts
- Timeouts: krea-2 phase 1 15 min, phases 2/3 5 min each; for-anima 5 min per image (short enhancement output); 5xx/429 retried via `fetchWithRetry`

Streaming response parsed for `delta.reasoning_content` and `delta.content` (plus the final usage chunk for `cachedTokens`/`promptTokens` stats). Completion events carry the stats; the UI shows the batch-wide KV cache reuse percentage.

### For Anima Mode

```
POST /api/caption/for-anima → FormData (images + caption files + JSON config), returns SSE stream
DELETE ?sessionId=<id>      → aborts session
```

Takes images + existing booru tag caption files. LLM generates natural language additions. Final caption = original tags + LLM addition.

### Krea 2 Mode (3-phase multi-turn pipeline)

```
POST /api/caption/krea-2 → FormData (images + JSON config), returns SSE stream
DELETE ?sessionId=<id>   → aborts session
```

Each image is processed through all 3 phases as a **single multi-turn conversation**:

**Turn 1 (Phase 1 - Captioning):** Image + user prompt -> initial caption. Image is sent as vision input.

**Turn 2 (Phase 2 - Refinement):** Conversation history + refine user message (references Phase 1 caption + character description). LLM strips character-consistent features. Image NOT re-sent - KV cache reuses the encoding from turn 1.

**Turn 3 (Phase 3 - Distillation):** Conversation history + distill user message (references Phase 2 caption). LLM distills into a concise (60-150 word) krea2-optimized prompt. This is the **inverse of prompt expansion**.

Each phase overwrites the same `<image>.txt` in the session dir (`writeCaption`), so the caption file in a downloaded ZIP is always the **Phase 3 distilled prompt**.

Parallel workers (up to 8 concurrent, clamped to the server's `--parallel`) each process one image through all 3 turns, pinned to their own slot (slotId = worker index) so the 3 phases reuse the same slot's KV cache. Config requires `characterDescription`.

### Download

```
GET /api/download?sessionId=<id>  → zips temp dir (img/ folder), streams as application/zip
```

The GET endpoint reads the temp directory, pairs each image with its `.txt` caption file, places them inside an `img/` folder in the ZIP, and streams the result. Touches the session's last-activity timestamp (extends the 30-minute cleanup window).

### Detection Job

```
POST /api/detect  → creates detection job, spawns workers, returns { jobId }
GET  /api/detect  → SSE stream (300ms poll interval), cleans up on done
```

Detection images scaled to 1024px max. Response parsed by `parseDetectionResponse()` handling both Gemma `box_2d` (y-first) and Qwen/OpenAI `bbox_2d` (x-first) formats.

### In-Memory Stores

- `detect-store.ts` — `Map<string, DetectionJob>` (detection jobs, cleaned on SSE close)
- `temp-files.ts` — `Map<string, SessionMeta>` (temp image sessions, 30min stale cleanup)

### Temp File System (`/tmp/caption-studio/`)

- Each caption session gets a unique directory (`/tmp/caption-studio/<sessionId>/`)
- Images saved with deduplicated names (base-name collision detection)
- Caption `.txt` files written alongside images during processing
- Auto-cleanup: directories removed 30 minutes after last activity
- Cleanup runs every 5 minutes. The sessions.json index is adopted on restart. The process does NOT delete session dirs on exit (a Docker rebuild must not destroy undownloaded results)

### Concurrency

Worker pool pattern - configurable 1-8 parallel API requests (default 4 for caption, 3 for detection), clamped to the server's `--parallel` discovered via /v1/models. Each worker is pinned to its own llama.cpp slot for deterministic KV cache reuse.

## Key Gotchas

### No Auth Header

The app does NOT send an `Authorization` header to the remote API. Auth must be handled server-side by the llama.cpp server.

### Single-Instance Only

In-memory store — multi-replica deployments will not work correctly.

### Image Format Handling

OpenAI-compatible APIs only accept PNG/JPEG. Non-compatible formats (WebP, GIF) are converted to JPEG (quality 90) via `sharp` before API calls. Max dimension: 1536px default (`API_MAX_DIMENSION`, sized to llama.cpp's default 8192 vision-token budget), overridable per request via the `maxImageDimension` config field (256-4096). Detection images are downscaled to 1024px.

### Before Writing Code

1. Check `node_modules/next/dist/docs/` for Next.js 16 API changes
2. Use `@/*` path alias for all src imports
3. Run `bun run typecheck` and `bun run lint` before committing
4. The fast test suite (`bun test`) stubs the llama.cpp server - run it before committing

### After Committing

5. Always redeploy the Docker container after commits that change application code:
   ```bash
   bun run docker:up   # docker compose up -d --build
   ```
