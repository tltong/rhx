import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {createImageOcrFeature, DEFAULT_OCR_SETTINGS as defaults, toOcrImage} from "./image_ocr_module.js";
import * as settings from "../../utils/llm/image_ocr_settings.js";
import {ImageOcrClient} from "../../utils/llm/image_ocr_client.js";
import {DeepseekUtil} from "../../utils/llm/deepseek_util.js";
import {OpenAIUtil} from "../../utils/llm/openai_util.js";
import {LlmUtil, registerLlmProvider} from "../../utils/llm/llm_util.js";
const image = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
const user = {uid: "admin", getIdToken: async () => "token"};
const response = (payload, status = 200) => ({ok: status === 200, status, json: async () => payload});
const blob = () => new Blob([Buffer.from(image.base64, "base64")], {type: "image/png"});
test("Web sends image and normalized language through the shared authenticated client", async () => {
  const calls = [];
  const feature = createImageOcrFeature({getUser: () => user, client: {request: async (...args) => {calls.push(args); return {text: "你好", warnings: [], provider: "paddleocr"};}}});
  const result = await feature.extractTextFromImage({image: blob(), language: " English ", languageHint: "auto"});
  assert.equal(result.provider, "paddleocr");
  assert.deepEqual(calls[0], ["extract", {image, language: "English", languageHint: "auto"}, {}]);
  await feature.extractTextFromImage({image, language: "Chinese", detail: "high"});
  assert.deepEqual(calls[1], ["extract", {image, language: "Chinese", detail: "high"}, {}]);
});
test("Web draft tests transmit language and draft routes without saving", async () => {
  const requests = [];
  const feature = createImageOcrFeature({getUser: () => user, client: {request: async (...args) => requests.push(args)}});
  const configuration = {...defaults, languageProviders: {tamil: "paddleocr"}};
  await feature.testImageOcr({image: blob(), language: "Tamil", configuration});
  assert.deepEqual(requests[0], ["test", {image, language: "Tamil", configuration}, {}]);
  await feature.getImageOcrConfig(); await feature.saveImageOcrConfig(configuration);
  assert.deepEqual(requests.slice(1), [["getConfig"], ["saveConfig", configuration]]);
});
test("both layers share routing validation and reject caller overrides before HTTP", async () => {
  const backend = createRequire(import.meta.url)("../../../functions/utils/llm/image_ocr_settings");
  for (const key of ["OCR_PROVIDERS", "OCR_MODELS_BY_PROVIDER", "OCR_DEFAULT_MODELS", "OCR_MODELS", "OCR_DETAILS", "OCR_MIME_TYPES", "DEFAULT_OCR_SETTINGS"]) assert.deepEqual(settings[key], backend[key]);
  const configuration = {...defaults, languageProviders: {" English ": "paddleocr"}};
  assert.deepEqual(settings.normalizeOcrSettings(configuration), backend.normalizeOcrSettings(configuration));
  const calls = [], feature = createImageOcrFeature({getUser: () => user, client: {request: async input => calls.push(input)}});
  for (const input of [{image}, {image, language: " "}, {image, language: "English", provider: "paddleocr"},
    {image, language: "English", model: "gpt-6-astra"}, {image: {...image, mimeType: "image/jpeg"}, language: "English"}]) {
    await assert.rejects(() => feature.extractTextFromImage(input), {code: "invalid-argument"});
  }
  await assert.rejects(() => toOcrImage(new Blob([], {type: "image/png"})), {code: "invalid-argument"});
  assert.deepEqual(calls, []);
});
test("the existing browser LlmUtil supports OCR-only adapters", async () => {
  registerLlmProvider("fake-ocr", {extractTextFromImage: async input => input});
  registerLlmProvider("fake-image-only", {generateImage: async input => input});
  const util = new LlmUtil(); assert.deepEqual(await util.extractTextFromImage({image}, {provider: "fake-ocr"}), {image});
  assert.throws(() => util.extractTextFromImage({image}, {provider: "fake-image-only"}), /does not support/);
});
test("transport enforces production HTTPS, bearer auth, local emulator and request IDs", async () => {
  const requests = [];
  const client = new ImageOcrClient({hostname: "readyherox.web.app", getUser: () => user, fetchImpl: async (...args) => {requests.push(args); return response({result: {text: "学生", warnings: []}});}});
  assert.equal((await client.request("extract", {image})).text, "学生");
  assert.equal(requests[0][0], "https://us-central1-readyherox.cloudfunctions.net/extractLlmImageText");
  assert.equal(requests[0][1].headers.Authorization, "Bearer token"); assert.equal(requests[0][1].redirect, "error");
  assert.deepEqual(JSON.parse(requests[0][1].body), {action: "extract", input: {image}});
  const insecure = new ImageOcrClient({endpointUrl: "http://example.com/ocr", getUser: () => user});
  await assert.rejects(() => insecure.request("extract", {image}), /HTTPS/);
  const local = new ImageOcrClient({hostname: "localhost", getUser: () => user, fetchImpl: async url => {assert.match(url, /^http:\/\/localhost:5001/); return response({result: null});}});
  assert.equal(await local.request("getConfig"), null);
});
test("account changes during Blob conversion or after provider responses cannot send or expose OCR results", async () => {
  let current = null, calls = 0;
  const feature = createImageOcrFeature({getUser: () => current, client: {request: async () => {calls++; current = null; return {text: "private"};}}});
  await assert.rejects(() => feature.extractTextFromImage({image, language: "English"}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = user; const original = blob(); original.arrayBuffer = async () => {current = {uid: "other"}; return Buffer.from(image.base64, "base64");};
  await assert.rejects(() => feature.extractTextFromImage({image: original, language: "English"}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = user; await assert.rejects(() => feature.extractTextFromImage({image, language: "English"}), {code: "unauthenticated"}); assert.equal(calls, 1);
});
test("transport detects authentication changes before sending and after body reads", async () => {
  let current = null, calls = 0;
  const client = new ImageOcrClient({getUser: () => current, fetchImpl: async () => {calls++; current = null; return response({result: {text: "private"}});}});
  await assert.rejects(() => client.request("extract", {image}), {code: "unauthenticated"});
  current = {uid: "admin", getIdToken: async () => {current = null; return "token";}};
  await assert.rejects(() => client.request("extract", {image}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = user; await assert.rejects(() => client.request("extract", {image}), {code: "unauthenticated"}); assert.equal(calls, 1);
});
test("errors, stalled responses, and cancellation never trigger automatic OCR retries", async () => {
  let calls = 0;
  const client = new ImageOcrClient({getUser: () => user, fetchImpl: async () => {calls++; return response({error: {code: "ocr-timeout", message: "Too long"}, requestId: "request-1"}, 504);}});
  await assert.rejects(() => client.request("extract", {image}), {code: "ocr-timeout", requestId: "request-1"}); assert.equal(calls, 1);
  for (const stalledBody of [false, true]) {
    let signal;
    const stalled = new ImageOcrClient({getUser: () => user, fetchImpl: (url, options) => {calls++; signal = options.signal; return stalledBody ? Promise.resolve({json: () => new Promise(() => {})}) : new Promise(() => {});}});
    await assert.rejects(() => stalled.request("extract", {image}, {timeoutMs: 10}), {code: "ocr-timeout"}); assert.equal(signal.aborted, true);
  }
  const controller = new AbortController(), pendingClient = new ImageOcrClient({getUser: () => user, fetchImpl: () => new Promise(() => {})});
  const pending = pendingClient.request("extract", {image}, {signal: controller.signal}); controller.abort();
  await assert.rejects(() => pending, {name: "AbortError"});
});
