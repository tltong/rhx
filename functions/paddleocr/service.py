"""Validate the HTTP contract before allocating an OCR predictor."""

import base64
import binascii
import io
import json
import logging
import uuid
import warnings

from flask import Response
from PIL import Image, ImageOps, UnidentifiedImageError

from ocr_engine import MODEL, extract_text

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_BASE64_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
MAX_REQUEST_BYTES = MAX_BASE64_LENGTH + 16 * 1024
MAX_DIMENSION = 8192
MAX_PIXELS = 16_000_000
FORMATS = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}


class InvalidRequest(ValueError):
    def __init__(self, message, status=400, code="invalid-argument"):
        super().__init__(message)
        self.status = status
        self.code = code


def decode_image(payload):
    """Return a fully decoded RGB image with its declared type and limits checked."""
    image = payload.get("image")
    if not isinstance(image, dict):
        raise InvalidRequest("Provide image.mimeType and image.base64.")
    mime_type = image.get("mimeType")
    if not isinstance(mime_type, str) or mime_type not in FORMATS:
        raise InvalidRequest("Use a PNG, JPEG, or WebP image.")
    encoded = image.get("base64")
    if not isinstance(encoded, str) or not encoded:
        raise InvalidRequest("Provide image.base64 without a data URL prefix.")
    if len(encoded) > MAX_BASE64_LENGTH:
        raise InvalidRequest("The image exceeds the 8 MiB limit.", status=413)
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise InvalidRequest("image.base64 must be valid base64.") from None
    if len(decoded) > MAX_IMAGE_BYTES:
        raise InvalidRequest("The image exceeds the 8 MiB limit.", status=413)
    if base64.b64encode(decoded).decode("ascii") != encoded:
        raise InvalidRequest("image.base64 must use canonical base64 encoding.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(decoded)) as source:
                if source.format != FORMATS[mime_type]:
                    raise InvalidRequest("The image contents do not match image.mimeType.")
                width, height = source.size
                if (
                    width < 1 or height < 1
                    or max(width, height) > MAX_DIMENSION
                    or width * height > MAX_PIXELS
                ):
                    raise InvalidRequest("Image limits are 8192 pixels per side and 16 megapixels.")
                if getattr(source, "n_frames", 1) != 1:
                    raise InvalidRequest("Submit a single-frame image.")
                source.load()
                oriented = ImageOps.exif_transpose(source)
                if oriented.mode in {"RGBA", "LA"} or "transparency" in oriented.info:
                    rgba = oriented.convert("RGBA")
                    background = Image.new("RGBA", rgba.size, "white")
                    background.alpha_composite(rgba)
                    return background.convert("RGB")
                return oriented.convert("RGB")
    except InvalidRequest:
        raise
    except (
        UnidentifiedImageError, OSError, ValueError, SyntaxError,
        Image.DecompressionBombWarning, Image.DecompressionBombError,
    ):
        raise InvalidRequest("The image could not be decoded safely.") from None


def _response(payload, status, request_id):
    return Response(
        json.dumps(payload, ensure_ascii=False),
        status=status,
        mimetype="application/json",
        headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
    )


def handle_request(request, recognize=None):
    """Accept the normalized image contract used by the application's OCR feature."""
    request_id = str(uuid.uuid4())
    try:
        if request.method != "POST":
            raise InvalidRequest("Use POST.", status=405, code="invalid-method")
        if request.mimetype != "application/json":
            raise InvalidRequest("Use Content-Type: application/json.", status=415)
        if request.content_length is not None and request.content_length > MAX_REQUEST_BYTES:
            raise InvalidRequest("The request body is too large.", status=413)
        raw = request.get_data(cache=True)
        if len(raw) > MAX_REQUEST_BYTES:
            raise InvalidRequest("The request body is too large.", status=413)
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeError):
            raise InvalidRequest("Provide a valid JSON request object.") from None
        if not isinstance(payload, dict):
            raise InvalidRequest("Provide a JSON request object.")
        if payload.get("model", MODEL) != MODEL:
            raise InvalidRequest(f"The supported model is {MODEL}.")
        language_hint = payload.get("languageHint", "auto")
        if not isinstance(language_hint, str) or len(language_hint) > 200:
            raise InvalidRequest("languageHint must be a string of at most 200 characters.")
        with decode_image(payload) as image:
            result = (recognize or extract_text)(image)
        return _response(result, 200, request_id)
    except InvalidRequest as error:
        response = _response(
            {"error": {"code": error.code, "message": str(error)}, "requestId": request_id},
            error.status,
            request_id,
        )
        if error.status == 405:
            response.headers["Allow"] = "POST"
        return response
    except Exception as error:
        # Images, recognized text, and exception messages are excluded from logs.
        logging.error("PaddleOCR request failed request_id=%s error_type=%s", request_id, type(error).__name__)
        return _response(
            {"error": {"code": "ocr-unavailable", "message": "PaddleOCR is unavailable."}, "requestId": request_id},
            503,
            request_id,
        )
