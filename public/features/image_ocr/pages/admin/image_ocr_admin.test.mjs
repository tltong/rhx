import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {mountImageOcrAdmin} from "./image_ocr_admin.js";
import {DEFAULT_OCR_SETTINGS as defaults} from "../../image_ocr_module.js";
class Element {
  constructor() {this.value = ""; this.disabled = false; this.hidden = false; this.textContent = ""; this.listeners = new Map(); this.children = []; this.classList = {toggle() {}};}
  addEventListener(type, fn) {this.listeners.set(type, fn);}
  removeEventListener(type) {this.listeners.delete(type);}
  setAttribute(key, value) {this[key] = value;}
  removeAttribute(key) {delete this[key];}
  replaceChildren() {this.children = [];}
  append(element) {this.children.push(element);}
  click() {if (!this.disabled) return this.listeners.get("click")?.();}
  submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
  edit(value) {this.value = value; this.listeners.get("input")?.();}
  change(value) {this.value = value; this.listeners.get("change")?.();}
}
const ids = ["ocr-config-form", "ocr-save", "ocr-retry-load", "ocr-extract", "ocr-provider", "ocr-model", "ocr-detail", "ocr-language", "ocr-test-language", "ocr-pen-width", "ocr-instructions", "ocr-additional", "ocr-max-tokens", "ocr-max-size", "ocr-timeout", "ocr-result", "ocr-result-text", "ocr-warnings", "ocr-sent-image", "ocr-download", "ocr-canvas", "ocr-undo", "ocr-clear", "ocr-ink-status", "ocr-test-status", "ocr-test-panel", "ocr-updated-at", "ocr-draft-status", "ocr-config-status", "ocr-result-model", "ocr-language-providers", "ocr-no-languages", "ocr-test-provider"];
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
function harness(options = {}) {
  const elements = new Map(ids.map(id => [id, new Element()])), get = id => elements.get(id);
  get("ocr-pen-width").value = "3";
  const calls = [], saves = [], revocations = [], penWidths = [], canvasImage = new Blob(["canvas image"], {type: "image/png"});
  let ink = false, onChange, enabled = false, disposed = false, exports = 0;
  const page = mountImageOcrAdmin({root: {getElementById: get, createElement: () => new Element()},
    getConfig: options.getConfig || (async () => null), listLanguages: options.listLanguages || (async () => ["Chinese", "English", "Malay"]), saveConfig: async input => {saves.push(input); return options.saveConfig ? options.saveConfig(input) : {...input, updatedBy: "admin", updatedAt: "2026-10-21T10:00:00Z"};},
    testOcr: async (input, config) => {calls.push({input, options: config}); return options.testOcr ? options.testOcr(input) : {text: "Hello 学生", warnings: [], model: "deepseek-flash", provider: "deepseek"};},
    mountCanvas: configuration => {onChange = configuration.onChange; return {hasInk: () => ink, isDrawing: () => false, setEnabled: value => {enabled = value;}, setPenWidth: value => penWidths.push(value),
      toBlob: async () => {exports++; return options.exportImage ? options.exportImage() : canvasImage;}, dispose: () => {disposed = true; ink = false;}};},
    createUrl: () => "blob:canvas", revokeUrl: url => revocations.push(url)});
  return {page, get, calls, saves, revocations, penWidths, canvasImage, provider(language) {return get("ocr-language-providers").children.find(row => row.children[0].textContent === language).children[1];}, draw() {assert.equal(enabled, true); if (!get("ocr-test-language").value) get("ocr-test-language").change("English"); ink = true; onChange(true);}, clear() {ink = false; onChange(false);}, exports: () => exports, disposed: () => disposed};
}
test("defaults and failed loads cannot save or test until configuration has loaded", async () => {
  const h = harness(); assert.equal(h.get("ocr-save").disabled, true); await h.page.ready;
  assert.equal(h.get("ocr-save").disabled, false); assert.equal(h.get("ocr-extract").disabled, true); assert.equal(h.get("ocr-instructions").value, defaults.ocrInstructions);
  await h.get("ocr-extract").click(); assert.equal(h.exports(), 0); assert.deepEqual(h.saves, []);
  let fail = true; const failed = harness({getConfig: async () => {if (fail) throw new Error("Read failed"); return null;}}); await failed.page.ready;
  assert.equal(failed.get("ocr-save").disabled, true); assert.equal(failed.get("ocr-retry-load").hidden, false);
  fail = false; await failed.get("ocr-retry-load").click(); assert.equal(failed.get("ocr-save").disabled, false);
});
test("canvas tests send a PNG Blob with unsaved configuration, prevent duplicates, and display results", async () => {
  const pending = deferred(), h = harness({testOcr: () => pending.promise}); await h.page.ready; h.draw();
  h.get("ocr-language").edit("English and Chinese"); h.get("ocr-additional").edit("Keep headings");
  const operation = h.get("ocr-extract").click(); await new Promise(setImmediate);
  await h.get("ocr-extract").click(); assert.equal(h.calls.length, 1); assert.equal(h.get("ocr-extract").disabled, true);
  assert.equal(h.calls[0].input.image, h.canvasImage); assert.deepEqual(h.calls[0].input.configuration, {...defaults, languageHint: "English and Chinese", additionalInstructions: "Keep headings"}); assert.deepEqual(h.saves, []);
  pending.resolve({text: "Hello 学生", warnings: ["One unclear mark"], model: "deepseek-flash", provider: "deepseek"}); await operation;
  assert.equal(h.get("ocr-result").hidden, false); assert.equal(h.get("ocr-result-text").value, "Hello 学生"); assert.equal(h.get("ocr-warnings").children[0].textContent, "One unclear mark");
  assert.equal(h.get("ocr-download").href, "blob:canvas"); assert.equal(h.get("ocr-extract").disabled, false);
  h.clear(); assert.equal(h.get("ocr-result").hidden, true); assert.equal(h.get("ocr-extract").disabled, true); assert.deepEqual(h.revocations, ["blob:canvas"]);
});
test("invalid configuration and canvas export errors never call the OCR API", async () => {
  const h = harness(); await h.page.ready; h.draw(); h.get("ocr-max-size").edit("99");
  await h.get("ocr-extract").click(); await h.get("ocr-config-form").submit(); assert.equal(h.exports(), 0); assert.deepEqual(h.calls, []); assert.deepEqual(h.saves, []);
  const failed = harness({exportImage: async () => {throw new Error("PNG export failed");}}); await failed.page.ready; failed.draw(); await failed.get("ocr-extract").click();
  assert.deepEqual(failed.calls, []); assert.match(failed.get("ocr-test-status").textContent, /PNG export failed/); assert.equal(failed.get("ocr-extract").disabled, false);
  const longHint = harness(); await longHint.page.ready; longHint.draw(); longHint.get("ocr-test-language").edit("a".repeat(201));
  await longHint.get("ocr-extract").click(); assert.equal(longHint.exports(), 0); assert.deepEqual(longHint.calls, []); assert.match(longHint.get("ocr-test-status").textContent, /Language/);
});
test("language selection previews draft routing without changing recognition hints or saving", async () => {
  const h = harness({getConfig: async () => ({...defaults, languageHint: "English"})}); await h.page.ready; h.draw();
  h.provider("Chinese").change("paddleocr"); h.get("ocr-test-language").change("Chinese");
  assert.match(h.get("ocr-test-provider").textContent, /PaddleOCR/);
  await h.get("ocr-extract").click();
  assert.equal(h.calls[0].input.language, "Chinese");
  assert.equal(h.calls[0].input.configuration.languageHint, "English");
  assert.deepEqual(h.calls[0].input.configuration.languageProviders, {chinese: "paddleocr"});
  assert.deepEqual(h.saves, []);
  h.provider("Chinese").change("");
  assert.match(h.get("ocr-test-provider").textContent, /OpenAI/);
  await h.get("ocr-config-form").submit();
  assert.deepEqual(h.saves[0].languageProviders, {}); assert.equal(h.get("ocr-test-language").value, "Chinese");
});
test("the OpenAI fallback model is configurable and legacy global DeepSeek settings migrate on read", async () => {
  const h = harness(); await h.page.ready;
  assert.equal(h.get("ocr-provider").value, "openai"); assert.equal(h.get("ocr-provider").disabled, true);
  assert.deepEqual(h.get("ocr-model").children.map(option => option.value), ["gpt-6.1-sol", "gpt-6-astra"]);
  h.get("ocr-model").edit("gpt-6-astra"); h.draw();
  assert.match(h.get("ocr-test-provider").textContent, /GPT-6 Astra/);
  await h.get("ocr-extract").click();
  assert.equal(h.calls[0].input.configuration.model, "gpt-6-astra");
  await h.get("ocr-config-form").submit(); assert.equal(h.saves[0].model, "gpt-6-astra");
  const legacy = harness({getConfig: async () => ({...defaults, provider: "deepseek", model: "deepseek-flash"})}); await legacy.page.ready;
  assert.equal(legacy.get("ocr-provider").value, "openai"); assert.equal(legacy.get("ocr-model").value, "gpt-6.1-sol");
});
test("syllabus languages are deduplicated and language-load failures cannot overwrite settings", async () => {
  const h = harness({listLanguages: async () => ["English", " english ", "Chinese", "Tamil"],
    getConfig: async () => ({...defaults, languageProviders: {chinese: "paddleocr", removed: "deepseek"}})});
  await h.page.ready;
  assert.equal(h.get("ocr-language-providers").children.length, 3);
  assert.equal(h.provider("Chinese").value, "paddleocr");
  assert.equal(h.provider("Tamil").value, "");
  await h.get("ocr-config-form").submit();
  assert.deepEqual(h.saves[0].languageProviders, {chinese: "paddleocr", removed: "deepseek"});
  const failed = harness({listLanguages: async () => {throw new Error("Languages unavailable");}}); await failed.page.ready;
  assert.equal(failed.get("ocr-save").disabled, true); assert.equal(failed.get("ocr-retry-load").hidden, false);
  assert.deepEqual(failed.saves, []);
});
test("pen choices affect drawing only and are disabled while loading, testing, and after disposal", async () => {
  const pending = deferred(), h = harness({testOcr: () => pending.promise});
  assert.equal(h.get("ocr-pen-width").disabled, true); await h.page.ready;
  assert.equal(h.get("ocr-pen-width").disabled, false);
  h.get("ocr-pen-width").change("5"); assert.deepEqual(h.penWidths, [5]);
  assert.equal(h.get("ocr-draft-status").textContent, "Current default settings");
  h.draw(); const operation = h.get("ocr-extract").click(); await new Promise(setImmediate);
  assert.equal(h.get("ocr-pen-width").disabled, true); assert.deepEqual(h.calls[0].input.configuration, defaults);
  h.get("ocr-pen-width").change("2"); assert.deepEqual(h.penWidths, [5]);
  pending.resolve({text: "hello", warnings: [], model: "deepseek-flash", provider: "deepseek"}); await operation;
  assert.equal(h.get("ocr-pen-width").disabled, false); assert.deepEqual(h.saves, []);
  h.page.dispose(); assert.equal(h.get("ocr-pen-width").disabled, true); assert.equal(h.get("ocr-pen-width").listeners.size, 0);
});
test("failed OCR preserves handwriting and drafts and allows a deliberate retry with request ID", async () => {
  let fail = true; const h = harness({testOcr: async () => {if (fail) throw Object.assign(new Error("Unavailable"), {requestId: "req-1"}); return {text: "学生", warnings: [], model: "deepseek-flash", provider: "deepseek"};}}); await h.page.ready; h.draw();
  h.get("ocr-language").edit("Chinese"); await h.get("ocr-extract").click(); assert.match(h.get("ocr-test-status").textContent, /req-1/);
  assert.equal(h.calls.length, 1); assert.equal(h.get("ocr-language").value, "Chinese"); assert.equal(h.get("ocr-extract").disabled, false);
  fail = false; await h.get("ocr-extract").click(); assert.equal(h.calls.length, 2); assert.equal(h.get("ocr-result-text").value, "学生");
});
test("saving all settings retains drafts on failure and displays trusted metadata on success", async () => {
  let fail = true; const h = harness({saveConfig: async input => {if (fail) throw new Error("Write failed"); return {...input, updatedBy: "admin", updatedAt: "2026-10-21T10:00:00Z"};}}); await h.page.ready;
  h.get("ocr-instructions").edit("My OCR instructions"); h.get("ocr-timeout").edit("60"); await h.get("ocr-config-form").submit();
  assert.equal(h.get("ocr-instructions").value, "My OCR instructions"); assert.match(h.get("ocr-config-status").textContent, /Write failed/);
  fail = false; await h.get("ocr-config-form").submit(); assert.equal(h.saves[1].timeoutSeconds, 60); assert.match(h.get("ocr-updated-at").textContent, /admin/);
});
test("disposal aborts pending extraction, clears handwriting/results, and ignores late responses", async () => {
  const pending = deferred(), h = harness({testOcr: () => pending.promise}); await h.page.ready; h.draw();
  const operation = h.get("ocr-extract").click(); await new Promise(setImmediate); h.page.dispose();
  assert.equal(h.calls[0].options.signal.aborted, true); assert.equal(h.disposed(), true);
  pending.resolve({text: "Late private text", warnings: [], model: "deepseek-flash", provider: "deepseek"}); await operation;
  assert.equal(h.get("ocr-result").hidden, true); assert.equal(h.get("ocr-result-text").value, ""); assert.equal(h.get("ocr-extract").disabled, true);
  assert.equal(h.get("ocr-config-form").listeners.size, 0);
});
test("protected page supplies a handwriting canvas, labels, PNG download, and Site Admin navigation", async () => {
  const html = await readFile(new URL("./image_ocr_admin.html", import.meta.url), "utf8");
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /data-site-admin-page/); assert.match(html, /<canvas[^>]*width="1200"[^>]*height="1600"/); assert.match(html, /usage charges/); assert.match(html, /download="readyherox-ocr-handwriting.png"/);
  const navigation = await readFile(new URL("../../../site_admin/pages/site_admin/site_admin.html", import.meta.url), "utf8"); assert.match(navigation, /image_ocr_admin.html/);
});
