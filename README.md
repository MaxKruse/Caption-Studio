# Image Captioning Studio

Batch image captioning tool with a minimal monochrome UI. Upload images, configure an OpenAI-compatible API, and generate captions for all images in one go.

## Features

- **Multi-image upload** — Select multiple images at once (PNG, JPG, JPEG, WebP, GIF)
- **OpenAI-compatible API** — Connect to any server with a `/v1/chat/completions` endpoint
- **Model discovery** — Fetch and pick from all available models on the server
- **Custom prompts** — Configure separate system and user prompts
- **Batch processing** — Process all images with max 4 concurrent API requests
- **Real-time progress** — SSE-powered progress tracking with per-file status
- **ZIP export** — Download all images paired with their caption `.txt` files
- **Error resilience** — Failed images are logged but don't block the queue

## Setup

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- An OpenAI-compatible API server (e.g., OpenAI, vLLM, Ollama, LM Studio)

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

## Usage

1. **Enter API URL** — Paste your OpenAI-compatible server URL (e.g., `https://api.openai.com` or `http://localhost:8000`)
2. **Fetch Models** — Click "Fetch Models" to load available models
3. **Select Model** — Pick a vision-capable model from the dropdown
4. **Configure Prompts** — Set the system prompt (instructions) and user prompt (your request)
5. **Upload Images** — Click the upload zone or drag & drop image files
6. **Caption All** — Click "Caption All" to start batch processing
7. **Monitor Progress** — Watch the progress bar and per-file status badges
8. **Download ZIP** — When done, click "Download ZIP" to get all images + caption files

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Upload   │  │  Config   │  │ Prompts   │  │  Progress  │  │
│  │  Images   │  │  API URL  │  │  System   │  │  (SSE)    │  │
│  │           │  │  Model    │  │  User     │  │            │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Next.js App   │
                    │   (Route APIs)  │
                    │                 │
                    │  /api/models    │──→ GET models from remote API
                    │  /api/caption   │──→ POST start job + GET SSE progress
                    │  /api/status    │──→ GET per-image status
                    │  /api/download  │──→ POST generate ZIP
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  In-Memory Store│
                    │  (jobs map)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │Remote OpenAI API │
                    │ /v1/chat/...     │
                    └─────────────────┘
```

### Concurrency

Outbound requests to the OpenAI server are limited to **4 concurrent connections**. Images are processed in a worker pool pattern — as one request completes, the next queued image starts immediately.

### File Naming

ZIP exports pair each image with a caption file using the same base name:

- `photo.png` → `photo.txt`
- `image-001.jpg` → `image-001.txt`

## Dependencies

| Package | Purpose |
|---------|---------|
| `next` | Framework (App Router, Route Handlers) |
| `react` / `react-dom` | UI rendering |
| `archiver` | ZIP file generation |
| `tailwindcss` | Styling |

## License

MIT
