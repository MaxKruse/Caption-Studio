# Image Captioning Studio

Batch image captioning tool with a minimal monochrome UI. Upload images, configure an OpenAI-compatible API, and generate captions for all images in one go — then download everything as a ZIP.

## Table of Contents

- [Features](#features)
- [UX Flow](#ux-flow)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Development](#development)
- [API Endpoints](#api-endpoints)
- [Gotchas & Known Limitations](#gotchas--known-limitations)
- [License](#license)

---

## Features

- **Multi-image upload** — Drag & drop or select multiple images (PNG, JPG, JPEG, WebP, GIF)
- **OpenAI-compatible API** — Connect to any server with a `/v1/chat/completions` endpoint (OpenAI, vLLM, Ollama, LM Studio, llama.cpp, etc.)
- **Model discovery** — Auto-fetches and filters vision-capable models from your server
- **Custom prompts** — Configure separate system and user prompts with full control
- **Caption naming** — Optional caption name injected into prompts (e.g., "Include the name of the subject 'Alice'.")
- **Configurable concurrency** — 1–8 parallel API requests (default: 4)
- **Real-time progress** — SSE-powered progress tracking with per-file status badges
- **Time estimation** — Live ETA based on average processing time per image
- **ZIP export** — Download all original images paired with caption `.txt` files
- **Error resilience** — Failed images are logged but don't block the queue
- **Docker-ready** — Multi-stage build optimized for minimal production image

---

## UX Flow

The UI is organized into three sections, read top to bottom:

### 1. Configure

Set up your API connection and prompts before uploading anything:

1. **Server URL** — Paste your OpenAI-compatible API base URL (e.g., `http://localhost:8080`)
2. **Fetch Models** — Click to discover available models; only vision-capable models are shown
3. **Model** — Pick a model from the dropdown
4. **System Prompt** — Instructions for the AI (defaults to a concise image-describing prompt)
5. **User Prompt** — Your caption request (defaults to a detailed physical description prompt)
6. **Caption Name** (optional) — A name injected into the prompt via the prefix
7. **Include Name in Prompt** — Toggle to prepend `"Include the name of the subject '<name>'."` to the user prompt
8. **Parallel Requests** — Slider (1–8) controlling concurrent API calls

### 2. Upload

Add images to the queue:

1. **Drag & drop** or **click to browse** for image files
2. Images appear as a thumbnail gallery with per-file status badges
3. Click any thumbnail to open a **full-size preview modal** (close with Escape or click outside)
4. Remove individual images or use **Clear All** (requires confirmation — click twice within 3 seconds)
5. Gallery is collapsible to save screen space

### 3. Process

Start batch captioning and monitor progress:

1. Click **Caption All** (enabled only when images + model + URL are set)
2. A progress bar fills as images are processed
3. A **floating time estimator** (bottom-left) shows ETA, average time per image, and remaining count
4. Per-file status badges update in real-time: `queued` → `processing` → `completed` / `failed`
5. When done, a **Download ZIP** button appears
6. If any images failed, an expandable error log shows the failures

### After Download

1. Click **Download ZIP** — triggers a browser download of `Captions<name>.zip`
2. The ZIP contains each original image plus a `.txt` file with the same base name containing its caption
3. All state resets — ready for the next batch

---

## How It Works

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (Client)                       │
│                                                               │
│  ConfigSection  →  UploadSection  →  ProcessSection          │
│       │                   │                   │              │
│       └───────────────────┴───────────────────┘              │
│                            │                                  │
│              useImageUpload  │  useCaptionJob                  │
│                            │                                  │
└────────────────────────────┬─────────────────────────────────┘
                             │ fetch() / EventSource
                    ┌────────▼────────┐
                    │   Next.js API    │
                    │   Route Handlers │
                    │                  │
                    │  POST /api/caption   → Start job + SSE stream
                    │  GET  /api/caption   → SSE progress events
                    │  GET  /api/status    → Polling fallback
                    │  GET  /api/models    → Model discovery proxy
                    │  POST /api/download  → ZIP generation
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ In-Memory Store  │  (Map<string, CaptionJob>)
                    │  (jobs map)      │
                    └────────┬────────┘
                             │ fetch()
                    ┌────────▼────────┐
                    │ Remote OpenAI    │  /v1/chat/completions
                    │ Compatible API   │
                    └──────────────────┘
```

### Data Flow (Captioning)

1. **Client** sends `POST /api/caption` with images (as base64), model, serverUrl, and prompts
2. **Server** creates a job in the in-memory store, returns a `jobId`
3. **Server** spawns async workers (concurrency-limited) that process images one by one
4. Each worker: converts image to PNG/JPEG (via `sharp`), calls the remote API, stores the caption
5. **Client** opens an `EventSource` to `GET /api/caption?jobId=<id>` — receives SSE progress events every 500ms
6. **Client** also polls `GET /api/status?jobId=<id>` every 2 seconds as a fallback for detailed per-image status
7. When all images are done, SSE sends a `{ done: true }` event
8. **Client** calls `POST /api/download` with the `jobId`
9. **Server** streams a ZIP (images + `.txt` captions) back to the browser and deletes the job from memory

### Concurrency Model

Images are processed using a **worker pool** pattern. The number of workers (1–8, default 4) is configurable. As each worker finishes captioning an image, it picks the next queued image until the queue is empty.

### Image Format Handling

OpenAI's vision API only accepts PNG and JPEG. Images in other formats (WebP, GIF) are automatically converted to JPEG (quality 90) using `sharp` before being sent to the remote API. The ZIP export always contains the **original** image, not the converted one.

### Time Estimation

The server tracks processing start/end timestamps per image. From completed images, it calculates:
- **Average time per image** — mean of all processed images
- **Estimated remaining** — average × queued count

These values are included in every SSE progress event and displayed in the floating time estimator.

---

## Requirements

### Runtime

- **Bun** 1.0+ — the project uses Bun as its package manager and runtime. `npm`, `yarn`, and `pnpm` are not supported.
- **Node.js** 18+ — required at runtime by Next.js (Bun provides this).

### API Server

You need an **OpenAI-compatible API server** with:

- A `/v1/chat/completions` endpoint that accepts vision (image_url) messages
- A `/v1/models` endpoint that returns model metadata including `architecture.input_modalities`
- Models that support both `"text"` and `"image"` input modalities

**Compatible servers:** OpenAI, vLLM, Ollama, LM Studio, llama.cpp server, AnyScale, etc.

**No API key is required** by this application — it does not send an `Authorization` header. If your server requires authentication, you'll need to configure that on the server side (e.g., via reverse proxy or server-level auth).

---

## Getting Started

### Install & Run

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
bun run build
bun run start
```

### Testing

```bash
bun run test          # Run all tests (Vitest)
bun run test:watch    # Watch mode
```

### Linting & Type-Checking

```bash
bun run lint          # ESLint
bunx tsc --noEmit     # TypeScript type-check
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_CAPTION_API_URL` | `http://localhost:8080` | Pre-fills the server URL field in the UI |

This variable is embedded at build time and read on the client side. It is entirely optional — the UI field is always editable.

### Docker Build Args

| Arg | Default | Description |
|-----|---------|-------------|
| `NEXT_PUBLIC_CAPTION_API_URL` | (unset) | Passed through to the Next.js build as `NEXT_PUBLIC_CAPTION_API_URL` |

---

## Docker Deployment

### Quick Start

```bash
docker compose up --build
```

This builds the image and starts the container on **port 8800**, pre-configured to connect to `http://host.docker.internal:8080` (your host's localhost).

### Build Args

```bash
docker build \
  --build-arg NEXT_PUBLIC_CAPTION_API_URL="http://your-api-server:8080" \
  -t caption-studio .
```

### Multi-Stage Build

The Dockerfile uses three stages:

1. **deps** — Bun Alpine, installs dependencies with frozen lockfile
2. **builder** — Copies deps + source, runs `next build`
3. **runner** — Node 22 Alpine, copies `.next/standalone` output + static files, runs as non-root user

The `output: "standalone"` in `next.config.ts` ensures only the minimal files needed for production are copied into the final image.

---

## Development

### Project Structure

```
src/
  app/
    api/
      caption/route.ts          — Batch captioning (POST start + GET SSE)
      download/route.ts         — ZIP export
      models/route.ts           — Model discovery proxy
      status/route.ts           — Job status polling
    globals.css                 — Tailwind + monochrome theme
    layout.tsx                  — Root layout (Inter font)
    page.tsx                    — Home page
  components/
    CaptionStudio.tsx           — Main orchestrating component
    CaptionStudioTypes.ts       — Shared types, constants, utilities
    ConfigSection.tsx           — API configuration section
    UploadSection.tsx           — Image upload with gallery
    ProcessSection.tsx          — Processing controls & progress
    ImagePreviewModal.tsx       — Full-size image preview
    hooks/
      useCaptionJob.ts          — Caption job lifecycle (SSE, polling, download)
      useImageUpload.ts         — Image file handling & drag-drop
  lib/
    image-utils.ts              — Image format conversion (sharp)
    store.ts                    — In-memory job store
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Styling | Tailwind CSS v4 |
| Package Manager | Bun |
| Image Processing | sharp |
| ZIP Generation | archiver |
| Testing | Vitest 4 + jsdom + @testing-library/react |
| Linting | ESLint 9 + eslint-config-next |
| Language | TypeScript 5 (strict) |

---

## API Endpoints

### `POST /api/caption`

Start a batch captioning job.

**Request body:**
```json
{
  "images": [{ "name": "photo.png", "data": "<base64>" }],
  "serverUrl": "http://localhost:8080",
  "model": "llava-1.5-7b",
  "systemPrompt": "You are a helpful image captioning assistant.",
  "promptPrefix": "Include the name of the subject",
  "userPrompt": "Describe this image in detail.",
  "captionName": "Alice",
  "includeNameInPrompt": true,
  "parallelRequests": 4
}
```

**Response:** `{ "jobId": "abc123" }`

---

### `GET /api/caption?jobId=<id>`

SSE stream of progress events (500ms interval).

**Event data:**
```json
{
  "total": 10,
  "queued": 3,
  "processing": 1,
  "completed": 5,
  "failed": 1,
  "avgTimeMs": 2340,
  "estimatedRemainingMs": 7020,
  "statuses": {
    "photo.png": { "status": "completed", "caption": "...", "prompt": "...", "reasoningContent": "..." }
  },
  "done": false
}
```

Final event includes `"done": true`.

---

### `GET /api/status?jobId=<id>`

Polling endpoint for detailed per-image status (used as SSE fallback).

**Response:**
```json
{
  "statuses": {
    "photo.png": { "status": "completed", "caption": "...", "prompt": "...", "reasoningContent": "..." }
  }
}
```

---

### `GET /api/models?serverUrl=<url>`

Proxy to fetch vision-capable models from the remote server.

**Response:**
```json
{
  "models": [{ "id": "llava-1.5-7b", "owned_by": "...", "architecture": { "input_modalities": ["text", "image"] } }]
}
```

---

### `POST /api/download`

Generate and download a ZIP of images + captions.

**Request body:** `{ "jobId": "abc123" }`

**Response:** `application/zip` binary stream (triggers browser download).

---

## Gotchas & Known Limitations

### No Persistence

Jobs are stored **in-memory only**. If the server restarts, all active jobs and their results are lost. There is no database or disk caching.

### No API Key Support

This application does **not** send an `Authorization` header to the remote API. If your server requires authentication, you need to handle it at the server level (e.g., API key baked into the server config, or a reverse proxy that injects headers).

### Large Images

Images are sent at **full original resolution** — no resizing or downsampling. Non-PNG/JPEG formats (WebP, GIF) are converted to JPEG at quality 90, but dimensions are preserved. Very large images may hit:
- Next.js request body size limits
- Remote API token/size limits
- Memory pressure on the server (images held in RAM as Buffers)

### Single-Instance Only

The in-memory job store means this only works correctly in a **single server instance**. Deploying to multiple replicas (e.g., multi-container Docker, multi-server Vercel) will cause jobs to be invisible across instances.

### SSE Browser Compatibility

Server-Sent Events (EventSource) is widely supported in modern browsers but **not supported in Safari on iOS 12 and below**. The polling fallback (`/api/status`) provides partial coverage.

### Before-Unload Warning

If you try to navigate away or close the tab while a job is processing, a browser warning is shown. This cannot be customized and behavior varies by browser.

### Next.js 16 Breaking Changes

This project uses Next.js 16, which has breaking API changes compared to older versions. Always check `node_modules/next/dist/docs/` before writing new code — deprecation notices and API changes are documented there.

### Windows Line Endings

The project runs on Windows. If collaborating with Unix developers, be aware of potential CRLF/LF issues in generated files.

---

## License

MIT
