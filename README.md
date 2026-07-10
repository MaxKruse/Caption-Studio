# Caption Studio

Scaffolding for a new app. Currently retains only the **llama.cpp server connectivity** layer from the previous version.

## What's Here

### API Routes (App Router)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/models` | GET | Proxy to `/v1/models` — discovers available models, filters for vision-capable ones |
| `/api/caption` | POST | Start batch caption job (FormData with images + JSON config) |
| `/api/caption` | GET | SSE progress stream (`?jobId=<id>`) |
| `/api/caption` | DELETE | Abort job (`?jobId=<id>`) |
| `/api/detect` | POST | Start face/body detection job |
| `/api/detect` | GET | SSE progress stream (`?jobId=<id>`) |

### Lib

| File | Purpose |
|------|---------|
| `lib/url-utils.ts` | Normalizes server URLs (strips trailing `/` and `/v1`) |
| `lib/types.ts` | Shared types (`ModelInfo`, `CropRect`) |
| `lib/store.ts` | In-memory caption job store with stale cleanup |
| `lib/detect-store.ts` | In-memory detection job store |
| `lib/image-utils.ts` | Image prep: format conversion (WebP/GIF → JPEG), resize to max 3072px |
| `lib/detect-parsing.ts` | Parses vision API bounding box responses (Gemma `box_2d` and OpenAI/Qwen `bbox_2d` formats) |
| `lib/detection-prompts.ts` | Detection prompt builder (Gemma vs Qwen coordinate format adaptation) |
| `lib/string-utils.ts` | File extension utility |

### Key Patterns

- **URL normalization**: `normalizeServerUrl()` strips `/v1` suffix and trailing slashes
- **Model discovery**: GET `/api/models?serverUrl=<url>` proxies to `<url>/v1/models`, filters for vision models by `architecture.input_modalities`
- **Chat completions call**: POST to `<url>/v1/chat/completions` with `stream: true`
- **SSE progress**: `ReadableStream` + `TextEncoder`, polling interval from `setInterval`, closes on job completion
- **Streaming response parsing**: Reads `delta.reasoning_content` and `delta.content` from SSE chunks
- **Worker pool**: Configurable concurrency (1-8, default 4) for parallel API requests
- **Image prep**: `sharp` converts non-PNG/JPEG to JPEG and resizes to 3072px max dimension
- **Timeout**: `AbortController` with `setTimeout` per API call (5 min for caption, 3 min for detection)

### Concurrency Model

```
POST /api/caption → creates job in memory → spawns workers → returns jobId immediately
GET  /api/caption → SSE stream polls store every 500ms → client sees live progress
DELETE /api/caption → aborts workers, marks queued as failed, deletes from memory
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_CAPTION_API_URL` | `http://localhost:8080` | Pre-fills the server URL in the UI |

### Before Using

The UI layer has been removed. The API routes are functional but there's no frontend to drive them yet. Use `curl` or a tool like Postman to test the endpoints against a running llama.cpp server.

Example model discovery:
```bash
curl "http://localhost:3000/api/models?serverUrl=http://localhost:8080"
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.6 (App Router) |
| Runtime | Bun for dev, Node 22 for production |
| Language | TypeScript 5 (strict) |
| Image Processing | sharp |
| Styling | Tailwind CSS v4 |

## Scripts

```bash
bun install    # install dependencies
bun run dev    # start dev server
bun run build  # production build
```
