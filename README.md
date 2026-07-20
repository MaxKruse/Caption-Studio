# Caption Studio

Web app for batch captioning images with llama.cpp vision models. Upload a folder of images, configure prompts, and get streaming captions with reasoning support.

## What It Does

- Connect to a local or remote llama.cpp server (OpenAI-compatible API)
- Auto-discover loaded vision models
- Upload images in bulk (drag-and-drop or file picker)
- Generate detailed captions with streaming token feedback
- Four prompt modes: **Simple** (one-shot), **Multi-step** (conversational refinement), **Krea 2** (de-duplicated captions with character description), and **For Anima** (booru tag enhancement)
- Optional trigger word injection for character/subject naming
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
| `parallel` | Concurrent request slots per model (4+ recommended for batch captioning) |
| `ctx-size` | Context window size (65536+ for detailed prompts with long system messages) |

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
| **Simple** | Quick captioning - one prompt, one result per image |
| **Multi-step** | Refined captions - the model analyzes first, then writes the final caption |
| **Krea 2** | Dataset captioning with character-aware de-duplication - removes repetitive character traits from captions |
| **For Anima** | Dataset captioning with existing booru tags - enriches taggui output with natural language |

### Step 3: Upload Images

Drag and drop images or click to browse. Supports any common image format (PNG, JPEG, WebP, GIF, etc.). Non-PNG/JPEG images are automatically converted before sending to the API.

### Step 4: Configure

**Model selector:** Auto-populated with vision models from your server. Pick the one you want.

**System message:** Sets the overall instructions for the model. The default is optimized for generating detailed, reusable image generation prompts.

**Trigger words (optional):** If you use consistent character or subject names in your images, enter them here:
- **Person:** Character name - injected as "The Character in question is called 'Alice'."
- **Other:** Object, style, or concept name - injected with context about what it refers to

**User message(s):**
- *Simple mode:* Single prompt applied to each image
- *Multi-step mode:* Chain of messages - each response builds context for the next. The final step's output becomes the caption. Default: Step 1 analyzes and lists elements with confidence scores; Step 2 writes the final prompt using only high-confidence elements

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

**SSE events:** Same as simple mode (`session`, `image_start`, `token`, `image_complete`, `done`).

The `image_complete` event includes additional fields:
- `booruTags`: The original booru tags from the caption file
- `llmAddition`: The LLM-generated natural language addition

## Krea 2 Mode

This mode is designed for creating high-quality dataset captions where repetitive character descriptions are removed. It works in two phases:

### Phase 1: Initial Captioning

Identical to Simple mode - each image is captioned independently using the configured prompt.

### Phase 2: Re-captioning with Sliding Window

After all initial captions are generated, a second pass refines them:

1. **Sliding window** of size 8 with overlap 4 (step = 4) iterates through all images
2. For each window, the LLM receives:
   - All 8 images (as vision input)
   - All 8 original captions
   - The user-provided character description
3. The LLM produces refined captions that **exclude features consistent with the character description** (hair color, eye color, body type, etc.) and **focus on what is unique** in each image (pose, expression, background, lighting, accessories, etc.)
4. Windows are processed sequentially - later windows overwrite earlier captions for overlapping images, so the final caption for each image comes from its last window

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
A young woman with long blonde hair and blue eyes standing by the ocean, wearing a white sundress, golden sunset lighting
```

**Phase 2 refined caption (image 3):**
```
Standing by the ocean in a white sundress, golden sunset lighting casting warm tones across the scene
```

The refined caption excludes "long blonde hair" and "blue eyes" because they are consistent across all images and implied by the character description.

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
| `session` | `{ sessionId }` | Session started |
| `phase` | `{ phase: "captioning" \| "recaptioning" }` | Current processing phase |
| `image_start` | `{ index, name }` | Image captioning started |
| `token` | `{ type, index, content, full }` | Streaming token (caption/reasoning) |
| `image_complete` | `{ index, name, status, caption, reasoningContent }` | Image captioning complete |
| `recaption_bucket_start` | `{ bucket, size }` | Re-captioning window started |
| `recaption_bucket_complete` | `{ bucket, status, refinedCount }` | Re-captioning window complete |
| `recaption_image_updated` | `{ index, name, oldCaption, newCaption }` | Individual caption refined |
| `done` | `{ allComplete: true }` | All processing complete |
| `error` | `{ error }` | Error occurred |

## Prompt Variables

Both modes support these placeholders that are replaced per-image:

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
   |-- POST /api/caption/simple ---> | (saves images to /tmp)       |
   |    (FormData: images + config)  |                               |
   |<-- SSE stream ----------------- | -- POST /v1/chat/completions -> |
   |    image_start / token /        |    (stream: true)             |
   |    image_complete / done        | <-- streaming tokens -------- |
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
   |    phase / image_start /        |    (phase 1: caption each)    |
   |    token / image_complete /     |                               |
   |    recaption_* / done           | -- POST /v1/chat/completions -> |
   |                                  |    (phase 2: sliding window)  |
   |-- GET /api/download?sessionId -> | (zips /tmp/session/)         |
   |<-- .zip file ------------------ |                               |
```

- Images are saved to `/tmp/caption-studio/<sessionId>/` on the server
- Caption `.txt` files are written alongside images during processing
- Temp directories auto-clean 30 minutes after last activity
- Processing uses a worker pool (up to 8 parallel API requests)
- Each API call has a 5-minute timeout
