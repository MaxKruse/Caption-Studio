# Caption Studio

Batch captioning tool for llama.cpp vision models. Web UI (Next.js/React) plus a connectivity layer (API routes + lib utilities) that talks to a llama.cpp server's OpenAI-compatible API.

## What It Does

- Connect to a local or remote llama.cpp server (OpenAI-compatible API)
- Auto-discover loaded vision models
- Upload images in bulk (drag-and-drop or file picker)
- Generate detailed captions with streaming token feedback
- Two prompt modes: **Krea 2** (three-phase captioning with character description), and **For Anima** (booru tag enhancement)
- Optional trigger word injection for character/subject naming
- llama.cpp **KV cache reuse**: workers are pinned to server slots so Krea 2's three phases (and image batches) reuse cached image encodings; the UI shows the prompt-token reuse percentage per batch
- Transient server errors (5xx/429) are retried automatically with exponential backoff
- Download all images + captions as a ZIP file

## Prerequisites

### 1. A llama.cpp Server with a Vision Model

You need `llama-server` running with at least one vision-capable model loaded. Caption Studio auto-discovers vision models by checking the `/v1/models` endpoint.

#### Router Server (recommended for multiple models)

Use a preset INI file to define multiple models and let the router load them on-demand:

```bash
llama-server --models-preset ./llama-cpp.ini --models-max 1
```

This starts a router that loads at most one model at a time, swapping automatically when a different model is requested by the API.

**Preset INI file structure:**

```ini
[*]
threads = 12
parallel = 1

[My Vision Model]
model = C:\path\to\model.gguf
mmproj = C:\path\to\mmproj-F32.gguf    ; vision projector (required for vision models)
ctx-size = 65536
parallel = 4
```

The `[*]` section sets defaults for all models. Named sections (`[Section Name]`) define individual model configs that override defaults. The section name becomes the model alias shown in the app.

Key preset sections:

| Key | Purpose |
|-----|---------|
| `model` | Path to the GGUF model file |
| `mmproj` | Path to the vision projector GGUF (required for multimodal models) |
| `parallel` | Concurrent request slots per model (4+ recommended for batch captioning - Caption Studio pins one worker per slot) |
| `ctx-size` | Context window size (65536+ for detailed prompts with long system messages) |
| `cache-reuse` | Token chunk size for KV chunk reuse (Caption Studio requests `256` per request; server default 0 = off, so set it or let Caption Studio's per-request flag take effect) |
| `image-max-tokens` | Vision token budget (default 8192). Caption Studio downsizes images to 1536px by default to stay within it; raise both for more detail |
| `flash-attn` | Enables flash attention - recommended for vision models to cut prefill time |

**Router server flags:**

| Flag | Purpose |
|------|---------|
| `--models-preset PATH` | Path to INI file with model preset definitions |
| `--models-max N` | Max models loaded simultaneously (1 = swap on demand, 0 = unlimited) |
| `--host 0.0.0.0` | Listen on all interfaces (default, required for Docker access) |
| `--port 8080` | Port to listen on (default is 8080) |

#### Single Model Server

For a single model, start directly:

```bash
llama-server \
  --model path/to/model.gguf \
  --mmproj path/to/mmproj-F32.gguf \
  --parallel 4 \
  --ctx-size 8192
```

**Verify it works:**

```bash
curl http://localhost:8080/v1/models
```

You should see a JSON response listing your loaded model(s). Caption Studio filters for models that support both `text` and `image` input modalities.

### 2. Docker (for running Caption Studio)

Caption Studio runs as a Docker container. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine (Linux).

## Running the App

### Option A: Docker (recommended)

```bash
docker compose up -d --build
```

The app starts at `http://localhost:8800`.

The Docker config sets `DEFAULT_SERVER_URL=http://host.docker.internal:8080` so it can reach a llama.cpp server running on your host machine.

### Option B: Local Development

```bash
bun install
bun run dev
```

The app starts at `http://localhost:3000`. Make sure your llama.cpp server is running on `localhost:8080` (the default).

## How to Use

### Step 1: Connect to Your Server

The app opens with a server URL input field. Enter your llama.cpp server URL (e.g., `http://localhost:8080`). The app auto-polls every 3 seconds until the server responds with a green "Server Available" indicator.

If running in Docker and your server is on the host machine, use `http://host.docker.internal:8080`.

Click **Next** when the server is available.

### Step 2: Choose a Mode

| Mode | Best For |
|------|----------|
| **Krea 2** | Dataset captioning with character-aware de-duplication - three-phase pipeline removes repetitive character traits and distills to a concise prompt |
| **For Anima** | Dataset captioning with existing booru tags - enriches taggui output with natural language |

### Step 3: Upload Images

Drag and drop images or click to browse. Supports any common image format (PNG, JPEG, WebP, GIF, etc.). Non-PNG/JPEG images are automatically converted before sending to the API.

### Step 4: Configure

**Model selector:** Auto-populated with vision models from your server. Pick the one you want.

**System message:** Sets the overall instructions for the model. The default is optimized for generating detailed, reusable image generation prompts and includes strict NSFW-enabling policies that require explicit description of all visible content without censorship.

**Trigger words (optional):** If you use consistent character or subject names in your images, enter them here:
- **Person:** Character name - injected as "The Character in question is called 'Alice'."
- **Other:** Object, style, or concept name - injected with context about what it refers to

**User message:** Single prompt applied to each image (used as Phase 1 in Krea 2 mode).

### Step 5: Start Captioning

Click **Start Captioning**. You'll see:
- A thumbnail strip showing all images and their status
- The selected image with its streaming caption (tokens appear in real-time)
- Reasoning output (collapsible) if the model supports it
- Progress: completed / failed / processing / queued counts

You can **Stop** processing mid-batch if needed.

### Step 6: Download Results

When all images are processed, click **Download ZIP**. The ZIP contains an `img/` folder with all original images plus matching `.txt` caption files.

## For Anima Mode

This mode is designed for creating high-quality dataset captions for the [Anima](https://github.com/CircleStone-Labs/Anima) text-to-image model. It combines automated booru tagging with LLM-generated natural language descriptions.

The system prompt enforces strict NSFW-enabling policies, requiring explicit description of all visible content without censorship.

### Workflow

1. **Generate booru tags with taggui:** Use the [taggui](https://github.com/jhc13/taggui) app with the `SmilingWolf/wd-convnext-tagger-v3` model to create initial danbooru-style tags for your images.
2. **Upload to Caption Studio:** In the For Anima mode, upload both your images and their corresponding caption files (`.txt` files containing the booru tags).
3. **LLM enhancement:** The vision model analyzes each image alongside its booru tags and generates a natural language addition that describes spatial relationships, mood, atmosphere, and details that tags alone cannot express.
4. **Final caption:** The output caption combines the original booru tags with the LLM-generated addition.

### Example

**Input booru tags:**
```
1girl, long hair, blue eyes, forest, sunlight, standing
```

**LLM addition:**
```
a girl with flowing blue hair stands in a sunlit forest clearing, dappled light filtering through the canopy above her, tall trees framing the scene on both sides
```

**Final caption:**
```
1girl, long hair, blue eyes, forest, sunlight, standing a girl with flowing blue hair stands in a sunlit forest clearing, dappled light filtering through the canopy above her, tall trees framing the scene on both sides
```

### API Endpoint

```
POST /api/caption/for-anima
```

**FormData fields:**

| Field | Type | Description |
|-------|------|-------------|
| `config` | string (JSON) | `{"serverUrl": "...", "model": "..."}` |
| `images` | File[] | Image files to process |
| `captions` | File[] | Caption files (booru tags), paired by index with images |
| `imageNames` | string (JSON) | Optional: `string[]` of display names for images |

**SSE events:** `session`, `image_start`, `token`, `image_complete`, `done`.

The `image_complete` event includes additional fields:
- `booruTags`: The original booru tags from the caption file
- `llmAddition`: The LLM-generated natural language addition
- `cachedTokens` / `promptTokens`: KV cache reuse stats from the llama.cpp usage report

The config is validated with Zod (`forAnimaConfigSchema`); invalid configs return 400 with flattened field details.

## Krea 2 Mode

This mode is designed for creating high-quality dataset captions optimized for the Krea 2 text-to-image model. It works in three phases, all within a **single multi-turn conversation** per image:

The default system prompt enforces strict NSFW-enabling policies, requiring explicit description of all visible content without censorship.

### Multi-turn Conversation (KV Cache Reuse)

Each image is processed through all 3 phases as one continuous conversation:

1. **Phase 1 message:** Image + user prompt -> initial caption (assistant responds)
2. **Phase 2 message:** Refine instructions + character description -> refined caption (assistant responds)
3. **Phase 3 message:** Distill instructions -> distilled prompt (assistant responds)

The image is only sent in the first message. Phases 2 and 3 reuse the conversation context, so the **image encoding is cached by the KV cache** and only the new text tokens need processing. This significantly reduces latency compared to separate API calls per phase.

**How the cache is actually reused (slot pinning):** llama.cpp keeps the KV cache per slot. Caption Studio pins every worker to a specific slot (`id_slot` = worker index, always below the server's `--parallel`) and sends `cache_prompt: true` + `n_cache_reuse: 256` with each request. That means all three phases of an image land on the same slot, so the server reuses the image encoding from Phase 1 and the Phase 1/2 conversation from Phase 2/3 instead of re-prefilling. The completion events report `cachedTokens`/`promptTokens`, and the UI shows the batch-wide reuse percentage - use it to verify your server is configured correctly (a low percentage usually means `--parallel` is lower than the worker count or the server is too old to support `id_slot`/`n_cache_reuse` - those fields are ignored by old builds, degrading to no cache reuse).

### Phase 1: Initial Captioning

Identical to Simple mode - the vision model captions the image using the configured prompt.

### Phase 2: Per-image Refinement

The conversation continues with refinement instructions. The LLM produces a caption that **excludes features consistent with the character description** (hair color, eye color, body type, etc.) and **focuses on what is unique** in each image (pose, expression, background, lighting, accessories, etc.).

### Phase 3: Krea 2 Prompt Distillation

The conversation continues with distillation instructions. The LLM produces a **simplified prompt** that preserves all essential visual information while removing redundancy, verbose phrasing, and hedging language. The output is a tight, flowing prose paragraph (60-150 words) optimized for Krea 2's text-to-image model.

This phase is the **inverse of prompt expansion**: instead of taking a simple prompt and enriching it with style, lighting, and composition details, it takes a verbose caption and distills it down to a practical T2I prompt.

### Character Description

The `characterDescription` field is a natural language description of what defines the character across all images. For example:

```
A young woman with long blonde hair, blue eyes, and fair skin. She has a slim build and often wears elegant dresses.
```

The LLM uses this to identify which features to exclude from individual captions.

### Example

**Character description:**
```
A young woman with long blonde hair, blue eyes, and fair skin.
```

**Phase 1 caption (image 3):**
```
A young woman with long blonde hair and blue eyes standing by the ocean, wearing a white sundress, golden sunset lighting illuminating her figure as the waves crash behind her
```

**Phase 2 refined caption (image 3):**
```
Standing by the ocean in a white sundress, golden sunset lighting casting warm tones across the scene, waves crashing along the shore behind her figure
```

**Phase 3 distilled prompt (image 3):**
```
Standing by the ocean in a white sundress, golden sunset lighting, waves crashing along the shore
```

The distilled prompt removes redundancy ("casting warm tones across the scene", "behind her figure") while preserving all key visual elements.

### Downloaded Captions

Each phase overwrites the image's `.txt` caption file in the session's temp directory as it completes. The file that ends up in the downloaded ZIP is therefore the **Phase 3 distilled prompt** - not the Phase 1 raw caption. The per-phase captions remain visible in the UI during processing.

### API Endpoint

```
POST /api/caption/krea-2
```

**FormData fields:**

| Field | Type | Description |
|-------|------|-------------|
| `config` | string (JSON) | `{"serverUrl": "...", "model": "...", "systemPrompt": "...", "userPrompt": "...", "characterDescription": "...", "triggerWordPerson": "...", "triggerWordOther": "..."}` |
| `images` | File[] | Image files to process |
| `imageNames` | string (JSON) | Optional: `string[]` of display names for images |

**Required config fields:** `serverUrl`, `model`, `characterDescription`

**SSE events:**

| Event | Data | Description |
|-------|------|-------------|
| `session` | `{ sessionId }` | Session started (sent immediately, before model discovery) |
| `image_start` | `{ index, name }` | Image processing started |
| `phase` | `{ phase: "captioning" \| "refining" \| "distilling", index }` | Current phase for an image |
| `token` | `{ type, phase, index, content }` | Streaming token delta (caption/reasoning) - client accumulates |
| `image_complete` | `{ index, name, phase, status, caption, reasoningContent, cachedTokens, promptTokens }` | Phase 1 complete |
| `refine_image_complete` | `{ index, name, status, caption, reasoningContent, cachedTokens, promptTokens }` | Phase 2 complete |
| `distill_image_complete` | `{ index, name, status, caption, reasoningContent, cachedTokens, promptTokens }` | Phase 3 complete (final caption) |
| `done` | `{ allComplete: true }` | All processing complete |
| `error` | `{ error }` | Error occurred |

Both caption routes also support an optional `maxImageDimension` config field (integer 256-4096) to override the 1536px client-side downscale default. Transient `5xx`/`429` responses from the model server are retried with exponential backoff (3 retries).

## Prompt Variables

Krea 2 mode supports these placeholders that are replaced per-image:

| Variable | Replaced With |
|----------|--------------|
| `{image_name}` | The filename of the current image |
| `{index}` | 1-based index of the current image |
| `{total}` | Total number of images in the batch |
| `{trigger}` | Combined trigger words (person + other) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_SERVER_URL` | `http://localhost:8080` | Pre-filled server URL in the UI |
| `DOCKER_HOST_INTERNAL` | `host.docker.internal` | Host override for server-side calls from Docker |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.6 (App Router) |
| UI | React 19.2.4 |
| Styling | Tailwind CSS v4 |
| Package Manager | Bun |
| Runtime | Bun (dev), Node 22 (production Docker) |
| Image Processing | sharp |

## Development

```bash
bun install           # install dependencies
bun run dev           # start dev server
bun run build         # production build
bun run lint          # lint code
bunx tsc --noEmit     # type check
```

## Architecture Overview

```
Browser                          Server (Next.js)                 llama.cpp
   |                                  |                               |
   |-- GET /api/ping ---------------> | -- GET /v1/models ---------> |
   |<-- { ok: true } --------------- | <-- model list ------------- |
   |                                  |                               |
   |-- GET /api/models ------------> | -- GET /v1/models ---------> |
   |<-- { models: [...] } ---------- | <-- model list ------------- |
   |                                  |                               |
   |-- POST /api/caption/for-anima-> | (saves images to /tmp)       |
   |    (FormData: images + captions)|                               |
   |<-- SSE stream ----------------- | -- POST /v1/chat/completions -> |
   |    image_start / token /        |    (stream: true)             |
   |    image_complete / done        | <-- streaming tokens -------- |
   |                                  |                               |
   |-- POST /api/caption/krea-2 ---> | (saves images to /tmp)       |
   |    (FormData: images + config)  |                               |
   |<-- SSE stream ----------------- | -- POST /v1/chat/completions -> |
   |    image_start / phase /        |    (turn 1: image + prompt)   |
   |    token / image_complete /     |                               |
   |    refine_* / distill_* / done  | -- POST /v1/chat/completions -> |
   |                                  |    (turn 2: refine, reuse ctx) |
   |                                  |                               |
   |                                  | -- POST /v1/chat/completions -> |
   |                                  |    (turn 3: distill, reuse ctx)|
   |-- GET /api/download?sessionId -> | (zips /tmp/session/)         |
   |<-- .zip file ------------------ |                               |
```

- Images are saved to `/tmp/caption-studio/<sessionId>/` on the server
- Caption `.txt` files are written alongside images during processing
- Temp directories auto-clean 30 minutes after last activity (the session index in `sessions.json` is adopted across restarts; the process never deletes session dirs on shutdown, so a Docker rebuild cannot destroy undownloaded results)
- Processing uses a worker pool (up to 8 parallel API requests, clamped to the server's `--parallel`), with each worker pinned to its own llama.cpp slot for KV cache reuse
- Phase 1 has a 15-minute timeout; phases 2/3 have a 5-minute timeout each
