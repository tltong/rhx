"""HTTP input and error behavior; no model or network access is needed."""

import base64
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

from flask import Flask
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service import MAX_BASE64_LENGTH, MODEL, handle_request


def image_payload(format="PNG", mode="RGB", color="white"):
    stream = io.BytesIO()
    Image.new(mode, (20, 10), color).save(stream, format=format)
    return {
        "image": {
            "mimeType": {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[format],
            "base64": base64.b64encode(stream.getvalue()).decode("ascii"),
        },
        "model": MODEL,
    }


class HttpContractTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.result = {"text": "Sample text", "warnings": [], "provider": "paddleocr", "model": MODEL}
        self.recognize = Mock(return_value=self.result)

    def request(self, payload=None, **kwargs):
        if "data" not in kwargs and payload is not None:
            kwargs["data"] = json.dumps(payload)
        kwargs.setdefault("method", "POST")
        kwargs.setdefault("content_type", "application/json")
        with self.app.test_request_context("/", **kwargs):
            from flask import request
            return handle_request(request, recognize=self.recognize)

    def test_supported_images_return_the_standard_contract(self):
        for format in ("PNG", "JPEG", "WEBP"):
            with self.subTest(format=format):
                response = self.request(image_payload(format))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json(), self.result)
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                self.assertTrue(response.headers["X-Request-ID"])

    def test_transparency_is_flattened_on_white(self):
        def recognize(image):
            self.assertEqual(image.mode, "RGB")
            self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))
            return self.result
        self.recognize.side_effect = recognize
        self.assertEqual(self.request(image_payload(mode="RGBA", color=(0, 0, 0, 0))).status_code, 200)

    def test_invalid_transport_never_runs_ocr(self):
        cases = [
            ({"method": "GET"}, 405),
            ({"content_type": "text/plain", "data": "{}"}, 415),
            ({"data": "{malformed"}, 400),
            ({"data": "[]"}, 400),
        ]
        for kwargs, status in cases:
            with self.subTest(kwargs=kwargs):
                response = self.request(**kwargs)
                self.assertEqual(response.status_code, status)
                self.assertIn("requestId", response.get_json())
        self.recognize.assert_not_called()

    def test_invalid_images_and_models_never_run_ocr(self):
        cases = []
        for value in ("not base64!", "data:image/png;base64,AAAA", "AAAA\n", [], ""):
            payload = image_payload()
            payload["image"]["base64"] = value
            cases.append(payload)
        mismatch = image_payload()
        mismatch["image"]["mimeType"] = "image/jpeg"
        cases.extend([
            mismatch,
            {"image": None},
            {**image_payload(), "model": "unavailable-model"},
            {**image_payload(), "languageHint": ["zh"]},
        ])
        for payload in cases:
            with self.subTest(payload_model=payload.get("model")):
                self.assertEqual(self.request(payload).status_code, 400)
        self.recognize.assert_not_called()

    def test_oversized_base64_is_rejected_before_inference(self):
        payload = image_payload()
        payload["image"]["base64"] = "A" * (MAX_BASE64_LENGTH + 4)
        self.assertEqual(self.request(payload).status_code, 413)
        self.recognize.assert_not_called()

    def test_excessive_dimensions_are_rejected(self):
        stream = io.BytesIO()
        Image.new("RGB", (8193, 1), "white").save(stream, format="PNG")
        payload = image_payload()
        payload["image"]["base64"] = base64.b64encode(stream.getvalue()).decode("ascii")
        self.assertEqual(self.request(payload).status_code, 400)
        self.recognize.assert_not_called()

    def test_animated_images_are_rejected(self):
        stream = io.BytesIO()
        Image.new("RGB", (20, 10), "white").save(
            stream, format="PNG", save_all=True,
            append_images=[Image.new("RGB", (20, 10), "black")],
        )
        payload = image_payload()
        payload["image"]["base64"] = base64.b64encode(stream.getvalue()).decode("ascii")
        self.assertEqual(self.request(payload).status_code, 400)
        self.recognize.assert_not_called()

    def test_inference_errors_do_not_expose_internal_messages(self):
        self.recognize.side_effect = RuntimeError("private image text or internal path")
        with self.assertLogs(level="ERROR") as captured:
            response = self.request(image_payload())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["error"]["code"], "ocr-unavailable")
        self.assertNotIn("private image text", response.get_data(as_text=True))
        self.assertNotIn("private image text", " ".join(captured.output))


if __name__ == "__main__":
    unittest.main()
