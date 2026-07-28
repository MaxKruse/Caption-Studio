<!-- BEGIN:nextjs-agent-rules -->
<!-- This is NOT the Next.js you know -->
<!-- This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. -->
<!-- END:nextjs-agent-rules -->

# Caption-Studio — Agent Instructions

## What This Project Is

Scaffolding for a new app. Retains only the **llama.cpp server connectivity** layer (API routes + lib utilities). The UI layer has been removed and will be rewritten.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.6 (App Router only) |
| UI | React 19.2.4 |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`) |
| Package Manager | **Bun** (not npm, pnpm, or yarn) |
| Runtime | Bun for dev/build, Node 22 for production |
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
      caption/route.ts   — POST start job + GET SSE progress + DELETE abort
      caption/simple/    — POST FormData (images + config) → SSE stream
      caption/multi-step — POST FormData (images + config) → SSE stream
      detect/route.ts    — POST start detection + GET SSE progress
      download/route.ts  — GET ?sessionId=<id> zip temp dir / POST legacy base64
      models/route.ts    — Model discovery proxy to /v1/models
    globals.css          — Minimal Tailwind v4 import
    layout.tsx           — Root layout
    page.tsx             — Placeholder home page
  lib/
    url-utils.ts            — normalizeServerUrl() (strip /v1 and trailing /)
    types.ts                — ModelInfo, CropRect
    store.ts                — In-memory caption job store (Map-based)
    detect-store.ts         — In-memory detection job store
    temp-files.ts           — Session temp dir management (upload, dedup, cleanup)
    image-utils.ts          — Image format conversion + resize (sharp)
    detect-parsing.ts       — Bounding box response parser (Gemma + Qwen formats)
    detection-prompts.ts    — Detection prompt builder
    string-utils.ts         — getExtension()
```

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

### Caption Job (simple and multi-step modes)

```
POST /api/caption/simple     → FormData (images + JSON config), returns SSE stream
POST /api/caption/multi-step → FormData (images + JSON config), returns SSE stream
DELETE ?sessionId=<id>       → aborts session
```

**Flow:**
1. Frontend sends `FormData` with `config` (JSON string), `imageNames` (JSON string), and `images` (File objects)
2. Server creates temp directory under `/tmp/caption-studio/<sessionId>/`
3. Images saved to disk with deduplicated names (base-name collision: `1.png` + `1.jpg` → `1.png` + `1_1.jpg`)
4. First SSE event sends `{ sessionId }` to frontend
5. Workers process images via API, stream tokens back as SSE events
6. On completion, caption `.txt` files written next to image files in temp dir
7. Temp dirs auto-cleaned 30 minutes after last activity (checked every 5 minutes)

Each worker fetches `<serverUrl>/v1/chat/completions` with:
- `stream: true`
- `stream_options: { include_usage: true }`
- Messages array with `image_url` (data URL) + `text` content parts
- 5-minute timeout per image via `AbortController`

Streaming response parsed for `delta.reasoning_content` and `delta.content`.

### Krea 2 Mode (3-phase multi-turn pipeline)

```
POST /api/caption/krea-2 → FormData (images + JSON config), returns SSE stream
DELETE ?sessionId=<id>   → aborts session
```

Each image is processed through all 3 phases as a **single multi-turn conversation**:

**Turn 1 (Phase 1 - Captioning):** Image + user prompt -> initial caption. Image is sent as vision input.

**Turn 2 (Phase 2 - Refinement):** Conversation history + refine user message (references Phase 1 caption + character description). LLM strips character-consistent features. Image NOT re-sent - KV cache reuses the encoding from turn 1.

**Turn 3 (Phase 3 - Distillation):** Conversation history + distill user message (references Phase 2 caption). LLM distills into a concise (60-150 word) krea2-optimized prompt. This is the **inverse of prompt expansion**.

Parallel workers (up to 8 concurrent) each process one image through all 3 turns. Config requires `characterDescription`.

### Download

```
GET /api/download?sessionId=<id>  → zips temp dir (img/ folder), streams as application/zip
POST /api/download                → legacy base64 mode (kept for compat)
```

The GET endpoint reads the temp directory, pairs each image with its `.txt` caption file, places them inside an `img/` folder in the ZIP, and streams the result. Touches the session's last-activity timestamp (extends the 30-minute cleanup window).

### Detection Job

```
POST /api/detect  → creates detection job, spawns workers, returns { jobId }
GET  /api/detect  → SSE stream (300ms poll interval), cleans up on done
```

Detection images scaled to 1024px max. Response parsed by `parseDetectionResponse()` handling both Gemma `box_2d` (y-first) and Qwen/OpenAI `bbox_2d` (x-first) formats.

### In-Memory Stores

- `store.ts` — `Map<string, CaptionJob>` (caption jobs, 24h stale cleanup)
- `detect-store.ts` — `Map<string, DetectionJob>` (detection jobs, cleaned on SSE close)
- `temp-files.ts` — `Map<string, SessionMeta>` (temp image sessions, 30min stale cleanup)

### Temp File System (`/tmp/caption-studio/`)

- Each caption session gets a unique directory (`/tmp/caption-studio/<sessionId>/`)
- Images saved with deduplicated names (base-name collision detection)
- Caption `.txt` files written alongside images during processing
- Auto-cleanup: directories removed 30 minutes after last activity
- Cleanup runs every 5 minutes + on process exit

### Concurrency

Worker pool pattern — configurable 1-8 parallel API requests (default 4 for caption, 3 for detection).

## Key Gotchas

### No Auth Header

The app does NOT send an `Authorization` header to the remote API. Auth must be handled server-side by the llama.cpp server.

### Single-Instance Only

In-memory store — multi-replica deployments will not work correctly.

### Image Format Handling

OpenAI-compatible APIs only accept PNG/JPEG. Non-compatible formats (WebP, GIF) are converted to JPEG (quality 90) via `sharp` before API calls. Max dimension: 3072px.

### Before Writing Code

1. Check `node_modules/next/dist/docs/` for Next.js 16 API changes
2. Use `@/*` path alias for all src imports
3. Run `bun run lint` before committing

### After Committing

4. Always redeploy the Docker container after commits that change application code:
   ```bash
   docker compose up -d --build
   ```
