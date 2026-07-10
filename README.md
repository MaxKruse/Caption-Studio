# Caption Studio

Guided caption generation application for llama.cpp vision models. Upload images, choose a mode, and generate captions with streaming feedback.

## Guided Experience Flow

1. **Server Check** - Enter your llama.cpp server URL. The app auto-polls every 3 seconds until the server responds.
2. **Mode Selection** - Choose between Simple or Multi-step mode.
3. **Workflow** - Upload images → Select model → Configure prompts → Start → View results one-by-one.

### Modes

| Mode | Description |
|------|-------------|
| **Simple** | One prompt per image. System message + User message. Each image gets captioned independently. |
| **Multi-step** | Chain of user messages per image. First message includes the image; subsequent messages build on the conversation context. Final `.content` becomes the caption. |

### Prompt Variables

Both modes support these placeholders in prompt text:

| Variable | Replaced With |
|----------|--------------|
| `{trigger}` | Trigger word (reserved for future use) |
| `{image_name}` | The filename of the current image |
| `{index}` | 1-based index of the current image |
| `{total}` | Total number of images in the batch |

## Architecture

### Client-Side

| Component | Purpose |
|-----------|---------|
| `page.tsx` | Guided experience orchestrator (server check → mode select → mode workflow) |
| `server-check.tsx` | Server URL input + auto-polling availability checker |
| `mode-selector.tsx` | Simple vs Multi-step mode selection cards |
| `image-uploader.tsx` | Drag-and-drop + file picker image upload with thumbnails |
| `model-selector.tsx` | Fetches and displays available vision models from connected server |
| `prompt-editor.tsx` | System + user message editors with variable hints |
| `caption-viewer.tsx` | One-by-one result display with navigation, streaming captions, and reasoning toggle |
| `simple-mode.tsx` | Simple mode workflow orchestrator (upload → configure → process → results) |
| `multi-step-mode.tsx` | Multi-step mode workflow orchestrator |

### State Management

- **Session** (`lib/session.ts` + `hooks/use-session.ts`) - localStorage-backed session with reactive React hook
- Persists: mode, serverUrl, model, images, prompts across page navigations
- "New session" button resets all state

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ping` | GET | Lightweight server availability check (`?serverUrl=<url>`) |
| `/api/models` | GET | Proxy to `/v1/models` - discovers vision models |
| `/api/caption/simple` | POST | Simple mode - processes images sequentially with single prompt, returns SSE stream |
| `/api/caption/multi-step` | POST | Multi-step mode - chains API calls per image, returns SSE stream |
| `/api/caption` | POST/GET/DELETE | Legacy batch captioning (job-based, in-memory store) |
| `/api/detect` | POST/GET | Face/body detection (legacy) |

### SSE Event Streams (Simple + Multi-step)

Both mode endpoints return Server-Sent Events:

| Event | Data | Description |
|-------|------|-------------|
| `image_start` | `{ index, name }` | Started processing an image |
| `step_start` | `{ imageIndex, stepIndex, totalSteps }` | Started a step (multi-step only) |
| `token` | `{ type, content, full }` | Streaming token (type: "caption" or "reasoning") |
| `step_complete` | `{ imageIndex, stepIndex, content, reasoningContent }` | Step finished (multi-step only) |
| `image_complete` | `{ index, name, status, caption?, reasoningContent?, error? }` | Image processing done |
| `done` | `{ allComplete: true }` | All images processed |
| `error` | `{ error }` | Fatal error |

### Legacy API Routes

The original `/api/caption` (POST/GET/DELETE) and `/api/detect` routes remain for backward compatibility. They use the in-memory job store pattern (`lib/store.ts`, `lib/detect-store.ts`).

### Lib

| File | Purpose |
|------|---------|
| `lib/url-utils.ts` | Normalizes server URLs (strips trailing `/` and `/v1`) |
| `lib/types.ts` | Shared types (`ModelInfo`, `CropRect`) |
| `lib/session.ts` | localStorage session persistence layer |
| `lib/store.ts` | In-memory caption job store (legacy) |
| `lib/image-utils.ts` | Image prep: format conversion, resize to 3072px max |
| `lib/string-utils.ts` | File extension utility |

### UI Theme

Grey/slate theme - neither dark nor light. Uses indigo accents for interactive elements.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.6 (App Router only) |
| UI | React 19.2.4 |
| Styling | Tailwind CSS v4 |
| Package Manager | Bun |
| Runtime | Bun for dev/build, Node 22 for production |
| Language | TypeScript 5 (strict mode) |
| Image Processing | sharp |

## Scripts

```bash
bun install       # install dependencies
bun run dev       # start dev server (http://localhost:3000)
bun run build     # production build
bun run lint      # run linter
```

## Before Using

1. Start a llama.cpp server with vision model support (e.g., LLaVA, BakLLaVA)
2. Run `bun run dev`
3. Navigate to `http://localhost:3000`
4. Enter your server URL and follow the guided flow
