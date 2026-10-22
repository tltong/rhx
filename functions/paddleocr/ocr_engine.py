"""CPU PaddleOCR inference using bundled, checksum-pinned PP-OCRv6 models."""

from __future__ import annotations

import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import tempfile
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from PIL import Image

MODEL = "PP-OCRv6_medium"
ROOT = Path(__file__).resolve().parent
_PIPELINE = None
_LOCK = threading.Lock()
_PACKAGES = {"paddleocr": "3.7.0", "paddlepaddle": "3.3.1", "paddlex": "3.7.2"}


def _verify_models() -> None:
    manifest = json.loads((ROOT / "models.json").read_text(encoding="utf-8"))
    if (ROOT / "models").is_symlink():
        raise RuntimeError("The bundled models directory must not be a symlink.")
    for name in (f"{MODEL}_det", f"{MODEL}_rec"):
        directory = ROOT / "models" / name
        if directory.is_symlink():
            raise RuntimeError(f"Model directory must not be a symlink: {name}")
        for filename, expected in manifest["models"][name]["files"].items():
            path = directory / filename
            if not path.is_file() or path.is_symlink():
                raise RuntimeError(f"Missing bundled model file: {name}/{filename}")
            with path.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != expected:
                raise RuntimeError(f"Bundled model checksum mismatch: {name}/{filename}")


def _load_pipeline():
    """Called while holding _LOCK; never download a model during inference."""
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    for package, expected in _PACKAGES.items():
        if version(package) != expected:
            raise RuntimeError(f"This model package requires {package}=={expected}.")
    _verify_models()
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(Path(tempfile.gettempdir()) / "rhx-paddlex"))
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    from paddleocr import PaddleOCR

    _PIPELINE = PaddleOCR(
        text_detection_model_name=f"{MODEL}_det",
        text_detection_model_dir=str(ROOT / "models" / f"{MODEL}_det"),
        text_recognition_model_name=f"{MODEL}_rec",
        text_recognition_model_dir=str(ROOT / "models" / f"{MODEL}_rec"),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device="cpu",
        enable_mkldnn=False,
        cpu_threads=2,
    )
    return _PIPELINE


def extract_text(image: Image.Image) -> dict:
    """Recognize a validated PIL image, serializing access to the CPU predictor."""
    # A predictor is reused across requests and must not execute concurrently.
    with _LOCK:
        pipeline = _load_pipeline()
        import numpy as np

        pixels = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()
        lines = []
        low_confidence = False
        for result in pipeline.predict(pixels):
            lines.extend(str(text) for text in result["rec_texts"])
            low_confidence = low_confidence or any(float(score) < 0.7 for score in result["rec_scores"])
        text = "\n".join(lines)
        warnings = []
        if not text.strip():
            warnings.append("No legible text was found in this image.")
        elif low_confidence:
            warnings.append("Some text has low recognition confidence. Review the transcription.")
        return {"text": text, "warnings": warnings, "provider": "paddleocr", "model": MODEL}
