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
test("Web accepts a canvas Blob or normalized image while retaining omissions for Functions defaults", async () => {
  const calls = [];
  const feature = createImageOcrFeature({getUser: () => user, extract: async (...args) => {calls.push(args); return {text: "你好", warnings: []};}});
  const result = await feature.extractTextFromImage({image: blob(), languageHint: "auto"});
  assert.equal(result.text, "你好"); assert.deepEqual(calls[0], [{image, languageHint: "auto"}, {provider: "deepseek", operation: "extract"}]);
  await feature.extractTextFromImage({image, detail: "high", additionalInstructions: "Keep lines"});
  assert.deepEqual(calls[1][0], {image, detail: "high", additionalInstructions: "Keep lines"});
  assert.equal(Object.hasOwn(calls[1][0], "model"), false);
});
test("Web admin tests transmit draft settings without saving and use the provider utility", async () => {
  const calls = [], requests = [];
  const feature = createImageOcrFeature({getUser: () => user, client: {request: async (...args) => requests.push(args)}, extract: async (...args) => calls.push(args)});
  const configuration = {...defaults, languageHint: "Tamil", ocrInstructions: "Draft OCR instructions"};
  await feature.testImageOcr({image: blob(), configuration});
  assert.deepEqual(calls[0], [{image, configuration}, {provider: "deepseek", operation: "test"}]); assert.deepEqual(requests, []);
  await feature.getImageOcrConfig(); await feature.saveImageOcrConfig(configuration);
  assert.deepEqual(requests, [["getConfig"], ["saveConfig", configuration]]);
});
test("both layers share settings and validation and invalid images never reach the provider", async () => {
  const backend = createRequire(import.meta.url)("../../../functions/utils/llm/image_ocr_settings");
  for (const key of ["OCR_PROVIDERS", "OCR_MODELS_BY_PROVIDER", "OCR_DEFAULT_MODELS", "OCR_MODELS", "OCR_DETAILS", "OCR_MIME_TYPES", "DEFAULT_OCR_SETTINGS"]) assert.deepEqual(settings[key], backend[key]);
  assert.deepEqual(settings.normalizeOcrSettings(defaults), backend.normalizeOcrSettings(defaults));
  const openai = {...defaults, provider: "openai", model: "gpt-6.1-sol"};
  assert.deepEqual(settings.normalizeOcrSettings(openai), backend.normalizeOcrSettings(openai));
  const {provider: omitted, ...legacy} = defaults;
  assert.deepEqual(settings.normalizeOcrSettings(legacy), defaults);
  const calls = [], feature = createImageOcrFeature({getUser: () => user, extract: async input => calls.push(input)});
  for (const input of [{image, model: "deepseek-v4-pro"}, {image: {...image, mimeType: "image/jpeg"}}, {image, detail: "bad"}, {image, timeoutSeconds: 500}]) await assert.rejects(() => feature.extractTextFromImage(input), {code: "invalid-argument"});
  await assert.rejects(() => toOcrImage(new Blob([], {type: "image/png"})), {code: "invalid-argument"}); assert.deepEqual(calls, []);
});
test("OCR-only adapters work and both provider adapters proxy through the authenticated OCR client", async () => {
  registerLlmProvider("fake-ocr", {extractTextFromImage: async input => input});
  registerLlmProvider("fake-image-only", {generateImage: async input => input});
  const util = new LlmUtil(); assert.deepEqual(await util.extractTextFromImage({image}, {provider: "fake-ocr"}), {image});
  assert.throws(() => util.extractTextFromImage({image}, {provider: "fake-image-only"}), /does not support/);
  assert.equal(typeof util.getProviderAdapter("openai").extractTextFromImage, "function");
  const requests = [], adapter = new DeepseekUtil({ocrClient: {request: async (...args) => requests.push(args)}});
  await adapter.extractTextFromImage({image}, {operation: "test"}); assert.deepEqual(requests[0], ["test", {image}, {}]);
  const openai = new OpenAIUtil({ocrClient: {request: async (...args) => requests.push(args)}});
  await openai.extractTextFromImage({image, provider: "openai"}); assert.deepEqual(requests[1], ["extract", {image, provider: "openai"}, {}]);
});
test("Web OpenAI extraction and draft tests preserve provider selection and leave omitted defaults to Functions", async () => {
  const calls = [], feature = createImageOcrFeature({getUser: () => user, extract: async (...args) => calls.push(args)});
  await feature.extractTextFromImage({image: blob(), provider: "openai", model: "gpt-6-astra", languageHint: "Chinese"});
  assert.deepEqual(calls[0], [{image, provider: "openai", model: "gpt-6-astra", languageHint: "Chinese"}, {provider: "openai", operation: "extract"}]);
  await feature.extractTextFromImage({image, provider: "openai"});
  assert.equal(Object.hasOwn(calls[1][0], "model"), false);
  const configuration = {...defaults, provider: "openai", model: "gpt-6.1-sol"};
  await feature.testImageOcr({image: blob(), configuration});
  assert.deepEqual(calls[2], [{image, configuration}, {provider: "openai", operation: "test"}]);
  for (const input of [{image, provider: "openai", model: "deepseek-flash"}, {image, provider: "deepseek", model: "gpt-6-astra"}, {image, provider: "other"}]) {
    await assert.rejects(() => feature.extractTextFromImage(input), {code: "invalid-argument"});
  }
  assert.equal(calls.length, 3);
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
  const feature = createImageOcrFeature({getUser: () => current, extract: async () => {calls++; current = null; return {text: "private"};}});
  await assert.rejects(() => feature.extractTextFromImage({image}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = user; const original = blob(); original.arrayBuffer = async () => {current = {uid: "other"}; return Buffer.from(image.base64, "base64");};
  await assert.rejects(() => feature.extractTextFromImage({image: original}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = user; await assert.rejects(() => feature.extractTextFromImage({image}), {code: "unauthenticated"}); assert.equal(calls, 1);
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
