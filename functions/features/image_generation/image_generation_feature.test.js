const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createImageGenerationFeature} = require("./image_generation_module");
const {DEFAULT_IMAGE_SETTINGS: defaults, IMAGE_SIZES, normalizeImageSize, resolveImageRequest} = require("../../utils/llm/image_generation_settings");
const {OpenAIUtil} = require("../../utils/llm/openai_util");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
const {createImageGenerationHandler} = require("../../image_generation_http");
const {FirestoreImageGenerationConfigRepository} = require("./infrastructure/firestore_image_generation_config_repository");

function harness() {
  let config = null;
  const requests = [], saves = [];
  const repository = {getConfig: async () => config, saveConfig: async (input, uid) => {
    saves.push({input, uid}); config = {...input, updatedBy: uid, updatedAt: "2026-10-21T10:00:00Z"}; return config;
  }};
  const feature = createImageGenerationFeature({repository, generate: async (input, options) => {requests.push({input, options}); return {settings: input};},
    getUser: async uid => ({uid, email: uid + "@example.com", emailVerified: uid !== "unverified", disabled: uid === "disabled"}),
    checkAdmin: async email => email.startsWith("admin@")});
  return {feature, requests, saves, setConfig(value) {config = value;}};
}
test("omitted image fields read current defaults independently and explicit false overrides true", async () => {
  const h = harness(); await h.feature.generateImage({prompt: " test "});
  assert.deepEqual(h.requests[0].input, {prompt: "test", ...defaults});
  assert.deepEqual(h.saves, []);
  h.setConfig({...defaults, model: "gpt-image-2.5-sunburst", size: "960x720", quality: "high", transparentBackground: true});
  await h.feature.generateImage({prompt: "test", quality: "low", transparentBackground: false});
  assert.deepEqual(h.requests[1].input, {prompt: "test", model: "gpt-image-2.5-sunburst", size: "960x720", quality: "low", transparentBackground: false});
  assert.equal(h.requests[1].options.provider, "openai");
  h.setConfig({...defaults, size: "720x960"}); await h.feature.generateImage({prompt: "test"});
  assert.equal(h.requests[2].input.size, "720x960");
});
test("native sizes and custom bounds reject invalid settings before paid generation", async () => {
  for (const size of IMAGE_SIZES) assert.equal(normalizeImageSize(size), size);
  for (const size of ["1280x1024", "3840x1280", "2880x2880"]) assert.equal(normalizeImageSize(size), size);
  for (const size of ["256x256", "512x512", "768x768", "1023x1024", "4096x1024", "3840x3840", "3840x960", "0x1024", "1024X1024", "auto"]) assert.throws(() => normalizeImageSize(size), {code: "invalid-argument"});
  const h = harness();
  for (const override of [{model: "bad"}, {quality: "auto"}, {transparentBackground: "false"}, {size: null}, {prompt: " "}]) {
    await assert.rejects(() => h.feature.generateImage({prompt: "test", ...override}), {code: "invalid-argument"});
  }
  assert.deepEqual(h.requests, []);
  assert.throws(() => resolveImageRequest(null), {code: "invalid-argument"});
});
test("config saves require a verified, active administrator checked on the server", async () => {
  const h = harness();
  for (const uid of [undefined, "student", "unverified", "disabled"]) {
    await assert.rejects(() => h.feature.saveImageGenerationConfig(defaults, {updatedBy: uid}), {code: uid ? "permission-denied" : "unauthenticated"});
  }
  assert.equal(h.saves.length, 0);
  const saved = await h.feature.saveImageGenerationConfig({...defaults, updatedBy: "spoofed"}, {updatedBy: "admin"});
  assert.equal(saved.updatedBy, "admin"); assert.deepEqual(h.saves[0].input, defaults);
  await assert.rejects(() => h.feature.saveImageGenerationConfig({...defaults, model: "bad"}, {updatedBy: "admin"}), {code: "invalid-argument"});
  assert.equal(h.saves.length, 1);
});
test("repository uses the shared config path and trusted timestamp metadata", async () => {
  let data = null; const paths = [], writes = [];
  const reference = {get: async () => ({exists: !!data, data: () => data}), set: async (value, options) => {writes.push({value, options}); data = value;}};
  const repository = new FirestoreImageGenerationConfigRepository({getDb: () => ({collection: name => {paths.push(name); return {doc: id => {paths.push(id); return reference;}};}}),
    serverTimestamp: () => ({toDate: () => new Date("2026-10-21T10:00:00Z")})});
  assert.equal(await repository.getConfig(), null);
  const saved = await repository.saveConfig(defaults, "admin");
  assert.deepEqual(paths.slice(0, 2), ["imageGeneration", "config"]); assert.equal(saved.updatedAt, "2026-10-21T10:00:00.000Z");
  assert.equal(saved.updatedBy, "admin"); assert.deepEqual(writes[0].options, {merge: false});
});
test("OpenAI image adapter maps PNG and transparency and normalizes output", async () => {
  const requests = [];
  const adapter = new OpenAIUtil({createClient: () => ({images: {generate: async (...args) => {requests.push(args); return {data: [{b64_json: "aW1hZ2U="}], usage: {total_tokens: 5}};}}})});
  const result = await adapter.generateImage({prompt: "cartoon", ...defaults, transparentBackground: true});
  assert.deepEqual(requests[0][0], {prompt: "cartoon", model: defaults.model, quality: "medium", size: "1024x1024", background: "transparent", output_format: "png", n: 1});
  assert.ok(requests[0][1].signal instanceof AbortSignal);
  assert.deepEqual(result.images, [{mimeType: "image/png", base64: "aW1hZ2U="}]);
  assert.equal(result.settings.transparentBackground, true); assert.equal(result.model, defaults.model);
  await adapter.generateImage({prompt: "cartoon", ...defaults}); assert.equal(requests[1][0].background, "opaque");
});
test("image deadline aborts one upstream attempt and empty results fail without retries", async () => {
  let signal, calls = 0;
  const adapter = new OpenAIUtil({createClient: () => ({images: {generate: (input, options) => {calls++; signal = options.signal; return new Promise(() => {});}}})});
  await assert.rejects(() => adapter.generateImage({prompt: "test", ...defaults}, {timeoutMs: 10}), {code: "image-timeout"});
  assert.equal(calls, 1); assert.equal(signal.aborted, true);
  const empty = new OpenAIUtil({createClient: () => ({images: {generate: async () => ({data: []})}})});
  await assert.rejects(() => empty.generateImage({prompt: "test", ...defaults}), {code: "image-empty-response"});
});
test("Functions LlmUtil supports image-only adapters while preserving text adapters", async () => {
  registerLlmProvider("fake-image", {generateImage: async input => input});
  registerLlmProvider("fake-text", {call: async input => ({json: input}), generateText: async input => input});
  const util = new LlmUtil({provider: "fake-text"});
  assert.equal(await util.generateText("text"), "text"); assert.deepEqual(await util.call("text"), {json: "text"});
  assert.equal(await util.generateImage("image", {provider: "fake-image"}), "image");
  assert.throws(() => util.generateImage("bad", {provider: "fake-text"}), /does not support/);
});
const response = () => ({headers: {}, statusCode: null, payload: null, set(name,value) {this.headers[name] = value; return this;},
  status(value) {this.statusCode = value; return this;}, json(value) {this.payload = value; return this;}, send(value) {this.payload = value; return this;}});
test("HTTP generation authenticates, rejects malformed input, and ignores spoofed caller identity", async () => {
  const h = harness(), logs = [];
  const handler = createImageGenerationHandler({apis: h.feature, verifyToken: async token => {assert.equal(token, "token"); return {uid: "student"};},
    log: {info: (...args) => logs.push(args), error: (...args) => logs.push(args)}});
  const invoke = async (body, headers = {authorization: "Bearer token"}, method = "POST") => {const res = response(); await handler({method, headers, body}, res); return res;};
  assert.equal((await invoke({input: {prompt: "secret prompt"}}, {})).statusCode, 401);
  const ok = await invoke({input: {prompt: "secret prompt", updatedBy: "admin"}});
  assert.equal(ok.statusCode, 200); assert.equal(ok.payload.result.settings.model, defaults.model); assert.equal(ok.headers["X-Request-ID"], ok.payload.requestId);
  const denied = await invoke({action: "saveConfig", input: {...defaults, updatedBy: "admin"}});
  assert.equal(denied.statusCode, 403); assert.deepEqual(h.saves, []);
  for (const body of ["{bad", [], {}, {action: "toString"}, {input: {prompt: "test", quality: "bad"}}]) assert.equal((await invoke(body)).statusCode, 400);
  assert.equal((await invoke({}, {}, "OPTIONS")).statusCode, 204); assert.equal((await invoke({}, {}, "GET")).statusCode, 405);
  assert.equal(JSON.stringify(logs).includes("secret prompt"), false);
});
test("HTTP errors correlate request IDs and hide provider secrets and raw responses", async () => {
  const logs = [];
  const handler = createImageGenerationHandler({verifyToken: async () => ({uid: "student"}), apis: {generateImage: async () => {throw Object.assign(new Error("key-secret raw-provider-text"), {status: 500});}},
    log: {info() {}, error: (...args) => logs.push(args)}});
  const res = response(); await handler({method: "POST", headers: {authorization: "Bearer token"}, body: {input: {prompt: "private"}}}, res);
  assert.equal(res.statusCode, 502); assert.ok(res.payload.requestId);
  assert.equal(JSON.stringify([logs, res.payload]).includes("key-secret"), false);
});
