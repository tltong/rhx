# PaddleOCR Firebase function

This is a separate Python 3.12 Firebase Functions codebase, `paddleocr`, under
`functions/paddleocr`. Firebase supplies Python. The source, pinned dependencies,
and verified PP-OCRv6 medium detection/recognition models supply the OCR runtime;
Node.js is not involved in recognition.

The exported HTTP function is `extractPaddleOcrText`. It is private by default
(`invoker="private"`) and intended for an IAM-authorized backend. Firebase user
authentication and provider selection remain the existing backend's job. This
package is called by `functions/utils/llm/paddleocr.js`, registered with the backend
`LlmUtil`. The Image OCR feature selects providers by language. See
`../features/image_ocr/README.md` for configuration, request routing, and IAM setup.

## Prepare locally

From the repository root, using Python 3.12:

```sh
python3.12 -m venv functions/paddleocr/venv
functions/paddleocr/venv/bin/python -m pip install -r functions/paddleocr/requirements.txt
python3 functions/paddleocr/scripts/prepare_models.py
python3 functions/paddleocr/scripts/prepare_models.py --verify
```

On this workspace, the existing verified models can instead be copied without
downloading:

```sh
python3 functions/paddleocr/scripts/prepare_models.py --source-dir /workspace/.rhx-ocr/models
```

`models.json` pins the official HTTPS archive URLs and SHA256 digests for the
archives and extracted files. Model binaries are ignored by Git but are included
in the Python Firebase upload. A fresh checkout needs the preparation step above.
The predeploy check fails if a required model is absent or has a different digest.
Model download is a preparation operation; inference uses bundled local files.

`requirements.in` records direct package choices. `requirements.txt` pins the
full resolved environment. To change dependencies, install the revised direct
requirements in a clean Python 3.12 venv, run `pip check` and the checks below,
then regenerate `requirements.txt` with that venv's `pip freeze`.

## HTTP contract

`POST` with `Content-Type: application/json`:

```json
{
  "image": {"mimeType": "image/png", "base64": "<base64 without a data URL prefix>"},
  "model": "PP-OCRv6_medium",
  "languageHint": "auto"
}
```

`model` and `languageHint` are optional. Only `PP-OCRv6_medium` is bundled.
The unified multilingual model handles recognition; `languageHint` does not
switch models or guarantee support for a language. Language eligibility belongs
in the backend's provider selection, and real handwriting still needs evaluation.

Success:

```json
{"text": "Recognized text", "warnings": [], "provider": "paddleocr", "model": "PP-OCRv6_medium"}
```

Errors return `{"error":{"code":"...","message":"..."},"requestId":"..."}`.
The `X-Request-ID` response header identifies requests. Input errors use HTTP
400/413/415, unsupported methods use 405, and OCR failures use 503. Images and
recognized text are excluded from application logs and are not persisted.

Limits: PNG/JPEG/WebP, one frame, 8 MiB decoded, 8192 pixels per side, and
16 megapixels. Transparency is flattened on white and EXIF orientation is applied.
Returned lines are joined with newlines; this is text recognition rather than
document layout reconstruction. Orientation-classifier/unwarping models are
disabled. A blank result returns a warning.

## Validate

```sh
functions/paddleocr/venv/bin/python -m unittest discover -s functions/paddleocr/tests -v
functions/paddleocr/venv/bin/python functions/paddleocr/scripts/smoke_test.py
```

The smoke test invokes the real Firebase Python handler with a generated image
and both actual models. It blocks outbound Python network calls, checks the two
fixture lines, and reports local elapsed time and peak process memory. It does
not establish deployed performance or handwriting accuracy.

## Firebase deployment

Deployment remains a separate operation. When authorized, use the repository's
deployment wrapper from the repository root:

```sh
bash scripts/deploy-firebase.sh codebase paddleocr
# Or deploy only this function:
bash scripts/deploy-firebase.sh function extractPaddleOcrText
```

The wrapper uses the existing project (`readyherox`) and configured deployment
credentials. No credentials are stored in this package. Model integrity is
checked before deployment; the nested Python directory is excluded from the
existing Node codebase's upload.

The initial settings are `us-central1`, 4 GiB RAM, two CPUs, one request per
instance, 0 minimum / 2 maximum instances, and a 240-second timeout. These are
starting limits to measure, not established production requirements. The model
is initialized lazily on the first OCR request and reused by subsequent requests.
Before connecting the backend, grant its service account Cloud Run Invoker access
to the second-generation function and use an audience-bound Google ID token.
The local test client does not test IAM; deployed unauthenticated rejection must
also be verified.

Deployment and a generated-image OCR request have been verified in Firebase's
managed runtime. Continue measuring cold and warm requests, memory, deadlines,
and representative handwriting before enabling this provider for a language.
The pinned OpenCV/PaddleX environment is kept together; installing a second,
headless OpenCV distribution alongside it is not a validated replacement.
