import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {mountEssayQuestionGeneratorAdmin} from "./essay_question_generator_admin.js";
import {createDefaultConfiguration, EssayQuestionGeneratorConfig} from "../../domain/essay_question_generator_config.js";

class Element {
  constructor(tag = "div") {
    this.tagName = tag; this.children = []; this.listeners = new Map(); this.attributes = new Map();
    this.classes = new Set(); this.classList = {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};
    this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false;
  }
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  setAttribute(name, value) {this.attributes.set(name, value);}
  setCustomValidity(message) {this.customValidity = message;}
  addEventListener(name, callback) {this.listeners.set(name, callback);}
  removeEventListener(name, callback) {if (this.listeners.get(name) === callback) this.listeners.delete(name);}
  async click() {if (!this.disabled) return this.listeners.get("click")?.();}
  async submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
  async edit(value) {
    assert.equal(this.disabled, false, "Cannot edit a disabled field");
    this.value = value; return this.listeners.get("input")?.({target: this});
  }
}
const flatten = element => [element, ...element.children.flatMap(flatten)];
const ids = ["essay-config-form", "essay-common-instructions", "essay-status", "essay-updated-at",
  "essay-save-config", "essay-retry-load", "essay-primary-instructions", "essay-secondary-instructions", "essay-difficulty-instructions",
  ...["panel", "form", "help", "level", "standard", "language", "difficulty", "seed", "language-status", "reload-languages",
    "get-seed", "generate", "progress", "status", "result", "result-meta", "preview", "save-question"].map(id => "essay-demo-" + id)];
const saved = configuration => new EssayQuestionGeneratorConfig({...configuration,
  updatedAt: new Date("2026-10-17T12:00:00Z"), updatedBy: "admin-1"});
function deferred() {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
function harness(options = {}) {
  const elements = new Map(ids.map(id => [id, new Element()]));
  const get = id => elements.get(id) || [...elements.values()].flatMap(flatten).find(element => element.id === id);
  const saves = [];
  const root = {getElementById: get, createElement: tag => new Element(tag)};
  const page = mountEssayQuestionGeneratorAdmin({root, getConfig: options.getConfig || (async () => null),
    demoOptions: {listLanguages: async () => ["English", "Malay"], ...options.demoOptions},
    saveConfig: async input => {saves.push(structuredClone(input)); return options.saveConfig ? options.saveConfig(input) : saved(input);}});
  return {page, get, saves, fields: () => [...elements.values()].flatMap(flatten).filter(element =>
    element === get("essay-common-instructions") || element.tagName === "textarea")};
}

test("the admin form loads 16 editable instruction fields with blank defaults and never saves on read", async () => {
  const h = harness();
  assert.equal(h.get("essay-save-config").disabled, true);
  assert.ok(h.fields().every(field => field.disabled));
  await h.page.ready;
  assert.equal(h.fields().length, 16);
  assert.ok(h.fields().every(field => !field.disabled && field.value === ""));
  assert.equal(h.get("essay-save-config").disabled, false);
  assert.equal(h.get("essay-updated-at").textContent, "Never saved");
  assert.deepEqual(h.saves, []);
});

test("saved config models populate separate primary, secondary and difficulty instructions", async () => {
  const config = createDefaultConfiguration();
  config.additionalLlmInstructions = "Common";
  config.gradeInstructions.primary[3] = "Primary three"; config.gradeInstructions.secondary[3] = "Secondary three";
  config.gradeWordCountRequirements.primary[3].minWords = 150;
  config.gradeWordCountRequirements.secondary[3].minWords = 350;
  config.difficultyInstructions = {easy: "Easy guidance", medium: "Medium guidance", hard: "Hard guidance"};
  const h = harness({getConfig: async () => saved(config)});
  await h.page.ready;
  assert.equal(h.get("essay-common-instructions").value, "Common");
  assert.equal(h.get("essay-primary-grade-3").value, "Primary three");
  assert.equal(h.get("essay-secondary-grade-3").value, "Secondary three");
  assert.equal(h.get("essay-primary-grade-3-min-words").value, "150");
  assert.equal(h.get("essay-secondary-grade-3-min-words").value, "350");
  for (const difficulty of ["easy", "medium", "hard"]) assert.equal(h.get("essay-difficulty-" + difficulty).value, config.difficultyInstructions[difficulty]);
  assert.match(h.get("essay-updated-at").textContent, /Last saved:/);
});

test("saving captures all common, grade and difficulty instructions and supports clearing fields", async () => {
  const h = harness(); await h.page.ready;
  await h.get("essay-common-instructions").edit(" Common \nDetails ");
  for (const level of ["primary", "secondary"]) for (let grade = 1; grade <= 6; grade++) {
    await h.get("essay-" + level + "-grade-" + grade).edit(level + " " + grade);
  }
  for (const difficulty of ["easy", "medium", "hard"]) await h.get("essay-difficulty-" + difficulty).edit(difficulty);
  assert.match(h.get("essay-status").textContent, /unsaved/);
  await h.get("essay-config-form").submit();
  assert.equal(h.saves.length, 1); assert.equal(h.saves[0].additionalLlmInstructions, "Common \nDetails");
  assert.equal(h.saves[0].gradeInstructions.primary[6], "primary 6");
  assert.equal(h.saves[0].gradeInstructions.secondary[1], "secondary 1");
  assert.deepEqual(h.saves[0].difficultyInstructions, {easy: "easy", medium: "medium", hard: "hard"});
  assert.equal(h.get("essay-status").textContent, "Settings saved.");
  await h.get("essay-primary-grade-3").edit(" ");
  await h.get("essay-config-form").submit();
  assert.equal(h.saves[1].gradeInstructions.primary[3], "");
});

test("failed saves retain edits and suppress repeated submissions while allowing retry", async () => {
  const pending = deferred(); let attempts = 0;
  const h = harness({saveConfig: async input => ++attempts === 1 ? pending.promise : saved(input)});
  await h.page.ready;
  await h.get("essay-primary-grade-1").edit("Keep this draft");
  const saving = h.get("essay-config-form").submit();
  assert.ok(h.fields().every(field => field.disabled));
  await h.get("essay-config-form").submit();
  assert.equal(h.saves.length, 1);
  pending.reject(new Error("Write unavailable")); await saving;
  assert.equal(h.get("essay-primary-grade-1").value, "Keep this draft");
  assert.equal(h.get("essay-save-config").disabled, false);
  assert.equal(h.get("essay-save-config").textContent, "Save settings");
  assert.match(h.get("essay-status").textContent, /Write unavailable/);
  await h.get("essay-config-form").submit();
  assert.equal(h.saves.length, 2); assert.equal(h.get("essay-status").textContent, "Settings saved.");
});

test("minimum words are configured independently per grade and can be cleared", async () => {
  const h = harness(); await h.page.ready;
  await h.get("essay-primary-grade-3-min-words").edit("150");
  await h.get("essay-secondary-grade-3-min-words").edit("350");
  await h.get("essay-config-form").submit();
  assert.deepEqual(h.saves[0].gradeWordCountRequirements.primary[3], {minWords: 150});
  assert.deepEqual(h.saves[0].gradeWordCountRequirements.secondary[3], {minWords: 350});
  assert.deepEqual(h.saves[0].gradeWordCountRequirements.primary[2], {minWords: null});
  await h.get("essay-primary-grade-3-min-words").edit("");
  await h.get("essay-config-form").submit();
  assert.deepEqual(h.saves[1].gradeWordCountRequirements.primary[3], {minWords: null});
});

test("invalid word counts prevent saves and show errors without losing other edits", async () => {
  const h = harness(); await h.page.ready;
  await h.get("essay-common-instructions").edit("Keep this instruction");
  const count = h.get("essay-primary-grade-1-min-words");
  for (const value of ["0", "-5", "1.5", "not a number", "9007199254740992"]) {
    await count.edit(value); await h.get("essay-config-form").submit();
    assert.deepEqual(h.saves, []); assert.ok(count.customValidity);
    assert.equal(h.get("essay-primary-grade-1-min-words-error").hidden, false);
    assert.match(h.get("essay-status").textContent, /Correct the minimum word counts/);
  }
  await count.edit("100");
  assert.equal(count.customValidity, "");
  await h.get("essay-config-form").submit();
  assert.equal(h.saves[0].additionalLlmInstructions, "Keep this instruction");
  assert.equal(h.saves[0].gradeWordCountRequirements.primary[1].minWords, 100);
});

test("the integrated demo requires saved instruction edits and locks settings during generation", async () => {
  const pending = deferred(), generations = [];
  const h = harness({demoOptions: {generateQuestion: async input => {generations.push(input); return pending.promise;}}});
  await h.page.ready;
  for (const [id, value] of [["level", "primary"], ["standard", "3"], ["language", "English"], ["difficulty", "medium"]]) {
    const field = h.get("essay-demo-" + id); field.value = value;
    field.listeners.get("change")({target: field});
  }
  await h.get("essay-demo-seed").edit("Seed inspiration");
  assert.equal(h.get("essay-demo-generate").disabled, false);
  await h.get("essay-primary-grade-3").edit("New instruction");
  assert.equal(h.get("essay-demo-generate").disabled, true);
  assert.match(h.get("essay-demo-help").textContent, /Save your changes/);
  await h.get("essay-config-form").submit();
  assert.equal(h.get("essay-demo-generate").disabled, false);
  const generating = h.get("essay-demo-form").submit();
  assert.equal(h.get("essay-common-instructions").disabled, true);
  assert.equal(h.get("essay-save-config").disabled, true);
  await h.get("essay-config-form").submit(); assert.equal(h.saves.length, 1);
  pending.resolve({questionId: "demo-draft", level: "primary", standard: 3, language: "English", difficulty: "medium",
    seedUsed: "Seed inspiration", questionText: "Write about a community project."});
  await generating;
  assert.equal(h.get("essay-common-instructions").disabled, false);
  assert.equal(h.get("essay-demo-save-question").disabled, false);
  assert.equal(generations[0].save, false);
});

test("language loading failure leaves configuration editing available", async () => {
  const h = harness({demoOptions: {listLanguages: async () => {throw new Error("Language read failed");}}});
  await h.page.ready;
  assert.equal(h.get("essay-save-config").disabled, false);
  assert.equal(h.get("essay-demo-generate").disabled, true);
  assert.match(h.get("essay-demo-language-status").textContent, /Language read failed/);
  await h.get("essay-common-instructions").edit("Still editable");
  await h.get("essay-config-form").submit();
  assert.equal(h.saves[0].additionalLlmInstructions, "Still editable");
});

test("failed and corrupt loads disable saving until a successful retry", async () => {
  let fail = true;
  const h = harness({getConfig: async () => {if (fail) throw new Error("Read unavailable"); return saved(createDefaultConfiguration());}});
  await h.page.ready;
  assert.equal(h.get("essay-save-config").disabled, true);
  assert.equal(h.get("essay-retry-load").hidden, false);
  await h.get("essay-config-form").submit(); assert.deepEqual(h.saves, []);
  fail = false; await h.get("essay-retry-load").click();
  assert.equal(h.get("essay-save-config").disabled, false);
  const corrupt = harness({getConfig: async () => ({gradeInstructions: {college: {}}})});
  await corrupt.page.ready;
  assert.equal(corrupt.get("essay-save-config").disabled, true);
  assert.match(corrupt.get("essay-status").textContent, /unsupported/);
});

test("disposed forms ignore late load/save results and disable all controls", async () => {
  const loading = deferred();
  const first = harness({getConfig: () => loading.promise});
  first.page.dispose(); loading.resolve(saved(createDefaultConfiguration())); await first.page.ready;
  assert.equal(first.get("essay-updated-at").textContent, "Never saved");
  assert.ok(first.fields().every(field => field.disabled));
  const saving = deferred();
  const second = harness({saveConfig: () => saving.promise}); await second.page.ready;
  await second.get("essay-common-instructions").edit("Retain draft");
  const operation = second.get("essay-config-form").submit(); second.page.dispose();
  saving.resolve(saved(createDefaultConfiguration())); await operation;
  assert.equal(second.get("essay-common-instructions").value, "Retain draft");
  assert.equal(second.get("essay-save-config").disabled, true);
});

test("the page uses the shared admin guard, explicit field labels and a Site Admin navigation link", async () => {
  const html = await readFile(new URL("./essay_question_generator_admin.html", import.meta.url), "utf8");
  const site = await readFile(new URL("../../../site_admin/pages/site_admin/site_admin.html", import.meta.url), "utf8");
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /data-site-admin-page/);
  assert.match(html, /site_admin_page_loader\.js/);
  assert.match(html, /essay_question_generator_admin\.js\?v=20261017-essay-grade-min-words-v1/);
  assert.ok(html.indexOf('id="essay-demo-panel"') > html.indexOf('id="essay-save-config"'));
  assert.match(html, /id="essay-demo-preview"[^>]*readonly/);
  assert.match(site, /essay_question_generator\/pages\/admin\/essay_question_generator_admin\.html/);
  const h = harness(); await h.page.ready;
  for (const level of ["primary", "secondary"]) for (let grade = 1; grade <= 6; grade++) {
    const inputId = "essay-" + level + "-grade-" + grade;
    const field = h.get("essay-" + level + "-instructions").children[grade - 1];
    assert.equal(field.children[0].attributes.get("for"), inputId);
    assert.equal(field.children[1], h.get(inputId));
  }
});
