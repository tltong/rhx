# Image OCR

The Web and Functions features expose `extractTextFromImage(input, options?)`,
`getImageOcrConfig()`, and `saveImageOcrConfig(configuration)`.

```js
// Functions: require("./features/image_ocr/image_ocr_module")
const result = await extractTextFromImage({
  image: {mimeType: "image/png", base64: imageBuffer.toString("base64")},
  provider: "openai", // optional; otherwise use the configured provider
  model: "gpt-6.1-sol", // optional; must belong to the selected provider
  languageHint: "auto", // optional; may specify multiple languages
  // Optional detail, additionalInstructions
});
// {text, warnings: string[], provider: "openai", model: "gpt-6.1-sol"}
```

The Web feature also accepts a File or Blob as `image`, including a PNG Blob from
canvas.toBlob(). The Web feature guards account changes before and after image
conversion and requests. The provider utilities use normalized `{mimeType, base64}`
images; base64 input must not include a data URL prefix.

Flow: feature → LlmUtil.extractTextFromImage → OpenAIUtil.extractTextFromImage
or DeepseekUtil.extractTextFromImage. The Web adapters proxy through the same
`extractLlmImageText` authenticated HTTP
function; Functions callers invoke their feature directly. Functions authoritatively
resolves Firestore `imageOcr/config` defaults on every request and enforces limits.
Caller provider/model/detail/language hints override their respective defaults;
per-call additional instructions append to the configured instructions. DeepSeek
supports `deepseek-flash`; OpenAI supports `gpt-6.1-sol` and `gpt-6-astra`.
Switching provider without specifying a model uses the new provider's default
(`deepseek-flash` or `gpt-6.1-sol`). When the provider stays the same, an omitted
model uses the configured model. A model-only override must belong to the
configured provider. Invalid combinations fail before any provider call.
Existing Pro text requests and OpenAI image generation retain their existing APIs.
The installed OpenAI SDK supports Responses image input; no new packages are needed.

Provider and model selections are stored alongside the other settings in
`imageOcr/config`. Older configurations without a provider normalize to DeepSeek
without writing or migrating the stored document. No automatic provider fallback
is performed. OpenAI uses the Responses API with a base64 data URL, strict JSON
schema, and `store: false`. Refusals, incomplete responses and output truncation
fail explicitly; raw provider messages are not exposed in HTTP errors or logs.

Initial configuration: DeepSeek, deepseek-flash, original detail, auto language detection,
8192 output tokens, 8 MiB per image, and a 240-second request deadline. PNG, JPEG,
and WebP contents, canonical base64, dimensions up to 8192 pixels per side, and
decoded size are validated. Configurable limits have hard ceilings: 32768 output
tokens, 8 MiB, and 240 seconds. Missing config uses defaults without writing;
invalid stored configuration stops extraction. Multilingual text is transcribed
with its spelling and paragraph breaks preserved. Unreadable passages are marked;
truncated results fail visibly. No automatic provider or HTTP retries occur.

The admin page is Site Admin → AI Configuration → Image OCR Configuration. Its
test panel is a white handwriting canvas supporting mouse, touch, and pen, with
Undo, Clear, and Thin / Medium / Thick pen choices for new strokes. Clicking
Test OCR crops the PNG to the current strokes with a 24-pixel white margin,
including round caps and dots, without resizing or changing the writing canvas
or its undo history. It sends this image through
the same feature/provider flow, and displays the extracted text, warnings, and
downloadable PNG. It uses current unsaved settings without persisting them.
The provider selector limits the model choices to compatible OCR models. Saving
changes the shared defaults; testing a different provider does not save it.
The internal `testImageOcr({image, configuration})` feature API handles this draft
test; both it and config saves require `{updatedBy: administratorUid}` on Functions
and verify the live Firebase user and administrator role. HTTP actions are
`extract`, `getConfig`, `saveConfig`, and `test`; caller IDs in payloads are ignored.

The endpoint binds the existing DEEPSEEK_API_KEY and OPENAI_API_KEY Firebase secrets.
Other backend functions invoking OCR must bind the secrets for any providers they
allow, including both when the shared configuration can select either provider.
Provider keys remain server-side;
images and extracted text are not automatically stored and are excluded from logs.
The Web client requires HTTPS outside localhost and uses the direct function URL
to avoid Hosting's shorter deadline. Local development uses the Functions emulator.

Run tests from the repository root:

```sh
node functions/deepseek.test.js
node functions/features/image_ocr/image_ocr_feature.test.js
node functions/features/image_ocr/openai_ocr.test.js
node public/features/image_ocr/image_ocr_feature.test.mjs
node public/features/image_ocr/components/handwriting_canvas.test.mjs
node public/features/image_ocr/pages/admin/image_ocr_admin.test.mjs
node functions/features/image_ocr/handwriting_canvas_browser.test.js
```

The browser regression test requires Chromium or a Puppeteer-managed browser.
Tests mock provider results and do not spend API credits. The OpenAI tests also
exercise the installed SDK with a fake fetch, including a single attempt on HTTP
429. Browser tests exercise real canvas PNGs and the full Web-to-Functions flow
for both providers. Real handwriting accuracy needs checking with the deployed
service. Deploy only on request through scripts/deploy-firebase.sh, targeting
`function extractLlmImageText` and `hosting` for this feature.
