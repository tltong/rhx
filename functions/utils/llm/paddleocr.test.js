const assert = require("node:assert/strict");
const {test} = require("node:test");
const {PaddleOcrUtil, PADDLEOCR_MODEL} = require("./paddleocr");
const {LlmUtil} = require("./llm_util");

const image = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
const endpoint = "https://paddleocr-test-uc.a.run.app";
const result = {text: "學生\nHello studant", warnings: [], provider: "paddleocr", model: PADDLEOCR_MODEL};
function harness(overrides = {}) {
  const calls = [], audiences = [], headers = [];
  const client = {getRequestHeaders: async url => {headers.push(url); return {Authorization: "Bearer test-identity-token"};},
    transporter: {request: async options => {calls.push(options); return {data: result};}}, ...overrides.client};
  const util = new PaddleOcrUtil({getEndpoint: () => endpoint,
    createClient: async url => {audiences.push(url); return client;}, ...overrides});
  return {util, calls, audiences, headers};
}
test("PaddleOCR uses audience-bound auth and one request, reuses the client, and preserves transcription", async () => {
  const h = harness();
  assert.deepEqual(await h.util.extractTextFromImage({image, languageHint: " Chinese "}), result);
  assert.deepEqual(await h.util.extractTextFromImage({image}), result);
  assert.deepEqual(h.audiences, [endpoint]); assert.deepEqual(h.headers, [endpoint, endpoint]);
  assert.equal(h.calls.length, 2);
  const sent = h.calls[0];
  assert.equal(sent.url, endpoint); assert.equal(sent.method, "POST");
  assert.equal(sent.headers.Authorization, "Bearer test-identity-token");
  assert.deepEqual(sent.data, {image, model: PADDLEOCR_MODEL, languageHint: "Chinese"});
  assert.equal(sent.retry, false); assert.equal(sent.maxRedirects, 0);
  assert.equal(typeof new LlmUtil().getProviderAdapter("paddleocr").extractTextFromImage, "function");
  assert.throws(() => new LlmUtil().generateText({}, {provider: "paddleocr"}), /does not support/);
});
test("invalid inputs and insecure endpoints are rejected before authentication", async () => {
  const h = harness();
  for (const input of [{image, model: "gpt-6.1-sol"}, {image, languageHint: " "}, {image, languageHint: 42},
    {image: {...image, mimeType: "image/jpeg"}}]) {
    await assert.rejects(() => h.util.extractTextFromImage(input), {code: "invalid-argument"});
  }
  for (const timeoutMs of [0, -1, NaN, 240001]) {
    await assert.rejects(() => h.util.extractTextFromImage({image}, {timeoutMs}), {code: "invalid-argument"});
  }
  assert.deepEqual(h.audiences, []);
  for (const url of ["http://paddleocr.run.app", "https://example.com", endpoint + "?token=secret", endpoint + "/other"]) {
    const invalid = harness({getEndpoint: () => url});
    await assert.rejects(() => invalid.util.extractTextFromImage({image}), {code: "ocr-unavailable"});
    assert.deepEqual(invalid.audiences, []);
  }
});
test("malformed responses and upstream failures return safe errors without replaying OCR", async () => {
  for (const data of [{...result, provider: "openai"}, {...result, model: "other"}, {...result, text: 7},
    {...result, warnings: [42]}, {error: {message: "private error"}}]) {
    let count = 0;
    const h = harness({client: {getRequestHeaders: async () => ({}), transporter: {
      request: async () => {count++; return {data};}}}});
    await assert.rejects(() => h.util.extractTextFromImage({image}), {code: "ocr-invalid-response"});
    assert.equal(count, 1);
  }
  for (const status of [403, 429, 503, 504]) {
    let count = 0;
    const h = harness({client: {getRequestHeaders: async () => ({}), transporter: {request: async () => {
      count++; throw Object.assign(new Error("private key and image"), {response: {status, data: "private"}});
    }}}});
    await assert.rejects(() => h.util.extractTextFromImage({image}), error =>
      error.code === (status === 504 ? "ocr-timeout" : "ocr-unavailable") && !/private/.test(error.message));
    assert.equal(count, 1);
  }
});
test("the deadline covers auth and HTTP and prevents late auth from sending an image", async () => {
  for (const phase of ["client", "headers", "request"]) {
    let release, sent = 0, requestSignal;
    const stalled = new Promise(resolve => {release = resolve;});
    const client = {getRequestHeaders: () => phase === "headers" ? stalled : Promise.resolve({}),
      transporter: {request: options => {sent++; requestSignal = options.signal; return stalled;}}};
    const h = harness({createClient: () => phase === "client" ? stalled : Promise.resolve(client)});
    await assert.rejects(() => h.util.extractTextFromImage({image}, {timeoutMs: 10}), {code: "ocr-timeout"});
    assert.equal(sent, phase === "request" ? 1 : 0);
    if (requestSignal) assert.equal(requestSignal.aborted, true);
    release(phase === "client" ? client : {});
    await new Promise(setImmediate);
    assert.equal(sent, phase === "request" ? 1 : 0);
  }
});
test("caller cancellation is honored before auth and during the request", async () => {
  const before = new AbortController(); before.abort();
  const h = harness();
  await assert.rejects(() => h.util.extractTextFromImage({image}, {signal: before.signal}), {name: "AbortError"});
  assert.deepEqual(h.audiences, []);
  let requestSignal, started;
  const ready = new Promise(resolve => {started = resolve;});
  const running = harness({client: {getRequestHeaders: async () => ({}), transporter: {request: options => {
    requestSignal = options.signal; started(); return new Promise(() => {});
  }}}});
  const controller = new AbortController();
  const pending = running.util.extractTextFromImage({image}, {signal: controller.signal});
  await ready; controller.abort();
  await assert.rejects(() => pending, {name: "AbortError"});
  assert.equal(requestSignal.aborted, true);
});
