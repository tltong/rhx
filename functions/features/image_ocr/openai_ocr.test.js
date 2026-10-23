const assert = require("node:assert/strict");
const {test} = require("node:test");
const OpenAI = require("openai");
const {OpenAIUtil} = require("../../utils/llm/openai_util");
const {DeepseekUtil} = require("../../utils/llm/deepseek_util");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
const {DEFAULT_OCR_SETTINGS: defaults, normalizeOcrSettings} = require("../../utils/llm/image_ocr_settings");
const {createImageOcrFeature} = require("./image_ocr_module");
const {createImageOcrHandler, extractLlmImageText} = require("../../image_ocr_http");
const image = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
const configuration = {...defaults, provider: "openai", model: "gpt-6.1-sol"};
const transcription = {text: "  学生寫的錯字\nHello studant\nالسلام عليكم  ", warnings: ["One unreadable character: [illegible]"]};
const request = {image, model: "gpt-6.1-sol", detail: "original", maxTokens: 8192, instructions: "Transcribe only; keep original spelling. Return JSON."};
const completed = (text = JSON.stringify(transcription)) => ({id: "resp_test", object: "response", status: "completed", error: null,
  output: [{type: "reasoning", summary: []}, {type: "message", role: "assistant", status: "completed", content: [{type: "output_text", text, annotations: []}]}]});
function harness(initial = null, overrides = {}) {
  const calls = [], saves = []; let settings = initial;
  const feature = createImageOcrFeature({repository: {getConfig: async () => settings, saveConfig: async (input, uid) => {saves.push({input, uid}); return settings = {...input, updatedBy: uid};}},
    extract: async (input, options) => {calls.push({input, options}); return {...transcription, provider: options.provider, model: input.model};},
    getUser: async uid => ({uid, email: uid + "@example.com", emailVerified: true}), checkAdmin: async email => email === "admin@example.com", ...overrides});
  return {feature, calls, saves, setSettings(value) {settings = value;}};
}
test("legacy settings retain limits and instructions while unconfigured languages default to OpenAI", () => {
  const legacy = {...defaults, provider: "deepseek", model: "deepseek-flash", languageHint: "Chinese", timeoutSeconds: 60};
  delete legacy.languageProviders;
  const normalized = normalizeOcrSettings(legacy);
  assert.equal(normalized.provider, "openai"); assert.equal(normalized.model, "gpt-6.1-sol");
  assert.equal(normalized.languageHint, "Chinese"); assert.equal(normalized.timeoutSeconds, 60);
  assert.deepEqual(normalized.languageProviders, {});
  for (const override of [{provider: null}, {model: "bad"}, {languageProviders: []},
    {languageProviders: {English: "bad"}}, {languageProviders: {English: "paddleocr", " english ": "deepseek"}}]) {
    assert.throws(() => normalizeOcrSettings({...defaults, ...override}), {code: "invalid-argument"});
  }
});
test("language routing normalizes labels, supports all three providers, and defaults new languages to OpenAI", async () => {
  const h = harness({...configuration, model: "gpt-6-astra", languageProviders: {" English ": "paddleocr", Chinese: "deepseek"}, timeoutSeconds: 60});
  for (const language of [" ENGLISH ", "Chinese", "Malay", "New language"]) await h.feature.extractTextFromImage({image, language});
  assert.deepEqual(h.calls.map(c => c.options.provider), ["paddleocr", "deepseek", "openai", "openai"]);
  assert.deepEqual(h.calls.map(c => c.input.model), ["PP-OCRv6_medium", "deepseek-flash", "gpt-6-astra", "gpt-6-astra"]);
  assert.ok(h.calls.every(c => c.options.timeoutMs === 60000)); assert.deepEqual(h.saves, []);
  h.setSettings({...defaults, languageProviders: {english: "deepseek"}});
  await h.feature.extractTextFromImage({image, language: "English", languageHint: "Chinese"});
  assert.equal(h.calls[4].options.provider, "deepseek"); assert.match(h.calls[4].input.instructions, /Language hint: Chinese/);
});
test("missing language and caller provider/model overrides never invoke an adapter", async () => {
  const h = harness();
  for (const input of [{}, {language: " "}, {language: null}, {language: 12},
    {language: "English", provider: "paddleocr"}, {language: "English", model: "gpt-6-astra"}]) {
    await assert.rejects(() => h.feature.extractTextFromImage({image, ...input}), {code: "invalid-argument"});
  }
  assert.deepEqual(h.calls, []);
});
test("draft language routing remains admin-only and does not save the draft", async () => {
  const h = harness(), draft = {...defaults, languageProviders: {english: "paddleocr"}};
  await assert.rejects(() => h.feature.testImageOcr({image, language: "English", configuration: draft}, {updatedBy: "student"}), {code: "permission-denied"});
  await h.feature.testImageOcr({image, language: "English", configuration: draft}, {updatedBy: "admin"});
  assert.equal(h.calls[0].options.provider, "paddleocr"); assert.equal(h.calls[0].input.model, "PP-OCRv6_medium");
  assert.deepEqual(h.saves, []);
  await h.feature.saveImageOcrConfig({...draft, updatedBy: "spoofed"}, {updatedBy: "admin"});
  assert.equal(h.saves[0].uid, "admin"); assert.deepEqual(h.saves[0].input, draft);
});
test("language is snapshotted before asynchronous configuration reads", async () => {
  let resolve; const pendingConfig = new Promise(done => {resolve = done;});
  const h = harness(null, {repository: {getConfig: () => pendingConfig}});
  const input = {image, language: "Chinese"};
  const pending = h.feature.extractTextFromImage(input); input.language = "English";
  resolve({...defaults, languageProviders: {chinese: "paddleocr"}}); await pending;
  assert.equal(h.calls[0].options.provider, "paddleocr"); assert.equal(h.calls[0].input.languageHint, "Chinese");
});
test("OpenAIUtil uses the installed SDK for base64 vision and strict JSON while preserving handwriting verbatim", async () => {
  const calls = [];
  const client = new OpenAI({apiKey: "unit-test-key", fetch: async (url, options) => {
    calls.push({url: String(url), body: JSON.parse(options.body), headers: options.headers});
    return new Response(JSON.stringify(completed()), {status: 200, headers: {"Content-Type": "application/json"}});
  }});
  const adapter = new OpenAIUtil({createClient: () => client});
  for (const model of ["gpt-6.1-sol", "gpt-6-astra"]) {
    assert.deepEqual(await adapter.extractTextFromImage({...request, model}), {...transcription, provider: "openai", model});
  }
  assert.equal(calls.length, 2);
  const {body, url} = calls[0]; assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(body.model, "gpt-6.1-sol"); assert.equal(body.instructions, request.instructions);
  assert.equal(body.max_output_tokens, 8192); assert.equal(body.store, false); assert.equal(body.stream, false);
  assert.deepEqual(body.input[0].content[1], {type: "input_image", image_url: `data:image/png;base64,${image.base64}`, detail: "original"});
  assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.required, ["text", "warnings"]); assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(Object.hasOwn(body, "temperature"), false);
});
test("OpenAI OCR rejects refusals, incomplete responses, malformed JSON and invalid warnings without retries", async () => {
  const cases = [
    [{status: "incomplete", incomplete_details: {reason: "max_output_tokens"}, output: completed().output}, "ocr-output-truncated"],
    [{status: "incomplete", incomplete_details: {reason: "content_filter"}}, "ocr-refused"],
    [{...completed(), output: [{type: "message", content: [{type: "refusal", refusal: "private raw refusal"}]}]}, "ocr-refused"],
    [{...completed(), status: "failed", error: {message: "private provider message"}}, "ocr-invalid-response"],
    [{...completed(), status: "cancelled"}, "ocr-invalid-response"],
    [{...completed(), output: [{...completed().output[1], status: "incomplete"}]}, "ocr-invalid-response"],
    [{...completed(), output: []}, "ocr-invalid-response"],
    [completed("bad JSON"), "ocr-invalid-response"],
    [completed(JSON.stringify({text: 123, warnings: []})), "ocr-invalid-response"],
    [completed(JSON.stringify({text: "hello", warnings: [42]})), "ocr-invalid-response"],
    [completed(JSON.stringify({text: "hello", warnings: Array(51).fill("warning")})), "ocr-invalid-response"],
    [completed(JSON.stringify({text: "hello", warnings: ["a".repeat(1001)]})), "ocr-invalid-response"],
  ];
  let calls = 0;
  for (const [response, code] of cases) {
    const adapter = new OpenAIUtil({createClient: () => ({responses: {create: async () => {calls++; return response;}}})});
    await assert.rejects(() => adapter.extractTextFromImage(request), error => error.code === code && !/private/.test(error.message));
  }
  assert.equal(calls, cases.length);
  const empty = new OpenAIUtil({createClient: () => ({responses: {create: async () => completed('{"text":"","warnings":[]}')}})});
  assert.deepEqual((await empty.extractTextFromImage(request)).warnings, ["No legible text was found in this image."]);
});
test("OpenAI and DeepSeek adapters reject each other's models before making any upstream request", async () => {
  let calls = 0; const factory = () => {calls++; throw new Error("Unexpected upstream request");};
  const openai = new OpenAIUtil({createClient: factory}), deepseek = new DeepseekUtil({createOcrClient: factory});
  await assert.rejects(() => openai.extractTextFromImage({...request, model: "deepseek-flash"}), {code: "invalid-argument"});
  await assert.rejects(() => deepseek.extractTextFromImage(request), {code: "invalid-argument"});
  for (const timeoutMs of [0, -1, NaN, 240001]) await assert.rejects(() => openai.extractTextFromImage(request, {timeoutMs}), {code: "invalid-argument"});
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => openai.extractTextFromImage(request, {signal: controller.signal}), {name: "AbortError"});
  assert.equal(calls, 0);
});
test("OpenAI deadlines and caller cancellation abort exactly one attempt and clean up", async () => {
  let calls = 0, upstream;
  const adapter = new OpenAIUtil({createClient: () => ({responses: {create: (input, options) => {calls++; upstream = options.signal; return new Promise(() => {});}}})});
  await assert.rejects(() => adapter.extractTextFromImage(request, {timeoutMs: 10}), {code: "ocr-timeout"}); assert.equal(upstream.aborted, true);
  const controller = new AbortController(), pending = adapter.extractTextFromImage(request, {signal: controller.signal});
  controller.abort(); await assert.rejects(() => pending, {name: "AbortError"}); assert.equal(upstream.aborted, true); assert.equal(calls, 2);
});
test("OpenAI's installed SDK never retries a rate-limited OCR request", async () => {
  let attempts = 0;
  const client = new OpenAI({apiKey: "unit-test-key", fetch: async () => {attempts++; return new Response(JSON.stringify({error: {message: "Busy", type: "rate_limit_error"}}), {status: 429, headers: {"Content-Type": "application/json"}});}});
  const adapter = new OpenAIUtil({createClient: () => client});
  await assert.rejects(() => adapter.extractTextFromImage(request), error => error.status === 429); assert.equal(attempts, 1);
});
test("LlmUtil routes OpenAI OCR to its registered adapter without affecting text dispatch", async () => {
  const adapter = new OpenAIUtil({createClient: () => ({responses: {create: async () => completed()}})});
  const util = new LlmUtil(), registered = util.getProviderAdapter("openai");
  registerLlmProvider("openai", adapter);
  try {assert.deepEqual(await util.extractTextFromImage(request, {provider: "openai"}), {...transcription, provider: "openai", model: request.model});}
  finally {registerLlmProvider("openai", registered);}
});
test("existing HTTPS endpoint binds both keys and carries OpenAI extraction with authentication and safe logs", async () => {
  assert.deepEqual(extractLlmImageText.__endpoint.secretEnvironmentVariables.map(item => item.key).sort(), ["DEEPSEEK_API_KEY", "OPENAI_API_KEY"]);
  const h = harness({...configuration, model: "gpt-6-astra"}), logs = [];
  const handler = createImageOcrHandler({apis: h.feature, verifyToken: async () => ({uid: "student"}), log: {info: (...args) => logs.push(args), error: (...args) => logs.push(args)}});
  const invoke = async (input, headers = {authorization: "Bearer token"}) => {
    const res = {headers: {}, set(key, value) {this.headers[key] = value;}, status(value) {this.statusCode = value; return this;}, json(value) {this.payload = value;}};
    await handler({method: "POST", headers, body: {action: "extract", input}}, res); return res;
  };
  assert.equal((await invoke({image, language: "English"}, {})).statusCode, 401);
  const result = await invoke({image, language: "English"});
  assert.equal(result.statusCode, 200); assert.equal(result.payload.result.provider, "openai"); assert.equal(result.payload.result.model, "gpt-6-astra");
  assert.equal(result.headers["X-Request-ID"], result.payload.requestId);
  assert.equal((await invoke({image, provider: "openai", model: "deepseek-flash"})).statusCode, 400);
  assert.equal(JSON.stringify(logs).includes(image.base64), false); assert.equal(JSON.stringify(logs).includes(transcription.text), false);
});
