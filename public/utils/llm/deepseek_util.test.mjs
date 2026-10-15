import assert from "node:assert/strict";
import {test} from "node:test";
import {
  DeepseekUtil, getDeepseekFunctionUrl, DEEPSEEK_HOSTING_REWRITE_PATH,
} from "./deepseek_util.js";

const directUrl = "https://us-central1-readyherox.cloudfunctions.net/generateDeepseekText";
const html = '<!DOCTYPE html><html lang=en><title>Error 502 (Server Error)!!1</title></html>';
function response(status, payload) {
  return {
    ok: status >= 200 && status < 300, status, statusText: "",
    text: async () => typeof payload === "string" ? payload : JSON.stringify(payload),
  };
}

test("direct requests bypass Hosting and preserve the request and parsed response", async () => {
  const calls = [];
  const client = new DeepseekUtil({
    fetchImpl: async (url, request) => {
      calls.push(url);
      assert.equal(request.method, "POST");
      const body = JSON.parse(request.body);
      assert.equal(body.prompt, "Return JSON mini questions.");
      assert.equal(body.maxTokens, 8192);
      assert.equal(Object.hasOwn(body, "useDirectFunction"), false);
      return response(200, {json: {miniQuestions: []}});
    },
  });
  assert.deepEqual(await client.generateText("Return JSON mini questions.", {
    maxTokens: 8192, useDirectFunction: true, hostname: "readyherox.web.app",
  }), {miniQuestions: []});
  assert.deepEqual(calls, [directUrl]);
});

test("direct requests still use the local Functions emulator during development", async () => {
  for (const hostname of ["localhost", "127.0.0.1", "::1"]) {
    const calls = [];
    const client = new DeepseekUtil({fetchImpl: async url => {
      calls.push(url);
      return response(200, {json: {isCorrect: true}});
    }});
    const options = {hostname, useDirectFunction: true};
    const emulatorUrl = getDeepseekFunctionUrl(options);
    assert.ok(emulatorUrl.startsWith("http://"));
    assert.ok(emulatorUrl.includes(":5001/readyherox/us-central1/generateDeepseekText"));
    assert.deepEqual(await client.generateText("Return JSON.", options), {isCorrect: true});
    assert.deepEqual(calls, [emulatorUrl]);
  }
});

test("HTML gateway errors have a useful message, retain diagnostics and do not retry generation", async () => {
  for (const status of [502, 503, 504]) {
    let calls = 0;
    const client = new DeepseekUtil({fetchImpl: async () => {calls++; return response(status, html);}});
    await assert.rejects(() => client.generateText("Return JSON."), error => {
      assert.equal(error.message, "The AI service is temporarily unavailable. Please try again.");
      assert.equal(error.status, status);
      assert.equal(error.rawText, html);
      assert.equal(error.payload.rawText, html);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("a structured model JSON error keeps its diagnostics and is not retried through another route", async () => {
  let calls = 0;
  const client = new DeepseekUtil({fetchImpl: async () => {
    calls++;
    return response(502, {error: "DeepSeek did not return valid JSON.", rawText: "invalid model response"});
  }});
  await assert.rejects(() => client.generateText("Return JSON."), error => {
    assert.match(error.message, /^DeepSeek did not return valid JSON\./);
    assert.equal(error.rawText, "invalid model response");
    return true;
  });
  assert.equal(calls, 1);
});

test("a missing Hosting rewrite retains the existing single direct fallback", async () => {
  const calls = [];
  const client = new DeepseekUtil({fetchImpl: async url => {
    calls.push(url);
    return calls.length === 1 ? response(404, html) : response(200, {json: {ready: true}});
  }});
  assert.deepEqual(await client.generateText("Return JSON."), {ready: true});
  assert.deepEqual(calls, [DEEPSEEK_HOSTING_REWRITE_PATH, directUrl]);

  calls.length = 0;
  await assert.rejects(() => client.generateText("Return JSON.", {allowDirectFunctionFallback: false}), {status: 404});
  assert.deepEqual(calls, [DEEPSEEK_HOSTING_REWRITE_PATH]);
});

test("a stalled fetch is aborted and produces a visible timeout without automatic retries", async () => {
  let signal;
  let calls = 0;
  const client = new DeepseekUtil({fetchImpl: (url, options) => {
    calls++;
    signal = options.signal;
    return new Promise(() => {});
  }});
  await assert.rejects(() => client.generateText("Return JSON.", {timeoutMs: 15}), error => {
    assert.equal(error.code, "deepseek-timeout");
    assert.match(error.message, /took too long/);
    return true;
  });
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test("the browser deadline includes a response body that never finishes", async () => {
  let signal;
  const client = new DeepseekUtil({fetchImpl: async (url, options) => {
    signal = options.signal;
    return {ok: true, status: 200, text: () => new Promise(() => {})};
  }});
  await assert.rejects(() => client.generateText("Return JSON.", {timeoutMs: 15}), {code: "deepseek-timeout"});
  assert.equal(signal.aborted, true);
});

test("CORS-hidden gateway errors report a connection failure and retain the original cause", async () => {
  let calls = 0;
  const failure = new TypeError("Failed to fetch");
  const client = new DeepseekUtil({fetchImpl: async () => {calls++; throw failure;}});
  await assert.rejects(() => client.generateText("Return JSON."), error => {
    assert.equal(error.code, "deepseek-network-error");
    assert.equal(error.cause, failure);
    assert.match(error.message, /connection may have failed or timed out/i);
    assert.equal(error.status, undefined);
    return true;
  });
  assert.equal(calls, 1);
});

test("backend timeouts preserve the request ID and code for troubleshooting", async () => {
  const client = new DeepseekUtil({fetchImpl: async () => response(504, {
    error: "The AI service took too long to respond. Please try again.", code: "deepseek-timeout", requestId: "request-1",
  })});
  await assert.rejects(() => client.generateText("Return JSON."), error => {
    assert.equal(error.requestId, "request-1");
    assert.equal(error.code, "deepseek-timeout");
    assert.equal(error.status, 504);
    return true;
  });
});
