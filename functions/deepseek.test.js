const assert = require("node:assert/strict");
const {beforeEach, test} = require("node:test");
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const {parseEnv} = require("node:util");

const requests = [];
const clients = [];
const logs = [];
let complete;
class FakeOpenAI {
  constructor(options) {
    clients.push(options);
    this.chat = {completions: {create: (body, requestOptions) => {
      requests.push({body, options: requestOptions});
      return complete(body, requestOptions);
    }}};
    this.responses = {create: (body, requestOptions) => {
      requests.push({body, options: requestOptions});
      return complete(body, requestOptions);
    }};
  }
}
const originalLoad = Module._load;
const originalOrigins = process.env.ALLOWED_WEB_ORIGINS;
let deepseek;
try {
  process.env.ALLOWED_WEB_ORIGINS = parseEnv(
    fs.readFileSync(path.join(__dirname, ".env.readyherox"), "utf8")
  ).ALLOWED_WEB_ORIGINS;
  Module._load = function(id, parent, ...args) {
    if ([require.resolve("./deepseek"), require.resolve("./utils/llm/deepseek_util")].includes(parent?.filename)) {
      if (id === "openai") return FakeOpenAI;
      if (id === "firebase-functions/v2/https") return {onRequest: (options, handler) => {
        handler.configuration = options;
        return handler;
      }};
      if (id === "firebase-functions/params") return {defineSecret: () => ({value: () => "fake-secret"})};
      if (id === "firebase-functions/logger") return Object.fromEntries(["info", "error"].map(level => [
        level, (message, details) => logs.push({level, message, ...details}),
      ]));
    }
    return originalLoad.call(this, id, parent, ...args);
  };
  deepseek = require("./deepseek");
} finally {
  Module._load = originalLoad;
  if (originalOrigins === undefined) delete process.env.ALLOWED_WEB_ORIGINS;
  else process.env.ALLOWED_WEB_ORIGINS = originalOrigins;
}

function completion(content) {
  return {model: "deepseek-v4-pro", choices: [{message: {content}, finish_reason: "stop"}], usage: {total_tokens: 20}};
}
function response() {
  return {
    headers: {}, statusCode: null, payload: null,
    set(name, value) {this.headers[name.toLowerCase()] = value; return this;},
    status(code) {this.statusCode = code; return this;},
    json(data) {this.payload = data; return this;},
    send(data) {this.payload = data; return this;},
  };
}
const request = (changes = {}) => ({
  method: "POST", body: {prompt: "Return JSON.", maxTokens: 8192},
  get(name) {return name === "origin" ? "https://readyherox.web.app" : null;}, ...changes,
});
beforeEach(() => {
  requests.length = clients.length = logs.length = 0;
  complete = async () => completion('{"answer":1}');
});

test("generation preserves model options, parses JSON and disables hidden SDK retries", async () => {
  const stages = [];
  const result = await deepseek.generateDeepseekJson("Return JSON.", {
    maxTokens: 8192, temperature: 0, onProgress: event => stages.push(event.stage),
  });
  assert.deepEqual(result.json, {answer: 1});
  assert.equal(requests[0].body.model, "deepseek-v4-pro");
  assert.equal(requests[0].body.max_tokens, 8192);
  assert.equal(requests[0].body.temperature, 0);
  assert.deepEqual(requests[0].body.thinking, {type: "disabled"});
  assert.equal(clients[0].maxRetries, 0);
  assert.equal(clients[0].timeout, 240000);
  assert.equal(requests[0].options.signal.aborted, false);
  assert.deepEqual(stages, ["generation-started", "generation-received", "json-validated"]);
});

test("the total deadline rejects and aborts a stalled upstream response", async () => {
  complete = () => new Promise(() => {});
  await assert.rejects(() => deepseek.generateDeepseekJson("Return JSON.", {timeoutMs: 15}), error => {
    assert.equal(error.code, "deepseek-timeout");
    assert.equal(error.status, 504);
    return true;
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.signal.aborted, true);
});
test("long outputs require a bounded server option; request bodies retain the existing token ceiling", async () => {
  await deepseek.generateDeepseekJson("Return JSON.", {maxTokens: 30000, maxTokenLimit: 32768});
  assert.equal(requests.at(-1).body.max_tokens, 30000);
  await deepseek.generateDeepseekJson("Return JSON.", {maxTokens: 999999, maxTokenLimit: 999999});
  assert.equal(requests.at(-1).body.max_tokens, 32768);
  await deepseek.generateDeepseekJson({prompt: "Return JSON.", maxTokens: 30000, maxTokenLimit: 32768});
  assert.equal(requests.at(-1).body.max_tokens, 8192);
});
test("news discovery invokes the shared DeepSeek web adapter and retains search evidence", async () => {
  const {discoverNews} = require("./features/news_article_generator/infrastructure/news_providers");
  const raw = {title: "Science news", canonicalUrl: "https://example.test/news",
    sources: [{url: "https://example.test/news", title: "Science report", publisher: "Example News", publishedAt: "2026-11-14T00:00:00Z"}],
    facts: [{text: "A science exhibition opened.", sourceIds: ["s1"]}, {text: "Students learn about space.", sourceIds: ["s1"]}]};
  const response = {status: "completed", output_text: JSON.stringify(raw), output: [{type: "web_search_call", status: "completed", action: {type: "search", sources: [{url: raw.canonicalUrl}]}}]};
  complete = async () => response;
  assert.deepEqual(await discoverNews("Find real science news and return JSON"), raw);
  assert.equal(clients[0].baseURL, "https://api.deepseek.com"); assert.equal(clients[0].apiKey, "fake-secret");
  assert.equal(clients[0].maxRetries, 0); assert.equal(requests.length, 1);
  assert.equal(requests[0].body.model, "deepseek-v4-pro"); assert.deepEqual(requests[0].body.tools, [{type: "web_search"}]);
  assert.equal(requests[0].body.tool_choice, "required"); assert.deepEqual(requests[0].body.reasoning, {effort: "none"});
  assert.equal(requests[0].body.max_output_tokens, 12000);
  assert.deepEqual(requests[0].body.text, {format: {type: "json_object"}});
  for (const field of ["include", "store", "response_format"]) assert.equal(Object.hasOwn(requests[0].body, field), false);
});
test("DeepSeek web searches validate input, abort on deadline and never retry implicitly", async () => {
  const {searchLlmWeb} = require("./utils/llm/llm_ops");
  await assert.rejects(searchLlmWeb("", {provider: "deepseek"}), {code: "invalid-argument"});
  assert.equal(requests.length, 0);
  complete = () => new Promise(() => {});
  await assert.rejects(searchLlmWeb("Find news", {provider: "deepseek", timeoutMs: 15}), {code: "deepseek-timeout", status: 504});
  assert.equal(requests.length, 1); assert.equal(requests[0].options.signal.aborted, true);
  complete = async () => {throw Object.assign(new Error("SDK timeout"), {name: "APIConnectionTimeoutError"});};
  await assert.rejects(searchLlmWeb("Find news", {provider: "deepseek"}), {code: "deepseek-timeout"});
  assert.equal(requests.length, 2);
});

test("JSON retries share the original deadline and abort signal", async () => {
  complete = () => requests.length === 1 ? Promise.resolve(completion("")) : new Promise(() => {});
  await assert.rejects(() => deepseek.generateDeepseekJson("Return JSON.", {timeoutMs: 15}), {code: "deepseek-timeout"});
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.signal, requests[0].options.signal);
  assert.equal(requests[1].options.signal.aborted, true);
  assert.equal(Object.hasOwn(requests[1].body, "response_format"), false);
});

test("JSON repair shares the deadline and successful repair still returns the expected payload", async () => {
  complete = () => Promise.resolve(completion(requests.length === 1 ? "not json" : '{"repaired":true}'));
  assert.deepEqual((await deepseek.generateDeepseekJson("Return JSON.")).json, {repaired: true});
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.signal, requests[0].options.signal);
  requests.length = 0;
  complete = () => requests.length === 1 ? Promise.resolve(completion("not json")) : new Promise(() => {});
  await assert.rejects(() => deepseek.generateDeepseekJson("Return JSON.", {timeoutMs: 15}), {code: "deepseek-timeout"});
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.signal.aborted, true);
});

test("a late upstream result cannot start another paid attempt after the deadline", async () => {
  let resolve;
  complete = () => new Promise(res => {resolve = res;});
  await assert.rejects(() => deepseek.generateDeepseekJson("Return JSON.", {timeoutMs: 15}), {code: "deepseek-timeout"});
  resolve(completion("not json"));
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
});

test("HTTP timeout responses retain CORS headers and provide a request ID and logged stage", async () => {
  complete = async () => {const error = new Error("SDK timeout"); error.name = "APIConnectionTimeoutError"; throw error;};
  const res = response();
  await deepseek.generateDeepseekText(request(), res);
  assert.equal(res.statusCode, 504);
  assert.equal(res.headers["access-control-allow-origin"], "https://readyherox.web.app");
  assert.equal(res.payload.code, "deepseek-timeout");
  assert.match(res.payload.error, /took too long/);
  assert.equal(res.headers["x-request-id"], res.payload.requestId);
  const errorLog = logs.find(log => log.level === "error");
  assert.equal(errorLog.requestId, res.payload.requestId);
  assert.equal(errorLog.stage, "generation-started");
  assert.equal(errorLog.status, 504);
  assert.equal(JSON.stringify(logs).includes("fake-secret"), false);
  assert.equal(JSON.stringify(logs).includes("Return JSON."), false);
});

test("HTTP success and invalid JSON keep the existing response contract and correlate logs", async () => {
  const success = response();
  await deepseek.generateDeepseekText(request(), success);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.payload.json, {answer: 1});
  assert.ok(logs.some(log => log.requestId === success.payload.requestId && log.stage === "completed"));
  complete = async () => completion("invalid");
  const failed = response();
  await deepseek.generateDeepseekText(request(), failed);
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.payload.error, "DeepSeek did not return valid JSON.");
  assert.equal(failed.payload.rawText, "invalid");
  assert.ok(failed.payload.diagnostics.initial);
  assert.equal(failed.headers["access-control-allow-origin"], "https://readyherox.web.app");
});

test("preflight and invalid input never invoke the LLM", async () => {
  const preflight = response();
  await deepseek.generateDeepseekText(request({method: "OPTIONS"}), preflight);
  assert.equal(preflight.statusCode, 204);
  const invalid = response();
  await deepseek.generateDeepseekText(request({body: {}}), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(requests.length, 0);
  assert.equal(deepseek.generateDeepseekText.configuration.timeoutSeconds, 600);
});

test("OCR uses Flash with image blocks while subsequent text requests retain Pro and SDK retries stay disabled", async () => {
  const {extractLlmImageText} = require("./utils/llm/llm_util");
  complete = async () => completion('{"text":"Hello 学生","warnings":[]}');
  await extractLlmImageText({image: {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="},
    model: "deepseek-flash", detail: "original", instructions: "Return JSON.", maxTokens: 8192});
  assert.equal(requests[0].body.model, "deepseek-flash"); assert.equal(requests[0].body.messages[1].content[1].type, "image_url");
  assert.equal(clients[0].maxRetries, 0); assert.equal(clients[0].timeout, 240000);
  complete = async () => completion('{"answer":1}');
  assert.deepEqual((await deepseek.generateDeepseekJson("Return JSON.")).json, {answer: 1});
  assert.equal(requests[1].body.model, "deepseek-v4-pro");
});
