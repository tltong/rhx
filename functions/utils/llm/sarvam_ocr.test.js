const assert = require("node:assert/strict");
const {test} = require("node:test");
const sharp = require("sharp");
const {SarvamAIClient} = require("sarvamai");
const {SarvamOcrUtil, SARVAM_OCR_MODEL, prepareSarvamImage, sarvamFetch} = require("./sarvam_ocr");
const {LlmUtil} = require("./llm_util");
const {DEFAULT_OCR_SETTINGS, normalizeOcrSettings, getSarvamLanguageCode, SARVAM_OCR_LANGUAGES} = require("./image_ocr_settings");

const image = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
const input = {image, language: "Tamil", model: SARVAM_OCR_MODEL};
const jobId = "ocr_job-123";
const result = (text = "Hello studant\n\nதமிழ் & English") => ({
  type: "digitise", job_id: jobId, status: "completed", usage: {pages_total: 1, pages_succeeded: 1, pages_failed: 0},
  documents: [{filename: "image.png", status: "completed", partial: false, warnings: [],
    pages: [{page_num: 1, status: "completed", blocks: [{block_id: "block-1", text, layout_tag: "text", reading_order: 0}]}]}],
});
function harness({docAi = {}, ...overrides} = {}) {
  const calls = [], prepared = [];
  const invoke = (name, args, value) => {calls.push({name, args}); return docAi[name] ? docAi[name](...args) : Promise.resolve(value);};
  const client = {docAi: {
    digitise: (...args) => invoke("digitise", args, {job_id: jobId, status: "pending"}),
    getStatus: (...args) => invoke("getStatus", args, {job_id: jobId, pipeline: "digitise", status: "completed"}),
    getResults: (...args) => invoke("getResults", args, result()),
  }};
  const util = new SarvamOcrUtil({pollIntervalMs: 1, createClient: () => client,
    prepareImage: async (...args) => {prepared.push(args); return {data: Buffer.from("prepared pixels"), filename: "image.png", contentType: "image/png"};}, ...overrides});
  return {util, calls, prepared};
}
test("Sarvam submits once, maps the selected language, polls, and preserves text without applying LLM instructions", async () => {
  const h = harness();
  const extracted = await h.util.extractTextFromImage({...input, languageHint: "Chinese", instructions: "Translate this", maxTokens: 256, maxImageBytes: 1024});
  assert.deepEqual(extracted, {text: "Hello studant\n\nதமிழ் & English", warnings: [], provider: "sarvam", model: SARVAM_OCR_MODEL});
  assert.deepEqual(h.calls.map(call => call.name), ["digitise", "getStatus", "getResults"]);
  assert.equal(h.prepared[0][1], 1024);
  const [request] = h.calls[0].args;
  assert.equal(request.language, "ta-IN"); assert.equal(request.content_type, "mixed"); assert.equal(request.model, SARVAM_OCR_MODEL);
  assert.equal(request.file[0].contentType, "image/png"); assert.equal(request.instructions, undefined);
  for (const call of h.calls) {
    const options = call.args.at(-1);
    assert.equal(options.maxRetries, 0); assert.ok(options.abortSignal instanceof AbortSignal);
    assert.ok(options.timeoutInSeconds > 0 && options.timeoutInSeconds <= 240);
  }
  assert.equal(h.calls[1].args[0], jobId); assert.deepEqual(h.calls[2].args[1], {format: "json"});
  assert.equal(typeof new LlmUtil().getProviderAdapter("sarvam").extractTextFromImage, "function");
  assert.throws(() => new LlmUtil().generateText({}, {provider: "sarvam"}), /does not support/);
});
test("the actual SDK sends multipart images and the expected job HTTP requests without network access", async () => {
  const sent = [];
  let polls = 0;
  const client = new SarvamAIClient({apiSubscriptionKey: "test-only-key", maxRetries: 0, logging: {silent: true}, fetch: async (url, options) => {
    const req = new Request(url, {...options, duplex: "half"});
    sent.push({url: req.url, method: req.method});
    assert.equal(req.headers.get("api-subscription-key"), "test-only-key");
    let payload;
    if (req.method === "POST") {
      const form = await req.formData();
      assert.equal(form.get("language"), "en-IN"); assert.equal(form.get("content_type"), "mixed");
      assert.equal(form.get("model"), SARVAM_OCR_MODEL);
      const file = form.get("file");
      assert.equal(file.name, "image.png"); assert.equal(file.type, "image/png");
      assert.equal(await file.text(), "prepared pixels");
      payload = {job_id: jobId, status: "pending"};
    } else payload = req.url.endsWith("/status") ? {job_id: jobId, pipeline: "digitise", status: ++polls === 1 ? "running" : "completed"} : result();
    return new Response(JSON.stringify(payload), {status: req.method === "POST" ? 201 : 200, headers: {"Content-Type": "application/json"}});
  }});
  const h = harness({createClient: () => client});
  assert.equal((await h.util.extractTextFromImage({...input, language: "English"})).provider, "sarvam");
  assert.deepEqual(sent, [
    {url: "https://api.sarvam.ai/doc-ai/v1/job/digitise", method: "POST"},
    {url: `https://api.sarvam.ai/doc-ai/v1/job/${jobId}/status`, method: "GET"},
    {url: `https://api.sarvam.ai/doc-ai/v1/job/${jobId}/status`, method: "GET"},
    {url: `https://api.sarvam.ai/doc-ai/v1/job/${jobId}/results?format=json`, method: "GET"},
  ]);
});
test("the SDK's default retry policy is overridden for failed submissions", async () => {
  let submissions = 0;
  const client = new SarvamAIClient({apiSubscriptionKey: "test-only-key", logging: {silent: true}, fetch: async () => {
    submissions++;
    return new Response(JSON.stringify({error: {message: "private error"}}), {status: 429, headers: {"Content-Type": "application/json"}});
  }});
  const h = harness({createClient: () => client});
  await assert.rejects(() => h.util.extractTextFromImage(input), {code: "ocr-unavailable", status: 429});
  assert.equal(submissions, 1);
});
test("all supported languages map explicitly and unsupported routes fail before submission", async () => {
  for (const [name, code] of Object.entries(SARVAM_OCR_LANGUAGES)) {
    assert.equal(getSarvamLanguageCode(name), code); assert.equal(getSarvamLanguageCode(code), code);
  }
  for (const language of [" Tamil ", "ta", "TA-in", "தமிழ்"]) assert.equal(getSarvamLanguageCode(language), "ta-IN");
  assert.equal(getSarvamLanguageCode("Malayalam"), "ml-IN");
  const h = harness();
  for (const language of ["Malay", "Chinese", "Mandarin", "English and Tamil", "constructor"]) {
    assert.equal(getSarvamLanguageCode(language), null);
    assert.throws(() => normalizeOcrSettings({...DEFAULT_OCR_SETTINGS, languageProviders: {[language]: "sarvam"}}), {code: "invalid-argument"});
    await assert.rejects(() => h.util.extractTextFromImage({...input, language}), {code: "invalid-argument"});
  }
  for (const change of [{model: "other"}, {maxImageBytes: 0}, {maxImageBytes: 9 * 1024 * 1024}, {image: {...image, mimeType: "image/jpeg"}}]) {
    await assert.rejects(() => h.util.extractTextFromImage({...input, ...change}), {code: "invalid-argument"});
  }
  for (const timeoutMs of [0, -1, NaN, 240001]) await assert.rejects(() => h.util.extractTextFromImage(input, {timeoutMs}), {code: "invalid-argument"});
  assert.deepEqual(h.calls, []); assert.deepEqual(h.prepared, []);
});
test("PNG, JPEG, and WebP decode to bounded opaque PNGs with EXIF orientation applied", async () => {
  for (const format of ["png", "jpeg", "webp"]) {
    const bytes = await sharp({create: {width: 4, height: 3, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})[format]().toBuffer();
    const source = {mimeType: `image/${format}`, base64: bytes.toString("base64")};
    const prepared = await prepareSarvamImage(source, 1024 * 1024);
    const metadata = await sharp(prepared.data).metadata();
    assert.equal(metadata.format, "png"); assert.equal(metadata.width, 4); assert.equal(metadata.height, 3); assert.equal(metadata.hasAlpha, false);
    if (format !== "jpeg") assert.deepEqual([...await sharp(prepared.data).raw().toBuffer()].slice(0, 3), [255, 255, 255]);
    await assert.rejects(() => prepareSarvamImage(source, 1), {code: "invalid-argument"});
  }
  const jpeg = await sharp({create: {width: 2, height: 3, channels: 3, background: "white"}}).jpeg().withMetadata({orientation: 6}).toBuffer();
  const prepared = await prepareSarvamImage({mimeType: "image/jpeg", base64: jpeg.toString("base64")}, 1024 * 1024);
  const rotated = await sharp(prepared.data).metadata();
  assert.equal(rotated.width, 3); assert.equal(rotated.height, 2);
  const oversized = Buffer.from(image.base64, "base64"); oversized.writeUInt32BE(8192, 16); oversized.writeUInt32BE(8192, 20);
  const h = harness({prepareImage: prepareSarvamImage});
  await assert.rejects(() => h.util.extractTextFromImage({...input, image: {...image, base64: oversized.toString("base64")}}), {code: "invalid-argument"});
  await assert.rejects(() => prepareSarvamImage({base64: "not an image"}, 1024), {code: "invalid-argument"});
  assert.deepEqual(h.calls, []);
});
test("JSON blocks follow reading order, preserve literal text, and convert HTML tables without executing markup", async () => {
  const payload = result();
  payload.documents[0].pages[0].blocks = [
    {text: '<table><tr><th>Name</th><th>Value</th></tr><tr><td>One &amp; two</td><td>1</td></tr></table><script>private script</script><style>private style</style><img src="https://example.com/pixel">', layout_tag: "table", reading_order: 2},
    {text: "Hello studant & தமிழ்", layout_tag: "text", reading_order: 0},
    {text: "A<B\n<b>literal writing</b>", layout_tag: "text", reading_order: 1},
  ];
  const h = harness({docAi: {getResults: async () => payload}});
  const extracted = await h.util.extractTextFromImage(input);
  assert.equal(extracted.text, "Hello studant & தமிழ்\n\nA<B\n<b>literal writing</b>\n\nName\tValue\nOne & two\t1");
  assert.equal(extracted.text.includes("private"), false); assert.equal(extracted.text.includes("https://"), false);
  const empty = result(); empty.documents[0].pages[0].blocks = [];
  const blank = harness({docAi: {getResults: async () => empty}});
  assert.match((await blank.util.extractTextFromImage(input)).warnings[0], /No legible text/);
});
test("partial completion is visible and failed or rejected jobs never fetch results", async () => {
  const partial = harness({docAi: {getStatus: async () => ({job_id: jobId, pipeline: "digitise", status: "partially_completed"})}});
  assert.match((await partial.util.extractTextFromImage(input)).warnings[0], /incomplete/);
  for (const status of ["failed", "rejected"]) {
    const h = harness({docAi: {getStatus: async () => ({job_id: jobId, pipeline: "digitise", status, error: "private body"})}});
    await assert.rejects(() => h.util.extractTextFromImage(input), error => error.code === "ocr-unavailable" && error.providerJobId === jobId && !error.message.includes("private"));
    assert.deepEqual(h.calls.map(call => call.name), ["digitise", "getStatus"]);
  }
});
test("invalid job/status/result shapes fail without another submission", async () => {
  const invalidResponses = [
    {digitise: async () => ({job_id: "https://private", status: "pending"})},
    {digitise: async () => ({job_id: jobId, status: "unknown"})},
    {getStatus: async () => ({job_id: "wrong", pipeline: "digitise", status: "completed"})},
    {getStatus: async () => ({job_id: jobId, pipeline: "extract", status: "completed"})},
    {getStatus: async () => ({job_id: jobId, pipeline: "digitise", status: "unknown"})},
    ...[{...result(), type: "extract"}, {...result(), job_id: "wrong"}, {...result(), status: "running"},
      {...result(), documents: []}, {...result(), documents: [{pages: []}]},
      {...result(), documents: [{pages: [{content: "legacy HTML wrapper"}]}]},
      {...result(), documents: [{pages: [{blocks: [{text: 42}]}]}]},
      {...result(), documents: [{pages: [{blocks: [{text: "text", reading_order: "first"}]}]}]},
      result("x".repeat(4 * 1024 * 1024 + 1))]
      .map(payload => ({getResults: async () => payload})),
  ];
  for (const docAi of invalidResponses) {
    const h = harness({docAi});
    await assert.rejects(() => h.util.extractTextFromImage(input), {code: "ocr-invalid-response"});
    assert.equal(h.calls.filter(call => call.name === "digitise").length, 1);
  }
});
test("upstream errors hide raw bodies, preserve rate limiting, and never retry submission", async () => {
  for (const statusCode of [400, 401, 402, 403, 413, 429, 500, 503]) {
    const h = harness({docAi: {digitise: async () => {throw Object.assign(new Error("private-key private-text"), {statusCode, body: "private body"});}}});
    await assert.rejects(() => h.util.extractTextFromImage(input), error => {
      assert.equal(error.code, "ocr-unavailable"); assert.equal(error.status, statusCode === 429 ? 429 : 503);
      assert.equal(error.message.includes("private"), false); assert.equal(error.body, undefined); return true;
    });
    assert.equal(h.calls.length, 1);
  }
});
test("one deadline bounds conversion, client creation, submission, status polling, and result retrieval", async () => {
  const never = () => new Promise(() => {});
  for (const phase of ["image", "client", "digitise", "getStatus", "getResults", "poll"]) {
    const h = harness({...(phase === "image" ? {prepareImage: never} : phase === "client" ? {createClient: never}
      : phase === "poll" ? {pollIntervalMs: 1000} : {docAi: {[phase]: never}})});
    await assert.rejects(() => h.util.extractTextFromImage(input, {timeoutMs: 15}), {code: "ocr-timeout", status: 504});
    const count = h.calls.length;
    await new Promise(setImmediate);
    assert.equal(h.calls.length, count);
    assert.ok(h.calls.filter(call => call.name === "digitise").length <= 1);
    for (const call of h.calls) assert.equal(call.args.at(-1).abortSignal.aborted, true);
  }
});
test("caller cancellation stops in-flight SDK calls and later polling", async () => {
  const before = new AbortController(); before.abort();
  const h = harness();
  await assert.rejects(() => h.util.extractTextFromImage(input, {signal: before.signal}), {name: "AbortError"});
  assert.deepEqual(h.prepared, []);
  let started;
  const ready = new Promise(resolve => {started = resolve;});
  const running = harness({docAi: {getStatus: () => {started(); return new Promise(() => {});}}});
  const controller = new AbortController();
  const pending = running.util.extractTextFromImage(input, {signal: controller.signal});
  await ready; controller.abort();
  await assert.rejects(() => pending, {name: "AbortError"});
  assert.deepEqual(running.calls.map(call => call.name), ["digitise", "getStatus"]);
  assert.equal(running.calls[1].args.at(-1).abortSignal.aborted, true);
});
test("late image conversion cannot submit an OCR job after the deadline", async () => {
  let resume;
  const h = harness({prepareImage: () => new Promise(resolve => {resume = resolve;})});
  await assert.rejects(() => h.util.extractTextFromImage(input, {timeoutMs: 10}), {code: "ocr-timeout"});
  resume({data: Buffer.from("pixels"), filename: "image.png", contentType: "image/png"});
  await new Promise(setImmediate);
  assert.deepEqual(h.calls, []);
});
test("production fetch disables redirects and bounds response bodies", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(options.redirect, "error");
      return new Response("response", {status: 200, headers: {"Content-Type": "text/plain"}});
    };
    assert.equal(await (await sarvamFetch("https://api.sarvam.ai/test", {})).text(), "response");
    global.fetch = async () => new Response("x".repeat(4 * 1024 * 1024 + 1));
    await assert.rejects(() => sarvamFetch("https://api.sarvam.ai/test", {}), {code: "ocr-invalid-response"});
  } finally {global.fetch = original;}
});
