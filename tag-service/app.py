"""
WD Tagger microservice.
Runs the SmilingWolf/wd-convnext-tagger-v3 ONNX model for danbooru-style tagging.
Accepts images via HTTP, returns comma-separated tags.
"""

import csv
import io
import logging
import os
import zipfile
from pathlib import Path

import huggingface_hub
import numpy as np
from flask import Flask, Response, jsonify, request
from onnxruntime import (
    ExecutionMode,
    GraphOptimizationLevel,
    InferenceSession,
    SessionOptions,
    get_available_providers,
)
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model loading (lazy, on first request)
# ---------------------------------------------------------------------------

MODEL_ID = "SmilingWolf/wd-convnext-tagger-v3"
MODEL = None
TAGS = []
RATING_INDICES = []
GENERAL_INDICES = []
CHARACTER_INDICES = []
INPUT_DIM = 256

# Kaomoji tags to exclude
KAOMOJIS = {
    "0_0", "(o)_(o)", "+_+", "+_-", "._.", "<o>_<o>", "<|>_<|>", "=_=",
    ">_<", "3_3", "6_9", ">_o", "@_@", "^_^", "o_o", "u_u", "x_x", "|_|",
    "||_||",
}


def _load_model():
    """Download (if needed) and load the ONNX model into memory."""
    global MODEL, TAGS, RATING_INDICES, GENERAL_INDICES, CHARACTER_INDICES, INPUT_DIM

    logger.info("Loading WD Tagger model...")

    # Resolve model path: check local HF cache first, then download.
    model_path = Path(MODEL_ID) / "model.onnx"
    if not model_path.is_file():
        model_path = Path(
            huggingface_hub.hf_hub_download(MODEL_ID, filename="model.onnx")
        )

    tags_path = Path(MODEL_ID) / "selected_tags.csv"
    if not tags_path.is_file():
        tags_path = Path(
            huggingface_hub.hf_hub_download(MODEL_ID, filename="selected_tags.csv")
        )

    # Configure ONNX Runtime for CPU.
    session_options = SessionOptions()
    session_options.graph_optimization_level = GraphOptimizationLevel.ORT_ENABLE_ALL
    session_options.execution_mode = ExecutionMode.ORT_PARALLEL
    session_options.intra_op_num_threads = os.cpu_count() or 1
    session_options.inter_op_num_threads = 1

    providers = ["CPUExecutionProvider"]
    MODEL = InferenceSession(
        str(model_path), sess_options=session_options, providers=providers
    )

    # Read tag metadata.
    with open(tags_path, "r") as f:
        reader = csv.DictReader(f)
        for idx, line in enumerate(reader):
            tag = line["name"]
            if tag not in KAOMOJIS:
                tag = tag.replace("_", " ")
            TAGS.append(tag)
            cat = line["category"]
            if cat == "9":
                RATING_INDICES.append(idx)
            elif cat == "0":
                GENERAL_INDICES.append(idx)
            elif cat == "4":
                CHARACTER_INDICES.append(idx)

    INPUT_DIM = MODEL.get_inputs()[0].shape[2]
    logger.info(
        "Model loaded: %d tags, input dim %d, provider: %s",
        len(TAGS),
        INPUT_DIM,
        providers[0],
    )


# ---------------------------------------------------------------------------
# Image preprocessing
# ---------------------------------------------------------------------------


def _preprocess_image(pil_image: Image.Image) -> np.ndarray:
    """Preprocess a PIL image to model input format (1, C, H, W).

    Steps:
    1. Add white background for transparency
    2. Pad to square
    3. Resize to INPUT_DIM
    4. RGB -> BGR
    5. Add batch dimension
    """
    # Handle transparency
    if pil_image.mode == "RGBA":
        canvas = Image.new("RGBA", pil_image.size, (255, 255, 255))
        canvas.alpha_composite(pil_image)
        pil_image = canvas.convert("RGB")
    elif pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    # Pad to square
    max_dim = max(pil_image.size)
    canvas = Image.new("RGB", (max_dim, max_dim), (255, 255, 255))
    h_pad = (max_dim - pil_image.width) // 2
    v_pad = (max_dim - pil_image.height) // 2
    canvas.paste(pil_image, (h_pad, v_pad))

    # Resize
    if max_dim != INPUT_DIM:
        canvas = canvas.resize((INPUT_DIM, INPUT_DIM), Image.Resampling.BICUBIC)

    # Convert to numpy: (H, W, C) -> RGB -> BGR -> (1, C, H, W)
    arr = np.array(canvas, dtype=np.float32)
    arr = arr[:, :, ::-1]  # RGB -> BGR
    arr = np.expand_dims(arr, axis=0)
    return arr


# ---------------------------------------------------------------------------
# Tag selection
# ---------------------------------------------------------------------------


def _select_tags(
    probabilities: np.ndarray,
    min_probability: float = 0.35,
    max_tags: int = 50,
    tags_to_encourage: list[str] | None = None,
    tags_to_exclude: list[str] | None = None,
) -> list[tuple[str, float]]:
    """Select top tags from raw probabilities."""
    rating_mask = np.ones(len(TAGS), dtype=bool)
    for idx in RATING_INDICES:
        rating_mask[idx] = False

    tags = [t for t, keep in zip(TAGS, rating_mask) if keep]
    probs = probabilities[rating_mask]

    exclude_set = set(tags_to_exclude or [])
    encourage_list = tags_to_encourage or []

    tag_probs = dict(zip(tags, probs))

    # Encouraged tags: must be in model's tag list, not excluded, and >= min_probability
    encouraged = []
    for tag in encourage_list:
        if tag in tag_probs and tag not in exclude_set and tag_probs[tag] >= min_probability:
            encouraged.append((tag, tag_probs[tag]))

    encouraged_set = {t for t, _ in encouraged}

    # Normal tags: pass threshold, not excluded, not already encouraged
    normal = []
    for tag, prob in zip(tags, probs):
        if tag in exclude_set or tag in encouraged_set:
            continue
        if prob >= min_probability:
            normal.append((tag, prob))

    # Sort by probability descending
    normal.sort(key=lambda x: x[1], reverse=True)

    # Fill remaining slots
    remaining = max(0, max_tags - len(encouraged))
    normal = normal[:remaining]

    return encouraged + normal


# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"ok": True, "modelLoaded": MODEL is not None})


@app.route("/tag", methods=["POST"])
def tag():
    """Tag a single image.

    Expects JSON body:
    {
        "image": "<base64 encoded image>",
        "minProbability": 0.35,
        "maxTags": 50,
        "tagsToEncourage": "tag1, tag2",
        "tagsToExclude": "tag3, tag4"
    }

    Returns:
    {
        "tags": ["tag1", "tag2", ...],
        "tagsWithProbs": [{"tag": "tag1", "probability": 0.99}, ...]
    }
    """
    global MODEL

    if MODEL is None:
        _load_model()

    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "Missing 'image' field"}), 400

    # Decode base64 image
    try:
        image_bytes = io.BytesIO(__import__("base64").b64decode(data["image"]))
        pil_image = Image.open(image_bytes)
        pil_image = Image.ImageOps.exif_transpose(pil_image)
    except Exception as e:
        logger.error("Failed to decode image: %s", e)
        return jsonify({"error": f"Failed to decode image: {e}"}), 400

    # Preprocess
    image_array = _preprocess_image(pil_image)

    # Run inference
    input_name = MODEL.get_inputs()[0].name
    output_name = MODEL.get_outputs()[0].name
    probabilities = MODEL.run(
        [output_name], {input_name: image_array}
    )[0][0].astype(np.float32)

    # Parse parameters
    min_probability = float(data.get("minProbability", 0.35))
    max_tags = int(data.get("maxTags", 50))
    encourage_raw = (data.get("tagsToEncourage") or "").strip()
    exclude_raw = (data.get("tagsToExclude") or "").strip()

    tags_to_encourage = [t.strip() for t in encourage_raw.split(",") if t.strip()] if encourage_raw else []
    tags_to_exclude = [t.strip() for t in exclude_raw.split(",") if t.strip()] if exclude_raw else []

    # Select tags
    selected = _select_tags(
        probabilities,
        min_probability=min_probability,
        max_tags=max_tags,
        tags_to_encourage=tags_to_encourage,
        tags_to_exclude=tags_to_exclude,
    )

    tags = [t for t, _ in selected]
    tags_with_probs = [{"tag": t, "probability": round(float(p), 4)} for t, p in selected]

    return jsonify({
        "tags": tags,
        "tagsWithProbs": tags_with_probs,
    })


@app.route("/tag-batch", methods=["POST"])
def tag_batch():
    """Tag multiple images in a single request.

    Expects JSON body:
    {
        "images": ["<base64>", "<base64>", ...],
        "minProbability": 0.35,
        "maxTags": 50,
        "tagsToEncourage": "tag1, tag2",
        "tagsToExclude": "tag3, tag4"
    }

    Returns:
    {
        "results": [
            {"tags": [...], "tagsWithProbs": [...]},
            ...
        ]
    }
    """
    global MODEL

    if MODEL is None:
        _load_model()

    data = request.get_json()
    if not data or "images" not in data:
        return jsonify({"error": "Missing 'images' field"}), 400

    images_b64 = data["images"]
    if not isinstance(images_b64, list) or len(images_b64) == 0:
        return jsonify({"error": "'images' must be a non-empty array"}), 400

    # Parse parameters
    min_probability = float(data.get("minProbability", 0.35))
    max_tags = int(data.get("maxTags", 50))
    encourage_raw = (data.get("tagsToEncourage") or "").strip()
    exclude_raw = (data.get("tagsToExclude") or "").strip()

    tags_to_encourage = [t.strip() for t in encourage_raw.split(",") if t.strip()] if encourage_raw else []
    tags_to_exclude = [t.strip() for t in exclude_raw.split(",") if t.strip()] if exclude_raw else []

    # Preprocess all images and stack into a single batch
    arrays = []
    for b64 in images_b64:
        try:
            image_bytes = io.BytesIO(__import__("base64").b64decode(b64))
            pil_image = Image.open(image_bytes)
            pil_image = Image.ImageOps.exif_transpose(pil_image)
            arrays.append(_preprocess_image(pil_image))
        except Exception as e:
            logger.error("Failed to decode image: %s", e)
            return jsonify({"error": f"Failed to decode image: {e}"}), 400

    batch_array = np.concatenate(arrays, axis=0)

    # Run batch inference
    input_name = MODEL.get_inputs()[0].name
    output_name = MODEL.get_outputs()[0].name
    all_probs = MODEL.run(
        [output_name], {input_name: batch_array}
    )[0].astype(np.float32)

    # Select tags for each image
    results = []
    for probs in all_probs:
        selected = _select_tags(
            probs,
            min_probability=min_probability,
            max_tags=max_tags,
            tags_to_encourage=tags_to_encourage,
            tags_to_exclude=tags_to_exclude,
        )
        tags = [t for t, _ in selected]
        tags_with_probs = [
            {"tag": t, "probability": round(float(p), 4)} for t, p in selected
        ]
        results.append({"tags": tags, "tagsWithProbs": tags_with_probs})

    return jsonify({"results": results})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8801))
    logger.info("Starting tag service on port %d", port)
    app.run(host="0.0.0.0", port=port)
