import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {mountEssayScoringAdmin} from "./essay_scoring_admin.js";
import {EssayScoringConfig, createDefaultConfiguration} from "../../domain/essay_scoring_config.js";
import {buildEssayScoringInstructions} from "../../application/build_essay_scoring_prompt.js";

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.classes = new Set();
    this.classList = {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};
    this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false;
  }
  append(...children) {this.children.push(...children);}
  setAttribute(name, value) {this.attributes.set(name, value);}
  addEventListener(event, handler) {this.listeners.set(event, handler);}
  removeEventListener(event, handler) {if (this.listeners.get(event) === handler) this.listeners.delete(event);}
  async click() {if (!this.disabled) return this.listeners.get("click")?.();}
  async submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
  async edit(value) {assert.equal(this.disabled, false); this.value = value; return this.listeners.get("input")?.();}
  async change(value) {assert.equal(this.disabled, false); this.value = value; return this.listeners.get("change")?.();}
}
const flatten = element => [element, ...element.children.flatMap(flatten)];
const ids = ["scoring-config-form", "scoring-base-instructions", "scoring-additional-instructions", "scoring-status",
  "scoring-updated-at", "scoring-save-config", "scoring-retry-load", "scoring-primary-instructions", "scoring-secondary-instructions",
  "scoring-preview", "scoring-preview-status", "scoring-preview-level", "scoring-preview-grade"];
const saved = input => new EssayScoringConfig({...input, updatedAt: new Date("2026-10-20T04:00:00Z"), updatedBy: "admin-1"});
function deferred() {let resolve, reject; const promise = new Promise((yes,no) => {resolve = yes; reject = no;}); return {promise,resolve,reject};}
function harness(options = {}) {
  const elements = new Map(ids.map(id => [id, new Element()]));
  elements.get("scoring-preview-level").value = "primary"; elements.get("scoring-preview-grade").value = "1";
  const get = id => elements.get(id) || [...elements.values()].flatMap(flatten).find(element => element.id === id);
  const root = {getElementById: get, createElement: tag => new Element(tag)};
  const saves = [];
  const page = mountEssayScoringAdmin({root, getConfig: options.getConfig || (async () => null),
    saveConfig: async input => {saves.push(structuredClone(input)); return options.saveConfig ? options.saveConfig(input) : saved(input);}});
  return {page, get, saves, inputs: () => [get("scoring-base-instructions"), get("scoring-additional-instructions"),
    ...[get("scoring-primary-instructions"), get("scoring-secondary-instructions")].flatMap(flatten).filter(element => element.tagName === "textarea")]};
}

test("loading without saved config shows the current rubric and twelve blank grade fields without saving", async () => {
  const h = harness(); assert.equal(h.get("scoring-save-config").disabled, true);
  await h.page.ready;
  assert.equal(h.inputs().length, 14); assert.ok(h.inputs().every(input => !input.disabled));
  assert.equal(h.get("scoring-base-instructions").value, createDefaultConfiguration().markingInstructions);
  for (const level of ["primary", "secondary"]) for (let grade = 1; grade <= 6; grade++) assert.equal(h.get("scoring-" + level + "-grade-" + grade).value, "");
  assert.match(h.get("scoring-preview").value, /Return only valid JSON/);
  assert.match(h.get("scoring-updated-at").textContent, /Not yet saved/); assert.deepEqual(h.saves, []);
});

test("saved config populates base, global and separate grade instructions with update metadata", async () => {
  const config = createDefaultConfiguration(); config.markingInstructions = "Saved rubric"; config.additionalLlmInstructions = "Saved global";
  config.gradeInstructions.primary[3] = "Primary 3"; config.gradeInstructions.secondary[3] = "Secondary 3";
  const h = harness({getConfig: async () => saved(config)}); await h.page.ready;
  assert.equal(h.get("scoring-base-instructions").value, "Saved rubric");
  assert.equal(h.get("scoring-additional-instructions").value, "Saved global");
  assert.equal(h.get("scoring-primary-grade-3").value, "Primary 3");
  assert.equal(h.get("scoring-secondary-grade-3").value, "Secondary 3");
  assert.match(h.get("scoring-updated-at").textContent, /Last saved:.*admin-1/);
});

test("preview follows unsaved edits and selected level/grade using the runtime instruction builder", async () => {
  const h = harness(); await h.page.ready;
  await h.get("scoring-base-instructions").edit("Draft rubric"); await h.get("scoring-additional-instructions").edit("Common guidance");
  await h.get("scoring-primary-grade-3").edit("PRIMARY_THREE"); await h.get("scoring-secondary-grade-3").edit("SECONDARY_THREE");
  await h.get("scoring-preview-grade").change("3");
  assert.match(h.get("scoring-preview").value, /PRIMARY_THREE/); assert.doesNotMatch(h.get("scoring-preview").value, /SECONDARY_THREE/);
  await h.get("scoring-preview-level").change("secondary");
  const config = createDefaultConfiguration(); config.markingInstructions = "Draft rubric"; config.additionalLlmInstructions = "Common guidance";
  config.gradeInstructions.primary[3] = "PRIMARY_THREE"; config.gradeInstructions.secondary[3] = "SECONDARY_THREE";
  assert.equal(h.get("scoring-preview").value, buildEssayScoringInstructions({level: "secondary", grade: 3}, config));
  assert.match(h.get("scoring-preview-status").textContent, /unsaved/); assert.deepEqual(h.saves, []);
});

test("saving captures all editable instructions and supports clearing optional guidance", async () => {
  const h = harness(); await h.page.ready;
  await h.get("scoring-base-instructions").edit(" New rubric "); await h.get("scoring-additional-instructions").edit(" Global ");
  for (const level of ["primary", "secondary"]) for (let grade = 1; grade <= 6; grade++) await h.get("scoring-" + level + "-grade-" + grade).edit(level + " " + grade);
  await h.get("scoring-config-form").submit();
  assert.equal(h.saves[0].markingInstructions, "New rubric"); assert.equal(h.saves[0].additionalLlmInstructions, "Global");
  assert.equal(h.saves[0].gradeInstructions.primary[6], "primary 6"); assert.equal(h.saves[0].gradeInstructions.secondary[6], "secondary 6");
  assert.match(h.get("scoring-status").textContent, /Settings saved/);
  assert.match(h.get("scoring-preview-status").textContent, /matches the loaded/);
  await h.get("scoring-additional-instructions").edit(" "); await h.get("scoring-primary-grade-1").edit(" ");
  await h.get("scoring-config-form").submit();
  assert.equal(h.saves[1].additionalLlmInstructions, ""); assert.equal(h.saves[1].gradeInstructions.primary[1], "");
});

test("blank base instructions cannot be saved and the preview explains the problem", async () => {
  const h = harness(); await h.page.ready;
  await h.get("scoring-base-instructions").edit("  "); await h.get("scoring-config-form").submit();
  assert.deepEqual(h.saves, []); assert.match(h.get("scoring-status").textContent, /must not be blank/);
  assert.equal(h.get("scoring-preview").value, ""); assert.match(h.get("scoring-preview-status").textContent, /must not be blank/);
});

test("load failures and corrupt config prevent saving defaults until loading succeeds", async () => {
  let failing = true;
  const h = harness({getConfig: async () => {if(failing) throw new Error("Read unavailable"); return null;}});
  await h.page.ready; await h.get("scoring-config-form").submit();
  assert.equal(h.get("scoring-save-config").disabled, true); assert.equal(h.get("scoring-retry-load").hidden, false); assert.deepEqual(h.saves, []);
  failing = false; await h.get("scoring-retry-load").click(); assert.equal(h.get("scoring-save-config").disabled, false);
  const bad = harness({getConfig: async () => ({markingInstructions: "Bad config", gradeInstructions: {college: {}}})});
  await bad.page.ready; assert.equal(bad.get("scoring-save-config").disabled, true); assert.match(bad.get("scoring-status").textContent, /unsupported/);
});

test("failed saves preserve edits, suppress duplicate submits and allow retry", async () => {
  const saving = deferred(); let attempts = 0;
  const h = harness({saveConfig: async input => ++attempts === 1 ? saving.promise : saved(input)}); await h.page.ready;
  await h.get("scoring-primary-grade-3").edit("Keep this draft");
  const operation = h.get("scoring-config-form").submit(); assert.ok(h.inputs().every(input => input.disabled));
  await h.get("scoring-config-form").submit(); assert.equal(h.saves.length, 1);
  saving.reject(new Error("Write unavailable")); await operation;
  assert.equal(h.get("scoring-primary-grade-3").value, "Keep this draft");
  assert.equal(h.get("scoring-save-config").disabled, false); assert.match(h.get("scoring-status").textContent, /Write unavailable/);
  await h.get("scoring-config-form").submit(); assert.equal(h.saves.length, 2);
});

test("disposed pages ignore late results and remove form listeners", async () => {
  const loading = deferred(); const first = harness({getConfig: () => loading.promise});
  first.page.dispose(); loading.resolve(saved({...createDefaultConfiguration(), markingInstructions: "Late rubric"})); await first.page.ready;
  assert.notEqual(first.get("scoring-base-instructions").value, "Late rubric"); assert.ok(first.inputs().every(input => input.disabled));
  const saving = deferred(); const second = harness({saveConfig: () => saving.promise}); await second.page.ready;
  await second.get("scoring-base-instructions").edit("Keep my draft"); const operation = second.get("scoring-config-form").submit();
  second.page.dispose(); saving.resolve(saved(createDefaultConfiguration())); await operation;
  assert.equal(second.get("scoring-base-instructions").value, "Keep my draft"); assert.equal(second.get("scoring-save-config").disabled, true);
  assert.equal(second.get("scoring-config-form").listeners.size, 0);
});

test("the page uses the shared administrator guard, explicit grade labels and Site Admin navigation", async () => {
  const html = await readFile(new URL("./essay_scoring_admin.html", import.meta.url), "utf8");
  const site = await readFile(new URL("../../../site_admin/pages/site_admin/site_admin.html", import.meta.url), "utf8");
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /data-site-admin-page/); assert.match(html, /site_admin_page_loader\.js/);
  assert.match(html, /essay_scoring_admin\.js\?v=20261020-scoring-config-v1/);
  assert.match(html, /id="scoring-preview"[^>]*readonly/);
  assert.match(site, /essay_scoring\/pages\/admin\/essay_scoring_admin\.html/);
  const h = harness(); await h.page.ready;
  for (const level of ["primary", "secondary"]) for (let grade = 1; grade <= 6; grade++) {
    const field = h.get("scoring-" + level + "-instructions").children[grade - 1];
    assert.equal(field.children[0].attributes.get("for"), "scoring-" + level + "-grade-" + grade);
  }
});
