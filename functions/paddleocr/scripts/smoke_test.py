#!/usr/bin/env python3
"""Run the real Firebase handler locally with PP-OCRv6 and no outbound network."""

import base64
import io
import json
from pathlib import Path
import resource
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

NETWORK_ATTEMPTS = []


def block_network(event, args):
    if event in {"socket.connect", "socket.connect_ex", "socket.getaddrinfo", "socket.sendto"}:
        NETWORK_ATTEMPTS.append(event)
        raise RuntimeError(f"The local smoke test forbids network access: {event}")


def main():
    sys.addaudithook(block_network)
    started = time.perf_counter()
    from flask import Flask, request
    from PIL import Image, ImageDraw, ImageFont
    from main import extractPaddleOcrText

    app = Flask(__name__)
    app.add_url_rule("/", view_func=lambda: extractPaddleOcrText(request), methods=["POST"])
    image = Image.new("RGB", (1100, 250), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=56)
    draw.text((40, 35), "RHX OCR 12345", fill="black", font=font)
    draw.text((40, 135), "LOCAL MODELS READY", fill="black", font=font)
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    payload = {"image": {"mimeType": "image/png", "base64": base64.b64encode(stream.getvalue()).decode("ascii")}}
    with app.test_client() as client:
        response = client.post("/", json=payload)
        result = response.get_json()
        if response.status_code != 200:
            raise RuntimeError(f"Local OCR failed: HTTP {response.status_code}; {result}")
        normalized = "".join(c for c in result["text"].upper() if c.isalnum())
        if "RHXOCR12345" not in normalized or "LOCALMODELSREADY" not in normalized:
            raise RuntimeError("The local OCR result did not match both fixture lines.")
    if NETWORK_ATTEMPTS:
        raise RuntimeError(f"Network calls attempted: {NETWORK_ATTEMPTS}")
    print(json.dumps({
        "status": "passed",
        "scope": "local Firebase handler; not deployed Firebase",
        "model": result["model"],
        "text": result["text"],
        "elapsedSeconds": round(time.perf_counter() - started, 3),
        "peakMemoryMiB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        "networkAttempts": 0,
    }, indent=2))


if __name__ == "__main__":
    main()
