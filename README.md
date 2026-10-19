# Caption Studio

Batch captioning tool for llama.cpp vision models. A web UI (Next.js/React) that talks to a llama.cpp server's OpenAI-compatible API: upload a batch of images, pick a caption mode, and get the captions back as a ZIP file.

## What It Does

- Connect to a local or remote llama.cpp server (OpenAI-compatible API)
- Auto-discover loaded vision models
- Upload images in bulk (drag-and-drop or file picker)
- Generate detailed captions with streaming token feedback
- Three prompt modes: **Krea 2** (three-phase captioning with character description), **For Anima** (whole-image description grounded in booru tags, with built-in WD Tagger tagging), and **MOSS-Image** (strict JSON recaptioning per the MOSS-Image user guide)
- Optional trigger word injection for character/subject naming (Krea 2 mode)
- llama.cpp **KV cache reuse**: workers are pinned to server slots so Krea 2's three phases (and image batches) reuse cached image encodings; the UI shows the prompt-token reuse percentage per batch
- Transient server errors (5xx/429) are retried automatically with exponential backoff
- Download all images + captions as a ZIP file

## What It Can't Do

- It does not manage models: at least one vision-capable model must already be loaded in a running `llama-server`
- It does NOT send an `Authorization` header to the llama.cpp server. If your server requires an API key, handle it in front of the server (e.g. a reverse proxy)
- One server and one model per batch
- Batches are limited to 5,000 images per session
- Results live in the server's temp area for **30 minutes after last activity** - download the ZIP before then (each download extends the window)
- For Anima's built-in tagging needs the tag-service microservice (included in the Docker setup, below). Krea 2 and MOSS-Image need no extra service
- The web app is single-instance: running multiple replicas of the container does not work

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

### 3. tag-service (optional - For Anima built-in tagging only)

For Anima's built-in tagging calls a small WD Tagger microservice that ships in `tag-service/`. The Docker setup below runs it for you. To run it yourself (e.g. for local development), see `tag-service/README.md`.

## Running the App

### Option A: Docker (recommended)

```bash
docker compose up -d --build
```

This builds and starts **both** services: Caption Studio at `http://localhost:8800` and the tag-service on port 8801 inside the Docker network (used by For Anima's built-in tagging).

The Docker config sets `DEFAULT_SERVER_URL=http://host.docker.internal:8080` so it can reach a llama.cpp server running on your host machine.

The compose file mounts a Hugging Face cache directory read-only for tag-service; the ≈ 600 MB WD Tagger model is downloaded on first use. Adjust the mount path for your machine - see `tag-service/README.md`.

### Option B: Local Development

```bash
bun install
bun run dev
```

The app starts at `http://localhost:3000`. Make sure your llama.cpp server is running on `localhost:8080` (the default). For Anima's built-in tagging additionally needs tag-service running locally (see `tag-service/README.md`).

## How to Use

### Step 1: Connect to Your Server

The app opens with a server URL input field. Enter your llama.cpp server URL (e.g., `http://localhost:8080`). The app auto-polls every 3 seconds until the server responds with a green "Server Available" indicator.

If running in Docker and your server is on the host machine, use `http://host.docker.internal:8080`.

Click **Next** when the server is available.

### Step 2: Choose a Mode

| Mode | Best For |
|------|----------|
| **Krea 2** | Dataset captioning with character-aware de-duplication - three-phase pipeline removes repetitive character traits and distills to a concise prompt |
| **For Anima** | Dataset captioning with booru tags - tags images with the built-in WD Tagger (or bring your own tag files), then describes the whole image as seen (tags as grounding) and transcribes any visible text verbatim |
| **MOSS-Image** | Post-training data collection - recaptions each image as a strict JSON caption object (long/medium/short + watermark boxes + borders) following the MOSS-Image user guide |

Before picking a mode you can set the **session timeout** (minutes): how long the server waits for a large batch to finish uploading before closing the session. 30 min by default, up to 3h (180 min) for very large or slow batches.

### Step 3: Upload Images

Drag and drop images or click to browse. Accepted formats: PNG, JPEG, GIF, WebP, AVIF, and TIFF. Oversized uploads (over 10 MB) are also accepted: after the upload step the intermediate file is downscaled to a JPEG at or below the 10 MB limit, and a warning event names the downscaled images. Non-PNG/JPEG images are automatically converted to JPEG before sending to the API. Images that fail validation (undecodable data, or the 5,000-image per-session cap reached) are not silently dropped: each affected row shows its rejection reason, and a warning event summarizes the rejections.

Large batches are supported (up to 5,000 images per session). In **For Anima mode**, batches larger than one chunk upload in chunks sized to the server's parallelism (twice the `--parallel` slot count, so the worker pool stays fed): captioning starts from the first chunk while the rest of the batch is still uploading, so you do not wait for the whole upload before the first tokens appear. Krea 2 and MOSS-Image modes send the whole batch in a single request, so with very large batches in those modes you wait for the full upload before the first caption starts.

### Step 4: Configure

**Model selector:** Auto-populated with vision models from your server. Pick the one you want.

**Max image dimension** (optional, Krea 2 mode only): images are downscaled to 1536px by default. Raise the value (256-4096, alongside a matching `--image-max-tokens` on the server) for more detail.

**Krea 2 mode** adds the prompt configuration:

- **System message:** Sets the overall instructions for the model. The default is optimized for generating detailed, reusable image generation prompts and includes strict NSFW-enabling policies that require explicit description of all visible content without censorship.
- **Trigger words (optional):** If you use consistent character or subject names in your images, enter them here:
  - **Person:** Character name - injected as "The Character in question is called 'Alice'."
  - **Other:** Object, style, or concept name - injected with context about what it refers to
- **User message:** The prompt applied to each image (used as Phase 1 of the pipeline).
- **Character description (required):** A natural language description of what defines the character across all images (see [Krea 2 Mode](#krea-2-mode)).

**For Anima mode** uses its own built-in prompts - there is no editable system/user message (see [For Anima Mode](#for-anima-mode)).

**MOSS-Image mode** gets the same prompt editor: the **recaptioner prompt** (system message) defaults to the MOSS-Image guide's prompt and is fully editable - your version is used as-is for every image. The **user message** is a short per-image instruction (default "Caption this image.") with per-image grounding (subject description, reference caption) appended automatically. You can optionally add a **subject description** of what is being captioned, so the model names and describes the subject consistently.

### Step 5: Start Captioning

Click **Start Captioning**. You'll see:

- A thumbnail strip showing all images and their status
- The selected image with its streaming caption (tokens appear in real-time)
- Reasoning output (collapsible) if the model supports it
- Progress: completed / failed / processing / queued counts

In Krea 2 and For Anima mode captions stream in live. MOSS-Image runs one non-streaming call per image, so a row stays "processing" until its full JSON caption arrives.

You can **Stop** processing mid-batch if needed.

### Step 6: Download Results

When all images are processed, click **Download ZIP**. The ZIP contains an `img/` folder with all images plus matching `.txt` caption files. For Anima mode additionally includes a `.tags` file per image (booru tags only, for embedding clean metadata into LoRA files).

Results are auto-cleaned 30 minutes after last activity - downloading a session extends that window.

## Krea 2 Mode

This mode is designed for creating high-quality dataset captions optimized for the Krea 2 text-to-image model. It works in three phases, all within a single conversation per image:

1. **Phase 1 - Initial captioning:** the vision model captions the image using your configured prompt.
2. **Phase 2 - Per-image refinement:** the LLM produces a caption that **excludes features consistent with your character description** (hair color, eye color, body type, etc.) and **focuses on what is unique** in each image (pose, expression, background, lighting, accessories, etc.).
3. **Phase 3 - Krea 2 prompt distillation:** the LLM distills the refined caption into a tight, flowing prose paragraph (60-150 words) that preserves all essential visual information while removing redundancy, verbose phrasing, and hedging language. This is the **inverse of prompt expansion**.

The image is only sent in Phase 1; Phases 2 and 3 reuse the cached image encoding, which significantly reduces latency compared to three separate API calls.

The default system prompt enforces strict NSFW-enabling policies, requiring explicit description of all visible content without censorship. Captions always anchor the subject's line of sight to the camera (e.g. "looking directly at the camera", "gazing off to the left of the camera") - never relative to the viewer.

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

The `.txt` file in the downloaded ZIP is the **Phase 3 distilled prompt** - not the Phase 1 raw caption. The per-phase captions remain visible in the UI during processing.

Phase 1 has a 15-minute timeout; phases 2/3 have a 5-minute timeout each.

## For Anima Mode

This mode is designed for creating high-quality dataset captions for the [Anima](https://github.com/CircleStone-Labs/Anima) text-to-image model. It combines automated booru tagging with LLM-generated natural language descriptions.

The system prompt enforces strict NSFW-enabling policies, requiring explicit description of all visible content without censorship. The addition must always state each character's line of sight - direct eye contact is described as "looking at the viewer" (booru convention, space-separated), averted gaze names the direction. Readable text in the image (speech bubbles, captions, signs, titles, overlays) is transcribed verbatim - exact wording, original language, original capitalization - in double quotes, with its position in the image stated. The booru tags are grounding only: the description stays consistent with them but never rephrases or echoes them.

### Workflow

1. **Tag the images:** In For Anima mode, upload your images and start the built-in tagging step. The app calls the [tag-service](tag-service/README.md) (WD Tagger, `SmilingWolf/wd-convnext-tagger-v3`) image by image so you can watch per-image progress, then review/adjust the generated tags. If you already have tags (e.g. from [taggui](https://github.com/jhc13/taggui)), you can upload your images together with matching `.txt` caption files instead and skip the tagging step.
2. **LLM enhancement:** The vision model describes the whole image as seen - spatial relationships, mood, atmosphere, action, expressions - using the booru tags as grounding (consistent with them, never rephrasing or echoing them). Any readable text in the image is transcribed verbatim in double quotes, with its position in the image.
3. **Final caption:** The output caption combines the original booru tags with the LLM-generated addition.

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

### Downloaded Files

The ZIP contains, per image: the image itself, a `.txt` with the final caption (tags + LLM addition), and a `.tags` file with the booru tags only (for embedding clean metadata into LoRA files).

## MOSS-Image Mode

This mode implements the image-captioning recipe from the [MOSS-Image user guide](https://github.com/OpenMOSS/MOSS-Image/blob/main/USERGUIDE.md#post-training) (Post-Training, "Image Captioning"). Each image is sent with the recaptioner prompt as the system message (editable in the config phase; the guide's prompt is the default) plus a short user message (default "Caption this image."), and the model answers with a strict JSON caption object - the data format used to post-train MOSS-Image-Base:

```json
{
  "caption": { "long": "...", "medium": "...", "short": "..." },
  "watermark": [{ "box_2d": [x1, y1, x2, y2], "label": "visible text" }],
  "borders": ["none"]
}
```

**Reference captions:** upload a `.txt` file next to an image (same filename stem) and its content grounds the model on the original caption. Images without a reference caption are recaptioned without one.

**Subject description (optional):** in the config phase, describe the subject that appears in the images (a character, product, or scene). The model uses it to name and describe the subject consistently across all captions.

**Options:** sampling and the output length are the llama-server's pre-configured defaults - the app does not override them per request. Each image has a 15-minute timeout.

### Downloaded Captions

The `.txt` in the downloaded ZIP is the **normalized JSON caption object**. If the model's output does not parse as the guide's schema, the trimmed raw output is saved instead - surfaced, not lost.

## Prompt Variables

Krea 2 mode's user message supports one placeholder:

| Variable | Replaced With |
|----------|--------------|
| `{trigger}` | The combined trigger words (person + other) |

Trigger words are additionally appended to the user message as context sentences (one per non-empty field), regardless of the placeholder.

## Environment Variables

All variables are optional (defaults shown). See `.env.example`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_SERVER_URL` | `http://localhost:8080` | Pre-filled server URL in the UI |
| `DOCKER_HOST_INTERNAL` | *(unset)* | Host override for server-side calls from Docker. The compose file sets it to `host.docker.internal` so browser-supplied `localhost` URLs reach your host's llama.cpp server |
| `TAG_SERVICE_URL` | `http://localhost:8801` | Base URL of the [WD Tagger microservice](tag-service/README.md) (For Anima built-in tagging) |

## Development

```bash
bun install           # install dependencies
bun run dev           # start dev server
bun run build         # production build
bun run lint          # lint code
bun run typecheck     # type check (tsc --noEmit)
bun test              # unit + route integration tests (no llama.cpp needed)
bun test --watch      # tests in watch mode
bun run test:e2e      # Playwright e2e (needs the app and a llama.cpp server)
bun run docker:up     # docker compose up -d --build
```

The `bun test` suite stubs the llama.cpp server, so it runs anywhere. Run `bun run typecheck`, `bun run lint`, and `bun test` before pushing. Copy `.env.example` to `.env` only if you need non-default values.

## Getting Help

- **Server not discovered?** Make sure the server is running and `curl <serverUrl>/v1/models` returns a JSON model list. The app only shows models that report both `text` and `image` input modalities.
- **Built-in tagging not working?** Check that tag-service is running (Docker: it is part of the same compose stack; local: see `tag-service/README.md`) and that `TAG_SERVICE_URL` points at it. Its `/health` endpoint reports whether the model is loaded.
- **App not working?** The app exposes a `/api/health` endpoint that reports whether the temp area is writable and the state of the session cleanup job.
- **Something else broken?** Report bugs and request features on GitHub: <https://github.com/MaxKruse/Caption-Studio/issues>. Include the mode you were using, the llama.cpp version, and the relevant browser/server logs.
