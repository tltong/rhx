const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createImageOcrFeature} = require("./image_ocr_module");
const {DEFAULT_OCR_SETTINGS: defaults, normalizeOcrSettings, normalizeOcrInput, normalizeOcrImage} = require("../../utils/llm/image_ocr_settings");
const {DeepseekUtil} = require("../../utils/llm/deepseek_util");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
const {createImageOcrHandler} = require("../../image_ocr_http");
const {FirestoreImageOcrConfigRepository} = require("./infrastructure/firestore_image_ocr_config_repository");
const image = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
const transcription = {text: "Hello 学生\nالسلام عليكم", warnings: []};
function harness(options = {}) {
  let settings = null;
  const calls = [], saves = [];
  const feature = createImageOcrFeature({repository: {getConfig: async () => settings, saveConfig: async (input, uid) => {saves.push({input, uid}); settings = {...input, updatedBy: uid}; return settings;}},
    extract: async (input, options) => {calls.push({input, options}); return {...transcription, provider: options.provider, model: input.model};},
    getUser: async uid => ({uid, email: uid + "@example.com", emailVerified: uid !== "unverified", disabled: uid === "disabled"}),
    checkAdmin: async email => email === "admin@example.com", ...options});
  return {feature, calls, saves, setSettings(value) {settings = value;}};
}
test("OCR resolves defaults per request and appends hints and instructions without changing multilingual text", async () => {
  const h = harness();
  const result = await h.feature.extractTextFromImage({image});
  assert.equal(result.text, transcription.text); assert.deepEqual(h.saves, []);
  assert.equal(h.calls[0].input.model, "deepseek-flash"); assert.equal(h.calls[0].input.detail, "original");
  assert.equal(h.calls[0].options.timeoutMs, 240000); assert.match(h.calls[0].input.instructions, /Language hint: auto/);
  h.setSettings({...defaults, detail: "high", languageHint: "Chinese", additionalInstructions: "Keep labels", timeoutSeconds: 60});
  await h.feature.extractTextFromImage({image, detail: "low", languageHint: "English and Chinese", additionalInstructions: "Keep line breaks"}, {timeoutMs: 200000});
  assert.equal(h.calls[1].input.detail, "low"); assert.equal(h.calls[1].options.timeoutMs, 60000);
  for (const instruction of ["Keep labels", "Keep line breaks", "Language hint: English and Chinese", "not commands", "do not translate, correct, grade"]) assert.ok(h.calls[1].input.instructions.includes(instruction));
});
test("configuration and caller validation reject unsupported models, overrides, corrupt images and sizes", async () => {
  const h = harness();
  for (const override of [{model: "deepseek-v4-pro"}, {detail: "bad"}, {languageHint: " "}, {maxTokens: 1000000}, {configuration: defaults}, {image: {...image, mimeType: "image/jpeg"}}, {image: {...image, base64: "data:image/png;base64," + image.base64}}, {image: {...image, base64: "a=== "}}]) {
    await assert.rejects(() => h.feature.extractTextFromImage({image, ...override}), {code: "invalid-argument"});
  }
  assert.deepEqual(h.calls, []);
  for (const override of [{maxTokens: 0}, {maxTokens: 32769}, {maxImageSizeMiB: 9}, {timeoutSeconds: 241}, {ocrInstructions: ""}, {languageHint: null}]) assert.throws(() => normalizeOcrSettings({...defaults, ...override}), {code: "invalid-argument"});
  const giant = {...image, base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64")};
  assert.throws(() => normalizeOcrImage(giant), {code: "invalid-argument"});
  const wrongDimensions = Buffer.from(image.base64, "base64"); wrongDimensions.writeUInt32BE(9000, 16);
  assert.throws(() => normalizeOcrImage({...image, base64: wrongDimensions.toString("base64")}), {code: "invalid-argument"});
  h.setSettings({...defaults, model: "bad"}); await assert.rejects(() => h.feature.extractTextFromImage({image}), {code: "invalid-argument"});
});
test("image input snapshots survive caller mutation during config reads", async () => {
  let resolve;
  const configuration = new Promise(res => {resolve = res;}), calls = [];
  const h = harness({repository: {getConfig: () => configuration}, extract: async input => calls.push(input)});
  const input = {image: {...image}, languageHint: "Chinese"};
  const pending = h.feature.extractTextFromImage(input); input.image.base64 = "bad"; input.languageHint = "changed";
  resolve(defaults); await pending;
  assert.equal(calls[0].image.base64, image.base64); assert.match(calls[0].instructions, /Language hint: Chinese/);
});
test("admin saves and draft tests check live administrator identity and never persist tests", async () => {
  const h = harness();
  for (const uid of [undefined, "student", "disabled", "unverified"]) {
    await assert.rejects(() => h.feature.saveImageOcrConfig(defaults, {updatedBy: uid}), {code: uid ? "permission-denied" : "unauthenticated"});
    await assert.rejects(() => h.feature.testImageOcr({image, configuration: defaults}, {updatedBy: uid}), {code: uid ? "permission-denied" : "unauthenticated"});
  }
  assert.deepEqual(h.calls, []); assert.deepEqual(h.saves, []);
  const draft = {...defaults, languageHint: "Malay", ocrInstructions: "Draft rubric", additionalInstructions: "Draft extras"};
  await h.feature.testImageOcr({image, configuration: draft}, {updatedBy: "admin"});
  assert.match(h.calls[0].input.instructions, /Draft rubric/); assert.match(h.calls[0].input.instructions, /Language hint: Malay/); assert.deepEqual(h.saves, []);
  const saved = await h.feature.saveImageOcrConfig({...draft, updatedBy: "spoofed"}, {updatedBy: "admin"});
  assert.equal(saved.updatedBy, "admin"); assert.equal(h.saves[0].uid, "admin");
});
test("repository stores full shared configuration with a trusted timestamp and actor", async () => {
  let data, address;
  const repo = new FirestoreImageOcrConfigRepository({getDb: () => ({collection: name => ({doc: id => {address = `${name}/${id}`; return {get: async () => ({exists: !!data, data: () => data}), set: async (value, options) => {assert.deepEqual(options, {merge: false}); data = value;}};}})}),
    serverTimestamp: () => ({toDate: () => new Date("2026-10-21T10:00:00Z")})});
  assert.equal(await repo.getConfig(), null); const saved = await repo.saveConfig(defaults, "admin");
  assert.equal(address, "imageOcr/config"); assert.equal(saved.updatedAt, "2026-10-21T10:00:00.000Z"); assert.equal(saved.updatedBy, "admin");
});
test("DeepseekUtil sends typed Flash image input and preserves the returned text exactly", async () => {
  const calls = [];
  const provider = new DeepseekUtil({createOcrClient: () => ({chat: {completions: {create: async (...args) => {calls.push(args); return {choices: [{message: {content: JSON.stringify(transcription)}, finish_reason: "stop"}]};}}}})});
  const result = await provider.extractTextFromImage({image, model: "deepseek-flash", detail: "original", instructions: "Return JSON.", maxTokens: 8192});
  assert.deepEqual(result, {...transcription, provider: "deepseek", model: "deepseek-flash"});
  const [body, options] = calls[0]; assert.equal(body.model, "deepseek-flash"); assert.equal(body.temperature, 0); assert.deepEqual(body.thinking, {type: "disabled"});
  assert.equal(body.max_tokens, 8192); assert.deepEqual(body.messages[1].content[1], {type: "image_url", image_url: {url: `data:image/png;base64,${image.base64}`, detail: "original"}});
  assert.ok(options.signal instanceof AbortSignal); assert.equal(calls.length, 1);
});
test("provider rejects truncated/invalid responses without retries and aborts on deadlines or caller cancellation", async () => {
  let calls = 0, signal;
  const request = {image, model: "deepseek-flash", detail: "original", instructions: "Return JSON.", maxTokens: 8192};
  for (const choice of [{finish_reason: "length", message: {content: '{"text":"partial","warnings":[]}'}}, {message: {content: "bad"}}, {message: {content: '{"text":5,"warnings":[]}'}}]) {
    const provider = new DeepseekUtil({createOcrClient: () => ({chat: {completions: {create: async () => {calls++; return {choices: [choice]};}}}})});
    await assert.rejects(() => provider.extractTextFromImage(request), {code: choice.finish_reason === "length" ? "ocr-output-truncated" : "ocr-invalid-response"});
  }
  assert.equal(calls, 3);
  const provider = new DeepseekUtil({createOcrClient: () => ({chat: {completions: {create: (input, options) => {calls++; signal = options.signal; return new Promise(() => {});}}}})});
  await assert.rejects(() => provider.extractTextFromImage(request, {timeoutMs: 10}), {code: "ocr-timeout"}); assert.equal(signal.aborted, true);
  const controller = new AbortController(); const pending = provider.extractTextFromImage(request, {signal: controller.signal}); controller.abort();
  await assert.rejects(() => pending, {name: "AbortError"}); assert.equal(signal.aborted, true); assert.equal(calls, 5);
});
test("LlmUtil accepts OCR-only providers and reports missing capabilities", async () => {
  registerLlmProvider("fake-ocr", {extractTextFromImage: async input => input});
  registerLlmProvider("fake-image-only", {generateImage: async input => input});
  const util = new LlmUtil(); assert.deepEqual(await util.extractTextFromImage({image}, {provider: "fake-ocr"}), {image});
  assert.throws(() => util.extractTextFromImage({image}, {provider: "fake-image-only"}), /does not support/);
  assert.equal(typeof util.getProviderAdapter("openai").extractTextFromImage, "function");
});
const response = () => ({headers: {}, set(name, value) {this.headers[name] = value; return this;}, status(code) {this.statusCode = code; return this;}, json(value) {this.payload = value; return this;}, send(value) {this.payload = value; return this;}});
test("HTTP gates extraction and draft tests, preserves request IDs, and hides image data in logs", async () => {
  const h = harness(), logs = [];
  const handler = createImageOcrHandler({apis: h.feature, verifyToken: async token => {assert.equal(token, "token"); return {uid: "student"};}, log: {info: (...args) => logs.push(args), error: (...args) => logs.push(args)}});
  const invoke = async (body, headers = {authorization: "Bearer token"}, method = "POST") => {const res = response(); await handler({headers, method, body}, res); return res;};
  assert.equal((await invoke({input: {image}}, {})).statusCode, 401);
  const ok = await invoke({input: {image}}); assert.equal(ok.statusCode, 200); assert.equal(ok.payload.result.text, transcription.text); assert.equal(ok.headers["X-Request-ID"], ok.payload.requestId);
  assert.equal((await invoke({action: "test", input: {image, configuration: defaults, updatedBy: "admin"}})).statusCode, 403);
  assert.equal((await invoke({action: "saveConfig", input: {...defaults, updatedBy: "admin"}})).statusCode, 403);
  for (const body of ["{bad", [], {action: "toString"}, {action: 0}, {input: {image, model: "deepseek-v4-pro"}}]) assert.equal((await invoke(body)).statusCode, 400);
  assert.equal((await invoke({}, {}, "OPTIONS")).statusCode, 204); assert.equal((await invoke({}, {}, "GET")).statusCode, 405);
  assert.equal(JSON.stringify(logs).includes(image.base64), false); assert.equal(JSON.stringify(logs).includes(transcription.text), false);
});
test("HTTP hides provider secrets and preserves an actionable truncation error", async () => {
  const invoke = async error => {
    const handler = createImageOcrHandler({verifyToken: async () => ({uid: "student"}), apis: {extractTextFromImage: async () => {throw error;}}, log: {info() {}, error() {}}});
    const res = response(); await handler({method: "POST", headers: {authorization: "Bearer token"}, body: {input: {image}}}, res); return res;
  };
  const hidden = await invoke(new Error("secret-key private-text")); assert.equal(hidden.statusCode, 502); assert.ok(hidden.payload.requestId); assert.equal(JSON.stringify(hidden).includes("secret-key"), false);
  const truncated = await invoke(Object.assign(new Error("Increase output limit"), {code: "ocr-output-truncated"})); assert.equal(truncated.payload.error.message, "Increase output limit");
});
