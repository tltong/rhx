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
    "chinese": "deepseek",
    "tamil": "sarvam"
  }
}
```

Language keys use Unicode NFKC normalization, trimmed/collapsed whitespace, and
lowercase. New languages and languages without an override use OpenAI. Provider
errors are reported without automatic retries or switching to another provider.
Normal extraction rejects caller `provider` and `model` overrides. `languageHint`
is recognition guidance and does not select the provider.

The available adapters are OpenAI (`gpt-6.1-sol` or `gpt-6-astra`), DeepSeek
(`deepseek-flash`), PaddleOCR (`PP-OCRv6_medium`), and Sarvam (`sarvam-vision-v1`). The shared OpenAI model setting
selects the fallback model; the other providers use their listed models.
The retained `provider` configuration field is always `openai`.

Old global DeepSeek settings are normalized to the OpenAI fallback when read,
retaining valid instructions, language hints, and request limits. Reads do not
write a migration or create a config document. Existing OpenAI model choices and
explicit language overrides are retained. Invalid stored settings fail visibly.

## Web and backend

The Web Image OCR feature calls the shared `ImageOcrClient`, which attaches the
Firebase user token and sends image plus language once to `extractLlmImageText`
using `startJob`. Subsequent `getJob` requests carry only the job ID.
The Node HTTP handler verifies that token. Its Image OCR feature resolves routing
and delegates execution through the backend provider registry. The web feature
uses one transport for all providers.

The HTTP actions are `startJob`, `getJob`, `extract`, `getConfig`, `saveConfig`, and `test`. Saving and
running draft tests require a verified site administrator. The HTTP handler derives
the actor from the verified user; caller-supplied actor IDs are ignored.
`testImageOcr({image, language, configuration})` uses unsaved settings without saving.
Functions callers supply `{updatedBy: administratorUid}` as the administrator
context for saves and tests.

### On-demand background jobs

The Web feature uses background jobs for both extraction and draft tests across
all providers. The original synchronous HTTP actions and Functions API remain
available to existing callers. There is no additional public HTTP function or
external OCR API. `processImageOcrJob` is a GCS/Eventarc-triggered Node function.
Both it and the Python PaddleOCR function have zero minimum instances.

1. Before sending the image, the browser generates a UUID and remembers its ID,
   operation, language, and creation time in account-scoped session storage.
2. `startJob` validates the image, resolves and snapshots the provider/settings,
   and checks administrator authorization for draft tests. It creates one input
   object with a generation-zero precondition in a separate private GCS bucket.
   The HTTP response returns `queued` and the job ID without waiting for OCR.
3. Object finalization durably invokes the worker. It atomically creates a claim,
   starts the selected provider, and waits through PaddleOCR startup and model
   loading under the existing provider timeout (at most 240 seconds).
4. The worker saves a terminal result/error and deletes the input object. Duplicate
   storage events cannot run the same job again. Provider failures are terminal;
   no OCR image is automatically resubmitted. A worker that stops after claiming
   is reported as interrupted after its processing deadline and grace period.
5. The page polls every two seconds using short requests with 20-second deadlines.
   Network/temporary server errors retry status reads with bounded backoff. A lost
   submission response also leads to status reads, never another image upload.
   An unconfirmed submission retains its job ID for checking later.

The browser waits at most ten minutes by default; stopping or cancelling that
wait does not cancel committed background work. **Check previous OCR** retrieves
the same job after an interrupted wait or a reload in the same browser tab. New
submissions are disabled while a job is pending. Signing into another account
cannot return the previous account's results. The server derives storage paths
from the verified user's UID and job ID; clients never receive bucket URLs or
storage credentials. Closing a tab can discard its recovery ID.

Job results are readable through the API for 15 minutes after submission. Images
are deleted after worker completion/failure; crashed or never-started inputs and
result objects become eligible for deletion after one day through bucket
lifecycle management. Lifecycle deletion is asynchronous. Soft delete and object
versioning are disabled on this dedicated temporary-data bucket. No image or
transcription is saved to browser storage, Firestore, or application logs.

The bucket must enforce uniform bucket-level access, public access prevention,
and the one-day deletion policy. The repository verifies those settings and
rejects storage with soft delete/versioning enabled. This bucket is separate
from the Firebase browser-upload bucket. The default name is
`readyherox-ocr-jobs` (`IMAGE_OCR_JOBS_BUCKET` can override it on both Node
functions for other environments; dedicated names must end in `-ocr-jobs`). The production setup command intentionally
targets only the documented `readyherox-ocr-jobs` bucket and refuses another
project or region.

Deployment order, using the existing temporary-credential wrapper:

If the deployment identity lacks `storage.buckets.create`, a project administrator
must first perform the [one-time bucket and event permissions setup](../../../scripts/prepare-image-ocr-jobs-admin.md).
This grants the deployment identity Storage Admin on the dedicated bucket only.

```sh
bash scripts/deploy-firebase.sh ocr-jobs
bash scripts/deploy-firebase.sh function processImageOcrJob
bash scripts/deploy-firebase.sh function extractLlmImageText
bash scripts/deploy-firebase.sh hosting
```

The setup command creates/configures the dedicated bucket in `us-central1` and
grants the gateway and default worker runtime accounts object access plus bucket
metadata reads. The worker binds the existing provider secrets and needs the
same private PaddleOCR invoker permission as the gateway. Firebase deployment
also provisions the storage Eventarc trigger; deployment credentials must be
able to configure its service identities. If using a custom worker identity,
grant its bucket permissions and PaddleOCR invocation explicitly.

No Python runtime/model redeployment is needed for this change. Storage, object
operations, event delivery, and active worker processing incur usage charges;
there is no always-warm instance charge. The browser's connection no longer
needs to stay open for the whole OCR run. This does not eliminate provider
errors or establish that cold starts caused earlier `Failed to fetch` failures.

The existing HTTPS function binds `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, and
`SARVAM_API_KEY`. PaddleOCR uses Google service identity. Browser credentials and
endpoints stay the same; all provider authentication runs on the backend.

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

## Sarvam adapter

`functions/utils/llm/sarvam_ocr.js` exports `SarvamOcrUtil` and its registered
singleton. It uses the pinned `sarvamai@1.1.12` Node SDK and the current Document
AI `docAi` API, not the legacy `documentIntelligence` API. No new public function,
Python service or upload URL endpoint is introduced by the adapter. The Web job
polling described above is separate from the adapter's Sarvam status polling.

The adapter decodes each PNG/JPEG/WebP using `sharp`, checks for a single frame
and at most 16 megapixels, applies EXIF orientation, flattens transparency onto
white, and sends a lossless PNG. The configured image-byte limit and 8192-pixel
dimension limit apply again after conversion. A converted image that exceeds
those limits is rejected before submission.

Language routing uses the selected syllabus/question language, independently of
free-form `languageHint`. Shared Functions/Web settings map the 23 documented
languages to BCP-47 codes, including `Tamil` → `ta-IN` and `English` → `en-IN`.
Names, base codes, and full codes are accepted. Malay and Chinese are unsupported;
Malay is never mapped to Malayalam. Unsupported Sarvam assignments fail before
save or provider execution. Sarvam uses `content_type: "mixed"` for printed and
handwritten content; LLM instructions, token limits, image detail, and language
hints do not apply to this provider.

All outbound traffic goes to `https://api.sarvam.ai`:

1. `POST /doc-ai/v1/job/digitise` submits one multipart image with the pinned model.
2. `GET /doc-ai/v1/job/{job_id}/status` polls every two seconds until terminal.
3. `GET /doc-ai/v1/job/{job_id}/results?format=json` retrieves completed output.

One configurable deadline (at most 240 seconds) bounds conversion, submission,
polling, and result reads. SDK retries and HTTP redirects are disabled. Provider
responses are capped at 4 MiB. Job IDs, states, and result shapes are validated.
The live JSON schema contains `documents[].pages[].blocks[]`, with `text`,
`layout_tag`, and `reading_order`. Text blocks retain literal characters and
line breaks, and are joined in reading order. HTML inside table blocks is parsed
to text with entities decoded and cells separated by tabs; scripts, styles, and
remote resources are not executed or fetched. Partial completion and blank output
produce warnings. The HTML result format returns a raw document, which this SDK
does not decode into its documented JSON wrapper, so the adapter requests JSON.
Errors retain the existing safe error codes, request IDs, and rate-limit handling.

For the original synchronous HTTP actions, browser disconnects abort backend
polling and SDK requests. Background jobs continue independently of the browser.
Sarvam does not expose
a cancellation endpoint in this SDK: a submitted remote job may keep processing
after cancellation or timeout. The adapter never automatically resubmits it.
On failure, a validated `providerJobId` is recorded alongside the HTTP request ID
in function logs. Keys, images, raw provider error bodies, and transcriptions are
excluded from logs. Successful results keep `{text, warnings, provider, model}`.

Before deploying, provision `SARVAM_API_KEY` in the Firebase project's Secret
Manager using the normal Firebase secret workflow. Do not put it in shared OCR
configuration or browser code. Redeploy `extractLlmImageText` and hosting, then
test Sarvam through an unsaved Tamil/English admin draft before changing saved
language routes. The adapter uses the endpoint-documented `sarvam-vision-v1`
model ID. Deployment verification confirmed API access and this model ID using a
generated English image; handwriting accuracy and representative-image latency
still need evaluation.

References: [Digitise](https://docs.sarvam.ai/api-reference/doc-ai/job/digitise),
[results](https://docs.sarvam.ai/api-reference/doc-ai/job/results), and
[supported languages/formats](https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview).

## Admin page

Site Admin → AI Configuration → Image OCR Configuration lists the unique languages
from `listSyllabusScopeLanguages()`. Each language offers Default (OpenAI), OpenAI,
DeepSeek, PaddleOCR, or Sarvam. Sarvam is disabled for unsupported languages.
Only explicit overrides are stored. Overrides for languages
removed from scope are preserved when other settings are saved.

The handwriting canvas offers Undo, Clear, and pen widths. A test requires a
selected syllabus-scope language and shows the provider/model that will run.
Tests use unsaved language overrides and the selected shared settings. Saving
persists configuration with a trusted actor and timestamp. Failed language or
configuration loads disable saving until a successful retry.

The canvas exports a lossless cropped PNG with a white margin, preserving the
writing and undo history. Results show the actual provider/model, warnings, and
an image preview with PNG download. Background jobs temporarily store inputs and
results under the private retention policy above; they are not added to student
records. A recovered result has no image preview because the browser does not
persist the handwriting image.

Failed tests, settings loads, and saves show a full-width **OCR error details**
panel at the bottom of the admin page. It explains the failure and includes the
attempt time, provider/model/language, failure stage, elapsed time, configured
timeouts, HTTP status, error code/message, and server request ID when available.
The shared Web transport distinguishes token acquisition, waiting for headers,
reading a response, and server/result errors. The transport identifies a browser
`Failed to fetch` as `ocr-network-error`; background status checks normally
recover from it and show reconnecting progress. The panel does not guess whether it was caused
by CORS, the network, or an infrastructure failure, or whether the server received
the image. No image request is automatically retried.

**Copy error details** copies the explanation and diagnostic metadata. Endpoint
and page URLs omit credentials, query parameters, and fragments. Request bodies,
authorization headers, exception stacks, images, and transcriptions are not added
to the report. The last report stays available while editing, clears on the next
attempt or successful recovery, and is removed when the page is disposed.

## Limits and verification

The common image limit is 8 MiB, 8192 pixels per side, and a 240-second maximum
provider deadline. The background job's queue/browser wait is separate from that
processing deadline. Shared limits are applied before provider execution. LLM output
limits and instructions apply to OpenAI/DeepSeek. PaddleOCR additionally enforces
its decoded image and pixel limits in the Python service.

Run from the repository root:

```sh
node --test functions/utils/llm/sarvam_ocr.test.js functions/utils/llm/paddleocr.test.js functions/features/image_ocr/image_ocr_feature.test.js functions/features/image_ocr/openai_ocr.test.js
node --test public/features/image_ocr/image_ocr_feature.test.mjs public/features/image_ocr/pages/admin/image_ocr_admin.test.mjs
node --test functions/features/image_ocr/handwriting_canvas_browser.test.js
node --test functions/features/image_ocr/image_ocr_jobs.test.js public/features/image_ocr/image_ocr_jobs_client.test.mjs
node --test scripts/configure-image-ocr-jobs.test.cjs
```

The tests use mocked provider execution, including real browser-to-HTTP-to-feature
routing for all four adapters. Sarvam tests also exercise the real SDK's multipart
and job request serialization against an in-memory fetch implementation, plus
real PNG/JPEG/WebP decoding. No API key or paid provider calls are used in tests.
The browser tests need Chromium or a Puppeteer
browser. They check language controls, draft/save behavior, provider dispatch,
normal extraction using saved routing, mobile layout, and canvas exports.

When deployment is requested, follow the storage → worker → gateway → hosting
order above. The separate
`paddleocr` codebase only needs redeployment when its Python code/models change.
