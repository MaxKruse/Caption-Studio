# tag-service

WD Tagger microservice for danbooru-style image tagging. Runs the
[SmilingWolf/wd-convnext-tagger-v3](https://huggingface.co/SmilingWolf/wd-convnext-tagger-v3)
ONNX model under ONNX Runtime (Flask HTTP API).

Caption-Studio's `/api/tag` and `/api/tag/batch` endpoints proxy to this
service (see `TAG_SERVICE_URL` in `.env.example`).

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | `{ ok, modelLoaded }` - model loads lazily on first request |
| `/tag` | POST | Tag one image. Body: `{ image, minProbability?, maxTags?, customTags?, tagsToEncourage?, tagsToExclude? }` where `image` is a raw base64 string (no data-URL prefix). Returns `{ tags, tagsWithProbs }` |
| `/tag-batch` | POST | Tag many images in one call. Same fields plus `images: string[]`. Returns `{ results: [{ tags, tagsWithProbs }] }` (400 if any image fails to decode) |

The UI tags images one by one through `/tag` so it can show per-image
progress; `/tag-batch` is available for programmatic/CLI use.

## Running

### Docker (recommended)

```bash
docker compose up -d --build   # from the repo root (serves both services)
```

The compose file mounts a Hugging Face cache read-only so the model
(≈ 600 MB, downloaded on first run) is fetched once:

```yaml
volumes:
  - C:/Users/maxkr/.cache/huggingface:/root/.cache/huggingface:ro
```

Adjust the mount path for your machine (Linux: `~/.cache/huggingface`).

### Locally without Docker

```bash
cd tag-service
uv venv && uv pip install -r requirements.txt   # or: pip install -r requirements.txt
uv run python app.py                            # or: python app.py
```

The model is downloaded from the Hugging Face Hub on first request and
cached in the standard `HF_HOME` / `~/.cache/huggingface` location.

## Model loading

The model loads lazily on the first `/tag` or `/tag-batch` call (the first
request can take a while while ONNX Runtime warms up). `/health` reports
`modelLoaded: false` until then.
