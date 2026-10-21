import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {mountImageGenerationAdmin} from "./image_generation_admin.js";
import {DEFAULT_IMAGE_SETTINGS as defaults} from "../../image_generation_module.js";

class Element {
  constructor() {this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.textContent = ""; this.listeners = new Map(); this.classes = new Set(); this.classList = {toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key)};}
  setAttribute(key, value) {this[key] = value;}
  removeAttribute(key) {delete this[key];}
  addEventListener(key, fn) {this.listeners.set(key, fn);}
  removeEventListener(key, fn) {if (this.listeners.get(key) === fn) this.listeners.delete(key);}
  click() {if (!this.disabled) return this.listeners.get("click")?.();}
  submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
  edit(value) {this.value = value; this.listeners.get("input")?.();}
}
const ids = ["image-config-form", "image-model", "image-quality", "image-size", "image-custom-size", "image-transparent", "image-save", "image-retry-load", "image-prompt", "image-generate", "image-config-status", "image-custom-dimensions", "image-test-panel", "image-updated-at", "image-draft-status", "image-result", "image-preview", "image-download", "image-test-status", "image-result-settings"];
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
function harness(options = {}) {
  const elements = new Map(ids.map(id => [id, new Element()])); const get = id => elements.get(id);
  const saves = [], generations = [], revocations = [];
  const page = mountImageGenerationAdmin({root: {getElementById: get}, getConfig: options.getConfig || (async () => null),
    saveConfig: async input => {saves.push(input); return options.saveConfig ? options.saveConfig(input) : {...input, updatedBy: "admin", updatedAt: "2026-10-21T12:00:00Z"};},
    generate: async (input, generationOptions) => {generations.push({input, options: generationOptions}); return options.generate ? options.generate(input) : {settings: input, images: [{mimeType: "image/png", base64: "aW1hZ2U="}]};},
    createUrl: () => "blob:test", revokeUrl: url => revocations.push(url)});
  return {page, get, saves, generations, revocations};
}
test("loading defaults is read-only and failed loads require retry before saving or generation", async () => {
  const h = harness(); assert.equal(h.get("image-save").disabled, true); await h.page.ready;
  assert.equal(h.get("image-model").value, defaults.model); assert.equal(h.get("image-transparent").checked, false); assert.deepEqual(h.saves, []);
  let fail = true;
  const failed = harness({getConfig: async () => {if (fail) throw new Error("Read failed"); return null;}}); await failed.page.ready;
  assert.equal(failed.get("image-save").disabled, true); assert.equal(failed.get("image-generate").disabled, true); assert.equal(failed.get("image-retry-load").hidden, false);
  fail = false; await failed.get("image-retry-load").click(); assert.equal(failed.get("image-save").disabled, false);
});
test("saving custom model settings persists form values and preserves drafts on failure", async () => {
  let fail = true;
  const h = harness({saveConfig: async input => {if (fail) throw new Error("Save failed"); return {...input, updatedAt: "2026-10-21T12:00:00Z", updatedBy: "admin"};}}); await h.page.ready;
  h.get("image-model").edit("gpt-image-2.5-sunburst"); h.get("image-size").edit("custom"); h.get("image-custom-size").edit("1280x1024"); h.get("image-transparent").checked = true;
  await h.get("image-config-form").submit(); assert.equal(h.get("image-custom-size").value, "1280x1024"); assert.match(h.get("image-config-status").textContent, /Save failed/);
  fail = false; await h.get("image-config-form").submit();
  assert.deepEqual(h.saves[1], {...defaults, model: "gpt-image-2.5-sunburst", size: "1280x1024", transparentBackground: true});
  assert.match(h.get("image-updated-at").textContent, /admin/);
});
test("test generation uses unsaved settings once, previews PNG, and does not save config", async () => {
  const pending = deferred(); const h = harness({generate: () => pending.promise}); await h.page.ready;
  h.get("image-quality").edit("high"); h.get("image-prompt").value = " cartoon student ";
  const operation = h.get("image-generate").click(); await h.get("image-generate").click();
  assert.equal(h.generations.length, 1); assert.equal(h.get("image-generate").disabled, true); assert.match(h.get("image-generate").textContent, /Generating/);
  assert.deepEqual(h.generations[0].input, {...defaults, prompt: "cartoon student", quality: "high"}); assert.deepEqual(h.saves, []);
  pending.resolve({settings: {...defaults, quality: "high"}, images: [{mimeType: "image/png", base64: "aW1hZ2U="}]}); await operation;
  assert.equal(h.get("image-result").hidden, false); assert.equal(h.get("image-download").href, "blob:test"); assert.equal(h.get("image-preview").src, "blob:test");
  assert.match(h.get("image-result-settings").textContent, /high quality/); assert.equal(h.get("image-generate").disabled, false);
  h.page.dispose(); assert.deepEqual(h.revocations, ["blob:test"]);
});
test("invalid sizes and empty prompts never invoke generation", async () => {
  const h = harness(); await h.page.ready; await h.get("image-generate").click(); assert.deepEqual(h.generations, []);
  h.get("image-prompt").value = "test"; h.get("image-size").edit("custom"); h.get("image-custom-size").edit("512x512");
  await h.get("image-generate").click(); await h.get("image-config-form").submit();
  assert.deepEqual(h.generations, []); assert.deepEqual(h.saves, []); assert.match(h.get("image-test-status").textContent, /multiples of 16/);
});
test("generation errors retain prompts and drafts and support deliberate retry with request IDs", async () => {
  let fail = true; const h = harness({generate: async input => {if (fail) throw Object.assign(new Error("Provider unavailable"), {requestId: "req-123"}); return {settings: input, images: [{mimeType: "image/png", base64: "aW1hZ2U="}]};}}); await h.page.ready;
  h.get("image-prompt").value = "Keep prompt"; h.get("image-quality").edit("low"); await h.get("image-generate").click();
  assert.match(h.get("image-test-status").textContent, /req-123/); assert.equal(h.generations.length, 1); assert.equal(h.get("image-prompt").value, "Keep prompt");
  fail = false; await h.get("image-generate").click(); assert.equal(h.generations.length, 2); assert.equal(h.get("image-result").hidden, false);
});
test("disposal aborts generation, ignores late images, and disables controls", async () => {
  const pending = deferred(); const h = harness({generate: () => pending.promise}); await h.page.ready;
  h.get("image-prompt").value = "test"; const operation = h.get("image-generate").click(); h.page.dispose();
  assert.equal(h.generations[0].options.signal.aborted, true);
  pending.resolve({settings: defaults, images: [{mimeType: "image/png", base64: "aW1hZ2U="}]}); await operation;
  assert.equal(h.get("image-result").hidden, true); assert.equal(h.get("image-generate").disabled, true); assert.equal(h.get("image-prompt").value, "");
});
test("admin HTML supplies guarded page entry, labels, native sizes, and navigation", async () => {
  const html = await readFile(new URL("./image_generation_admin.html", import.meta.url), "utf8");
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /data-site-admin-page/); assert.match(html, /paid API request/);
  for (const id of ["image-model", "image-size", "image-quality", "image-custom-size", "image-prompt"]) assert.ok(html.includes(`for="${id}"`));
  const navigation = await readFile(new URL("../../../site_admin/pages/site_admin/site_admin.html", import.meta.url), "utf8");
  assert.match(navigation, /AI Configuration/); assert.match(navigation, /image_generation_admin.html/);
});
