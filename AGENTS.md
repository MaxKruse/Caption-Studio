<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Caption-Studio — Agent Instructions

## What This Project Is

Batch image captioning tool. Users upload images, configure an OpenAI-compatible API, and generate captions for all images in one go. The UI is a single-page React app inside Next.js 16 App Router.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.6 (App Router only — no Pages Router) |
| UI | React 19.2.4 |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"` + `@theme inline`) |
| Package Manager | **Bun** (not npm, pnpm, or yarn) |
| Runtime | Bun for dev/build, Node 22 Alpine for Docker production |
| Language | TypeScript 5 (strict mode) |
| Image Processing | sharp |
| ZIP Generation | archiver |
| Testing | Vitest 4 + jsdom + @testing-library/react + @testing-library/jest-dom |
| Linting | ESLint 9 + eslint-config-next |

## Package Manager — Bun Only

- Use `bun install`, `bun add`, `bun add -d`, `bun remove`
- Run scripts with `bun run <script>`
- Run binaries with `bunx <binary>`
- **Do NOT** use `npm`, `yarn`, `pnpm`, or `npx`

## Repository Structure

```
src/
  app/
    api/
      caption/route.ts              — POST start job + GET SSE progress
      download/route.ts             — ZIP export
      models/route.ts               — Model discovery proxy
      status/route.ts               — Job status polling
    globals.css                     — Tailwind v4 + monochrome theme
    layout.tsx                      — Root layout (Inter font via next/font/google)
    page.tsx                        — Home page (renders <CaptionStudio />)
  components/
    CaptionStudio.tsx               — Main "use client" orchestrating component
    CaptionStudioTypes.ts           — Shared types, constants, utilities
    ConfigSection.tsx               — API configuration UI
    UploadSection.tsx               — Image upload gallery
    ProcessSection.tsx              — Processing controls & progress bar
    ImagePreviewModal.tsx           — Full-size image preview
    hooks/
      useCaptionJob.ts              — Caption job lifecycle (SSE, polling, download)
      useImageUpload.ts             — Image file handling & drag-drop
  lib/
    image-utils.ts                  — Image format conversion (sharp)
    store.ts                        — In-memory job store (Map-based)
public/                             — Static assets
```

## TypeScript Configuration

- **Strict mode**: All strict checks enabled
- **Path alias**: `@/*` maps to `./src/*` — use `@/` for all src imports
- **Module resolution**: `bundler` mode, `esnext` modules
- **JSX**: `react-jsx` (automatic runtime — no `import React` needed)
- **No implicit any**
- Run `bunx tsc --noEmit` to type-check

## Code Conventions

### Naming

- **Components**: PascalCase (`CaptionStudio`, `ConfigSection`, `ImageCard`)
- **Functions**: camelCase (`fetchModels`, `processFiles`, `startCaptioning`)
- **Interfaces**: PascalCase (`ModelInfo`, `ImageFile`, `ProgressState`)
- **Hook Options**: `Use<HookName>Options` (e.g., `UseCaptionJobOptions`)
- **Constants**: UPPER_SNAKE_CASE (`ALLOWED_EXTENSIONS`, `OPENAI_ACCEPTED`)
- **Files**: kebab-case for components/routes, camelCase for lib files
- **Tests**: `<source>.test.ts` / `<source>.test.tsx` co-located with source

### File Organization

- Sections separated with `// ---------------------------------------------------------------------------` and descriptive headers
- JSDoc on public functions and exports, not on private internals
- Custom hooks in `src/components/hooks/`
- Shared types in `src/components/CaptionStudioTypes.ts`

### React Patterns

- `"use client"` directive at top of client components
- Server components are the default (no directive)
- `useState` with `[value, setValue]` naming
- `useCallback` with proper dependency arrays
- `useRef` for DOM elements and mutable values
- `useEffect` for side effects with cleanup

### Styling

- **zinc color palette only** (zinc-50 through zinc-900) — no other color scales
- Inline Tailwind classes, no CSS modules
- Font: Inter via `next/font/google`
- Responsive via Tailwind breakpoints (`sm:`, etc.)

## API Route Patterns

- Error responses: `Response.json({ error: "message" }, { status: code })`
- Input validation: early returns with 400 status
- URL normalization: strip trailing slashes and `/v1` suffix
- SSE: `ReadableStream` with `TextEncoder`
- Outbound fetches: `cache: "no-store"`

## Testing

- Framework: Vitest 4 with jsdom environment, globals enabled
- Libraries: `@testing-library/react` + `@testing-library/jest-dom`
- Config: `vitest.config.ts` (has `@/*` alias)
- Run: `bun run test` (run) or `bun run test:watch` (watch)
- Test files co-located: `<name>.test.ts` next to source

## Architecture — Data Flow

```
Browser (Client)
  ├── Zustand Store (src/store/studioStore.ts) — persisted config + ruleset
  ├── ConfigSection  →  API URL, model, preset, prompts, trigger word
  ├── UploadSection  →  Image files (FormData), drag-drop
  ├── CropEditor     →  Manual crop box adjustments
  └── ResultsGallery →  Caption results, progress, download
        │
        ├── useImageUpload      →  file handling, drag-drop, validation
        ├── useDetection        →  face/body detection workflow
        ├── useCropDetection    →  crop state (ref-based for immediate reads)
        ├── useCaptionJob       →  single-job SSE, polling, download
        └── useMultiPresetJob   →  multi-preset sequential orchestration
              │
        fetch() / EventSource
              │
  Next.js API Routes
    ├── POST /api/caption     →  Start caption job, returns jobId
    ├── GET  /api/caption     →  SSE progress stream (500ms interval)
    ├── DELETE /api/caption   →  Abort job (marks queued as failed, deletes from memory)
    ├── POST /api/detect      →  Start detection job, returns jobId
    ├── GET  /api/detect      →  SSE progress stream (300ms interval)
    ├── GET  /api/status      →  Polling fallback for per-image status
    ├── GET  /api/models      →  Proxy to remote /v1/models (vision filter)
    └── POST /api/download    →  ZIP generation (images + .txt captions)
          │
  In-Memory Stores
    ├── src/lib/store.ts        — Map<string, CaptionJob> (caption jobs)
    ├── src/lib/detect-store.ts — detection jobs (cleaned after SSE close)
    └── Stale cleanup           — deletes completed jobs older than 24h
          │
  Remote OpenAI-Compatible API
    └── POST /v1/chat/completions  — Vision API call (streaming)
```

### Concurrency

Worker pool pattern — configurable 1-8 parallel API requests (default 4). As one finishes, the next queued image starts immediately.

### Image Format Handling

OpenAI only accepts PNG/JPEG. Non-compatible formats (WebP, GIF) are converted to JPEG (quality 90) via `sharp` before API calls. Images are resized to max 3072px biggest dimension. ZIP exports contain the **cropped** image (not original).

### Detection Images

Detection images are scaled down to 1024px max dimension to reduce bandwidth and API cost. Bounding box coordinates are 1000-normalized (resolution-independent), so they apply correctly to the full-resolution image.

### Job Lifecycle

1. `POST /api/caption` → creates job in memory, returns `jobId`, spawns async workers
2. `GET /api/caption?jobId=<id>` → SSE stream, sends progress every 500ms
3. `GET /api/status?jobId=<id>` → polling fallback, 2-second interval from client
4. Job completes when all images are `completed` or `failed`
5. `POST /api/download` → generates ZIP, deletes job from memory
6. `DELETE /api/caption?jobId=<id>` → aborts job, marks queued as failed, deletes from memory
7. Stale cleanup → completed jobs older than 24h are auto-deleted

### Multi-Preset Flow

1. User checks "Caption for all presets"
2. `useMultiPresetJob` runs each preset sequentially
3. Each preset gets its own job ID
4. Progress is aggregated across all presets
5. Results stored per-preset in `presetResults` state
6. Single ZIP download contains folders per preset

## Key Gotchas

### No Persistence

Jobs are in-memory only. Server restart = all jobs lost. No database, no disk caching. Completed jobs auto-delete after 24h.

### No API Key Support

This app does NOT send an `Authorization` header to the remote API. Auth must be handled server-side.

### Single-Instance Only

In-memory store means multi-replica deployments will not work correctly. Jobs are invisible across instances.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_CAPTION_API_URL` | `http://localhost:8080` | Pre-fills the server URL in the UI |

Embedded at build time, read on client side.

### Docker

- Multi-stage: Bun Alpine (deps) → Bun Alpine (build) → Node 22 Alpine (runtime)
- `output: "standalone"` in `next.config.ts` for minimal image
- Build arg: `NEXT_PUBLIC_CAPTION_API_URL`
- `docker compose up --build` starts on port 8800

### Before Writing Code

1. Check `node_modules/next/dist/docs/` for Next.js 16 API changes
2. Read the relevant source file to understand existing patterns
3. Use `@/*` path alias for all src imports
4. Add `"use client"` to client components
5. Run `bun run lint` and `bun run test` before committing
