# Image OCR

The Web and Functions feature exposes `extractTextFromImage`, `getImageOcrConfig`,
`saveImageOcrConfig`, and `testImageOcr`.

```js
const result = await extractTextFromImage({
  image: {mimeType: "image/png", base64: imageBuffer.toString("base64")},
  language: "English", // selected syllabus/question language; required
  // Optional: detail, languageHint, additionalInstructions
});
// {text, warnings: string[], provider, model}
```

The Web API also accepts a File or Blob as `image`, including a canvas PNG.
It snapshots inputs and checks account changes before and after asynchronous work.
The image contract is `{mimeType, base64}` without a data URL prefix.

## Provider routing

The backend Image OCR feature normalizes the supplied language, reads the shared
`imageOcr/config` document, chooses its provider, and calls
`LlmUtil.extractTextFromImage(request, {provider, timeoutMs, signal})`.
The routing portion of the configuration is:

```json
{
  "languageProviders": {
    "english": "paddleocr",
    "chinese": "deepseek"
  }
}
```

Language keys use Unicode NFKC normalization, trimmed/collapsed whitespace, and
lowercase. New languages and languages without an override use OpenAI. Provider
errors are reported without automatic retries or switching to another provider.
Normal extraction rejects caller `provider` and `model` overrides. `languageHint`
is recognition guidance and does not select the provider.

The available adapters are OpenAI (`gpt-6.1-sol` or `gpt-6-astra`), DeepSeek
(`deepseek-flash`), and PaddleOCR (`PP-OCRv6_medium`). The shared OpenAI model setting
selects the fallback model; DeepSeek and PaddleOCR use their listed models.
The retained `provider` configuration field is always `openai`.

Old global DeepSeek settings are normalized to the OpenAI fallback when read,
retaining valid instructions, language hints, and request limits. Reads do not
write a migration or create a config document. Existing OpenAI model choices and
explicit language overrides are retained. Invalid stored settings fail visibly.

## Web and backend

The Web Image OCR feature calls the shared `ImageOcrClient`, which attaches the
Firebase user token and sends image plus language to `extractLlmImageText`.
The Node HTTP handler verifies that token. Its Image OCR feature resolves routing
and delegates execution through the backend provider registry. The web feature
uses one transport for all providers.

The HTTP actions are `extract`, `getConfig`, `saveConfig`, and `test`. Saving and
running draft tests require a verified site administrator. The HTTP handler derives
the actor from the verified user; caller-supplied actor IDs are ignored.
`testImageOcr({image, language, configuration})` uses unsaved settings without saving.
Functions callers supply `{updatedBy: administratorUid}` as the administrator
context for saves and tests.

The existing HTTPS function binds `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` for its
LLM adapters. PaddleOCR uses Google service identity rather than either key.

## PaddleOCR adapter

`functions/utils/llm/paddleocr.js` exports `PaddleOcrUtil` and its registered singleton.
It validates the image/model, obtains an audience-bound Google ID token through
Application Default Credentials, and POSTs to the private Python function.
The auth client is reused and refreshes tokens as needed. The entire operation,
including authentication and response reading, shares one deadline and supports
caller cancellation. The inference POST has retries and redirects disabled.
Raw credentials, image data, provider error bodies, and recognized text are not logged.

`PADDLEOCR_URL` is an optional server-side environment variable, defaulting to
`https://extractpaddleocrtext-xzfajdpwha-uc.a.run.app`. It must identify the private
Cloud Run HTTPS service and is also the ID token audience. The calling Node
function's runtime service account needs Cloud Run Invoker on that service.
Local scripts can provide ADC in the usual way; service-account JSON stays outside
the application source. Production uses the runtime service account.

The Python package, models, and HTTP contract are documented in
`../../paddleocr/README.md`. A generated image checks basic integration; handwriting
accuracy and cold-start performance still need evaluation with representative inputs.

## Admin page

Site Admin → AI Configuration → Image OCR Configuration lists the unique languages
from `listSyllabusScopeLanguages()`. Each language offers Default (OpenAI), OpenAI,
DeepSeek, or PaddleOCR. Only explicit overrides are stored. Overrides for languages
removed from scope are preserved when other settings are saved.

The handwriting canvas offers Undo, Clear, and pen widths. A test requires a
selected syllabus-scope language and shows the provider/model that will run.
Tests use unsaved language overrides and the selected shared settings. Saving
persists configuration with a trusted actor and timestamp. Failed language or
configuration loads disable saving until a successful retry.

The canvas exports a lossless cropped PNG with a white margin, preserving the
writing and undo history. Results show the actual provider/model, warnings, and
an image preview with PNG download. Images and results are not automatically stored.

## Limits and verification

The common image limit is 8 MiB, 8192 pixels per side, and a 240-second maximum
request deadline. Shared limits are applied before provider execution. LLM output
limits and instructions apply to OpenAI/DeepSeek. PaddleOCR additionally enforces
its decoded image and pixel limits in the Python service.

Run from the repository root:

```sh
node --test functions/utils/llm/paddleocr.test.js functions/features/image_ocr/image_ocr_feature.test.js functions/features/image_ocr/openai_ocr.test.js
node --test public/features/image_ocr/image_ocr_feature.test.mjs public/features/image_ocr/pages/admin/image_ocr_admin.test.mjs
node --test functions/features/image_ocr/handwriting_canvas_browser.test.js
```

The tests use mocked provider execution, including real browser-to-HTTP-to-feature
routing for all three adapters. The browser tests need Chromium or a Puppeteer
browser. They check language controls, draft/save behavior, provider dispatch,
normal extraction using saved routing, mobile layout, and canvas exports.

When deployment is requested, use `scripts/deploy-firebase.sh function
extractLlmImageText` and `scripts/deploy-firebase.sh hosting`. The separate
`paddleocr` codebase only needs redeployment when its Python code/models change.
