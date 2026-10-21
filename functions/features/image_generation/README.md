# Image generation

Backend feature: `functions/features/image_generation/image_generation_module.js`.
Web feature: `public/features/image_generation/image_generation_module.js`.
Both expose `getImageGenerationConfig()`, `saveImageGenerationConfig(config)`, and
`generateImage({prompt, model?, size?, quality?, transparentBackground?})`.
Backend saves also require `{updatedBy: administratorUid}` as the second argument;
the feature checks the current Firebase user and site-admin record server-side.

Configuration lives at Firestore `imageGeneration/config`. Each omitted setting
uses the current stored value. Until configuration is saved, defaults are Flare,
1024x1024, medium quality, and an opaque background. Explicit `false` overrides a
configured transparent background. Invalid overrides fail rather than falling back.

```js
// Same feature API in both layers (require on Functions, import on Web).
const result = await generateImage({prompt: "A friendly cartoon guardian", quality: "low"});
// result: {model, settings: {model, size, quality, transparentBackground},
//          images: [{mimeType: "image/png", base64}], usage}
// Backend: Buffer.from(result.images[0].base64, "base64")
```

The feature delegates to LlmUtil.generateImage → OpenAIUtil. On Web, the adapter
sends a Firebase ID token to the `generateLlmImage` HTTP function; its `generate`,
`getConfig`, and `saveConfig` actions share one authenticated endpoint. Generation
and config reads require sign-in; saving requires a verified site administrator.
Functions resolves settings authoritatively before calling OpenAI. The secret
`OPENAI_API_KEY` is bound only to this endpoint; other backend functions invoking
image generation must also bind the exported `openaiApiKey` secret in their options.
No provider key is sent to the browser. No image is automatically persisted.

The admin page is under Site Admin → AI Configuration → Image Generation
Configuration. Tests use draft settings without saving, preview the PNG, and offer
a download. Every click invokes one paid request. There are no automatic retries;
a client timeout or cancellation does not guarantee a provider request was unbilled.
Client and server deadlines cover long requests. Browser calls use the function URL
directly to avoid Hosting's shorter deadline, and use the Functions emulator locally.

Text callers keep their existing APIs: llm_ops.generateLlmText → LlmUtil →
DeepseekUtil, and the existing generateDeepseekText HTTP endpoint routes through
the same utility. DeepSeek's model, JSON parsing/repair, and deadlines are preserved.

Verification (from repository root):

```sh
node functions/deepseek.test.js
node functions/features/image_generation/image_generation_feature.test.js
node public/features/image_generation/image_generation_feature.test.mjs
node public/features/image_generation/pages/admin/image_generation_admin.test.mjs
```

These checks mock provider responses and do not spend API credits. Deployment is
only performed on request via `scripts/deploy-firebase.sh`. Its `all` target
includes Hosting, the new `generateLlmImage` endpoint, and the existing Functions
that now route text generation through LlmUtil.
