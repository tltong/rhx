import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {createImageGenerationFeature, DEFAULT_IMAGE_SETTINGS} from "./image_generation_module.js";
import {ImageGenerationClient} from "../../utils/llm/image_generation_client.js";
import {LlmUtil, registerLlmProvider, getDefaultLlmProvider} from "../../utils/llm/llm_util.js";
import * as webSettings from "../../utils/llm/image_generation_settings.js";
import {getHttpFunctionUrl} from "../../utils/firebase/function_url.js";
const backendSettings = createRequire(import.meta.url)("../../../functions/utils/llm/image_generation_settings.js");
const response = (result, status = 200) => ({ok: status === 200, status, json: async () => result});
const user = {uid: "student", getIdToken: async () => "token"};

test("Web feature preserves omitted fields for server defaults and allows explicit false", async () => {
  const calls = [], saves = [];
  const feature = createImageGenerationFeature({generate: async (...args) => {calls.push(args); return {};}, client: {request: async (...args) => {saves.push(args); return null;}}});
  await feature.generateImage({prompt: " cartoon "});
  assert.deepEqual(calls[0], [{prompt: "cartoon"}, {provider: "openai"}]);
  await feature.generateImage({prompt: "test", quality: "low", transparentBackground: false});
  assert.deepEqual(calls[1][0], {prompt: "test", quality: "low", transparentBackground: false});
  assert.throws(() => feature.generateImage({prompt: "test", size: "512x512"}), {code: "invalid-argument"});
  await feature.getImageGenerationConfig(); await feature.saveImageGenerationConfig(DEFAULT_IMAGE_SETTINGS);
  assert.deepEqual(saves, [["getConfig"], ["saveConfig", DEFAULT_IMAGE_SETTINGS]]);
});
test("both layers expose the same native sizes and validation rules", () => {
  for (const key of ["IMAGE_MODELS", "IMAGE_SIZES", "IMAGE_QUALITIES", "DEFAULT_IMAGE_SETTINGS"]) assert.deepEqual(webSettings[key], backendSettings[key]);
  for (const size of [...webSettings.IMAGE_SIZES, "1280x1024", "512x512", "3840x3840", "3840x1280", "3000x1000"]) {
    const validate = api => {try {return api.normalizeImageSize(size);} catch (error) {return error.message;}};
    assert.equal(validate(webSettings), validate(backendSettings));
  }
});
test("Web utility registers image-only adapters without changing default text provider", async () => {
  assert.equal(getDefaultLlmProvider(), "deepseek");
  registerLlmProvider("fake-image", {generateImage: async input => input});
  registerLlmProvider("fake-text", {call: async input => ({json: input}), generateText: async input => input});
  const llm = new LlmUtil({provider: "fake-text"});
  assert.equal(await llm.generateText("text"), "text"); assert.deepEqual(await llm.call("text"), {json: "text"});
  assert.equal(await llm.generateImage("image", {provider: "fake-image"}), "image");
  assert.throws(() => llm.generateText("bad", {provider: "fake-image"}), /does not support generateText/);
  assert.throws(() => llm.generateImage("bad", {provider: "deepseek"}), /does not support generateImage/);
});
test("authenticated image transport calls the direct function with a bearer token", async () => {
  const calls = [];
  const client = new ImageGenerationClient({getUser: () => user, hostname: "readyherox.web.app", fetchImpl: async (...args) => {calls.push(args); return response({result: {images: []}});}});
  assert.deepEqual(await client.request("generate", {prompt: "cartoon"}), {images: []});
  assert.equal(calls[0][0], "https://us-central1-readyherox.cloudfunctions.net/generateLlmImage");
  assert.equal(calls[0][1].headers.Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(calls[0][1].body), {action: "generate", input: {prompt: "cartoon"}});
  assert.equal(getHttpFunctionUrl("generateLlmImage", {hostname: "localhost"}), "http://localhost:5001/readyherox/us-central1/generateLlmImage");
});
test("transport rejects sign-out before sending or displaying another account's result", async () => {
  let current = null, calls = 0;
  const client = new ImageGenerationClient({getUser: () => current, fetchImpl: async () => {calls++; current = null; return response({result: "private image"});}});
  await assert.rejects(() => client.request("generate", {}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = {uid: "student", getIdToken: async () => {current = {uid: "other"}; return "token";}};
  await assert.rejects(() => client.request("generate", {}), {code: "unauthenticated"}); assert.equal(calls, 0);
  current = user;
  await assert.rejects(() => client.request("generate", {}), {code: "unauthenticated"}); assert.equal(calls, 1);
});
test("structured errors retain request IDs and never automatically retry paid requests", async () => {
  let calls = 0;
  const client = new ImageGenerationClient({getUser: () => user, fetchImpl: async () => {calls++; return response({error: {code: "image-timeout", message: "Took too long"}, requestId: "req-1"}, 504);}});
  await assert.rejects(() => client.request("generate", {}), {code: "image-timeout", requestId: "req-1", message: "Took too long"});
  assert.equal(calls, 1);
});
test("the Web deadline covers stalled fetch and response-body reads", async () => {
  for (const bodyRead of [false, true]) {
    let signal, calls = 0;
    const client = new ImageGenerationClient({getUser: () => user, fetchImpl: (url, options) => {
      calls++; signal = options.signal;
      return bodyRead ? Promise.resolve({ok: true, json: () => new Promise(() => {})}) : new Promise(() => {});
    }});
    await assert.rejects(() => client.request("generate", {}, {timeoutMs: 10}), {code: "image-timeout"});
    assert.equal(signal.aborted, true); assert.equal(calls, 1);
  }
});
test("cancellation rejects an in-flight request without retrying", async () => {
  const controller = new AbortController(); let calls = 0;
  const client = new ImageGenerationClient({getUser: () => user, fetchImpl: () => {calls++; return new Promise(() => {});}});
  const pending = client.request("generate", {}, {signal: controller.signal});
  await new Promise(setImmediate); controller.abort();
  await assert.rejects(() => pending, {name: "AbortError"}); assert.equal(calls, 1);
});
