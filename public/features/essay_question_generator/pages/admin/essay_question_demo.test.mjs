import assert from "node:assert/strict";
import test from "node:test";
import {mountEssayQuestionDemo} from "./essay_question_demo.js";

class Element {
  constructor() {
    this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false; this.children = [];
    this.listeners = new Map(); this.attributes = new Map(); this.classes = new Set();
    this.classList = {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};
  }
  addEventListener(event, callback) {this.listeners.set(event, callback);}
  removeEventListener(event, callback) {if (this.listeners.get(event) === callback) this.listeners.delete(event);}
  setAttribute(name, value) {this.attributes.set(name, value);}
  replaceChildren(...children) {this.children = children;}
  async edit(value, event = "change") {
    assert.equal(this.disabled, false, "Cannot edit disabled field");
    this.value = value; return this.listeners.get(event)?.({target: this});
  }
  async click() {if (!this.disabled) return this.listeners.get("click")?.();}
  async submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
}
const names = ["panel", "form", "help", "level", "standard", "language", "difficulty", "seed", "language-status",
  "reload-languages", "get-seed", "generate", "progress", "status", "result", "result-meta", "preview", "save-question"];
const combined = "Theme: Friendship\nSetting: School\nType: Narrative";
const asDraft = input => ({questionId: "draft-1", level: input.level, standard: input.standard,
  language: input.language, difficulty: input.difficulty, seedUsed: input.seed, questionText: "Write about a surprising act of friendship.",
  wordCountRequirement: {minWords: null}});
function deferred() {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
function harness(options = {}) {
  const elements = new Map(names.map(name => ["essay-demo-" + name, new Element()]));
  const root = {getElementById: id => elements.get(id), createElement: () => new Element()};
  const calls = {seeds: [], generations: [], saves: [], busy: []};
  const page = mountEssayQuestionDemo({root,
    listLanguages: options.listLanguages || (async () => ["English", "Malay"]),
    getCombinedSeed: async input => {calls.seeds.push(structuredClone(input)); return options.getCombinedSeed ? options.getCombinedSeed(input) : combined;},
    generateQuestion: async input => {calls.generations.push(structuredClone(input)); return options.generateQuestion ? options.generateQuestion(input) : asDraft(input);},
    saveQuestion: async input => {calls.saves.push(structuredClone(input)); return options.saveQuestion ? options.saveQuestion(input) : {...input, generatedAt: new Date()};},
    onBusyChange: value => calls.busy.push(value),
  });
  page.setConfigurationState({loaded: true, busy: false, dirty: false});
  const get = name => elements.get("essay-demo-" + name);
  async function select() {
    await get("level").edit("primary"); await get("standard").edit("3");
    await get("language").edit("English"); await get("difficulty").edit("medium");
  }
  async function readyInput(seed = "Manual inspiration") {
    await page.ready; await select(); await get("seed").edit(seed, "input");
  }
  return {page, get, calls, select, readyInput};
}

test("demo loads languages and requires all parameters and seed before generation", async () => {
  const h = harness(); await h.page.ready;
  assert.deepEqual(h.get("language").children.map(option => option.value), ["", "English", "Malay"]);
  assert.equal(h.get("generate").disabled, true); assert.equal(h.get("get-seed").disabled, true);
  assert.equal(h.get("result").hidden, true);
  await h.select();
  assert.equal(h.get("get-seed").disabled, false); assert.equal(h.get("generate").disabled, true);
  await h.get("seed").edit("  Manual inspiration  ", "input");
  assert.equal(h.get("generate").disabled, false);
  assert.deepEqual(h.calls.generations, []); assert.deepEqual(h.calls.saves, []);
});

test("combined seed selection uses the chosen level and grade and allows editing before preview generation", async () => {
  const h = harness(); await h.page.ready; await h.select();
  await h.get("get-seed").click();
  assert.deepEqual(h.calls.seeds, [{level: "primary", grade: 3}]);
  assert.equal(h.get("seed").value, combined);
  await h.get("seed").edit(combined + "\nFocus on kindness.", "input");
  await h.get("form").submit();
  assert.deepEqual(h.calls.generations, [{level: "primary", standard: 3, language: "English", difficulty: "medium",
    seed: combined + "\nFocus on kindness.", save: false}]);
  assert.equal(h.get("preview").value, asDraft(h.calls.generations[0]).questionText);
  assert.equal(h.get("result").hidden, false);
  assert.equal(h.get("save-question").disabled, false);
  assert.deepEqual(h.calls.saves, []);
  await h.get("save-question").click();
  assert.deepEqual(h.calls.saves, [asDraft(h.calls.generations[0])]);
  assert.equal(h.get("save-question").textContent, "Saved");
  assert.equal(h.get("save-question").disabled, true);
  assert.match(h.get("result-meta").textContent, /ID: draft-1/);
  assert.equal(h.get("status").textContent, "Question saved.");
  assert.deepEqual(h.calls.busy, [true, false, true, false, true, false]);
});

test("manual seed entry does not call the seed feature", async () => {
  const h = harness(); await h.readyInput();
  await h.get("form").submit();
  assert.deepEqual(h.calls.seeds, []);
  assert.equal(h.calls.generations[0].seed, "Manual inspiration");
  assert.equal(h.calls.generations[0].save, false);
  assert.deepEqual(h.calls.saves, []);
});

test("the generated minimum is shown with the preview and retained when saving", async () => {
  const h = harness({generateQuestion: async input => ({...asDraft(input), wordCountRequirement: {minWords: 150}})});
  await h.readyInput(); await h.get("form").submit();
  assert.match(h.get("result-meta").textContent, /Minimum 150 words/);
  await h.get("save-question").click();
  assert.deepEqual(h.calls.saves[0].wordCountRequirement, {minWords: 150});
});

test("generation displays progress, locks inputs and suppresses duplicate actions", async () => {
  const pending = deferred();
  const h = harness({generateQuestion: () => pending.promise}); await h.readyInput();
  const generating = h.get("form").submit();
  assert.equal(h.get("progress").hidden, false); assert.equal(h.get("seed").disabled, true);
  assert.equal(h.get("level").disabled, true); assert.equal(h.get("get-seed").disabled, true);
  await h.get("form").submit(); await h.get("get-seed").click();
  assert.equal(h.calls.generations.length, 1); assert.deepEqual(h.calls.seeds, []);
  pending.resolve(asDraft(h.calls.generations[0])); await generating;
  assert.equal(h.get("progress").hidden, true); assert.equal(h.get("seed").disabled, false);
  assert.equal(h.get("generate").disabled, false);
});

test("generation failures retain an existing preview and allow another attempt", async () => {
  let fail = false;
  const h = harness({generateQuestion: async input => {if (fail) throw new Error("AI timeout"); return asDraft(input);}});
  await h.readyInput(); await h.get("form").submit();
  const preview = h.get("preview").value; fail = true;
  await h.get("form").submit();
  assert.match(h.get("status").textContent, /AI timeout/);
  assert.equal(h.get("preview").value, preview); assert.equal(h.get("save-question").disabled, false);
  assert.equal(h.get("progress").hidden, true);
  fail = false; await h.get("form").submit();
  assert.equal(h.calls.generations.length, 3); assert.deepEqual(h.calls.saves, []);
});

test("failed saves retain the same draft for retry and suppress double saves", async () => {
  const pending = deferred(); let attempts = 0;
  const h = harness({saveQuestion: async input => ++attempts === 1 ? pending.promise : {...input, generatedAt: new Date()}});
  await h.readyInput(); await h.get("form").submit();
  const saving = h.get("save-question").click();
  await h.get("save-question").click();
  assert.equal(h.calls.saves.length, 1);
  pending.reject(new Error("Write unavailable")); await saving;
  assert.match(h.get("status").textContent, /Write unavailable/);
  assert.equal(h.get("save-question").disabled, false); assert.equal(h.get("result").hidden, false);
  await h.get("save-question").click();
  assert.deepEqual(h.calls.saves[0], h.calls.saves[1]);
  assert.equal(h.calls.generations.length, 1);
  assert.equal(h.get("save-question").disabled, true);
});

test("changing parameters clears a stale preview and changing level or grade clears an automatically selected seed", async () => {
  const h = harness(); await h.page.ready; await h.select(); await h.get("get-seed").click(); await h.get("form").submit();
  await h.get("standard").edit("4");
  assert.equal(h.get("result").hidden, true); assert.equal(h.get("save-question").disabled, true);
  assert.equal(h.get("seed").value, ""); assert.equal(h.get("generate").disabled, true);
  await h.get("seed").edit("Custom seed", "input");
  await h.get("standard").edit("5");
  assert.equal(h.get("seed").value, "Custom seed");
  await h.get("form").submit();
  await h.get("difficulty").edit("hard");
  assert.equal(h.get("result").hidden, true); assert.equal(h.get("seed").value, "Custom seed");
});

test("failed seed selection preserves a manual seed and allows retry or manual generation", async () => {
  let fail = true;
  const h = harness({getCombinedSeed: async () => {if (fail) throw new Error("No matching theme"); return combined;}});
  await h.readyInput();
  await h.get("get-seed").click();
  assert.match(h.get("status").textContent, /No matching theme/);
  assert.equal(h.get("seed").value, "Manual inspiration");
  assert.equal(h.get("generate").disabled, false);
  fail = false; await h.get("get-seed").click();
  assert.equal(h.get("seed").value, combined);
});

test("dirty or unavailable configuration blocks generation until settings are saved", async () => {
  const h = harness(); await h.readyInput();
  h.page.setConfigurationState({loaded: true, busy: false, dirty: true});
  assert.equal(h.get("generate").disabled, true); assert.match(h.get("help").textContent, /Save your changes/);
  await h.get("form").submit(); assert.deepEqual(h.calls.generations, []);
  h.page.setConfigurationState({loaded: false, busy: false, dirty: false});
  assert.equal(h.get("get-seed").disabled, true); assert.equal(h.get("seed").disabled, true);
  h.page.setConfigurationState({loaded: true, busy: false, dirty: false});
  assert.equal(h.get("generate").disabled, false);
});

test("language load failures can be retried, and removing a selected language clears its preview", async () => {
  let response = new Error("Language read unavailable");
  const h = harness({listLanguages: async () => {if (response instanceof Error) throw response; return response;}});
  await h.page.ready;
  assert.match(h.get("language-status").textContent, /Language read unavailable/);
  assert.equal(h.get("language").disabled, true);
  response = [" English ", "english", "Malay"];
  await h.get("reload-languages").click();
  assert.deepEqual(h.get("language").children.map(option => option.value), ["", "English", "Malay"]);
  await h.select(); await h.get("seed").edit("Seed", "input"); await h.get("form").submit();
  response = ["Malay"];
  await h.get("reload-languages").click();
  assert.equal(h.get("language").value, ""); assert.equal(h.get("result").hidden, true);
  response = []; await h.get("reload-languages").click();
  assert.match(h.get("language-status").textContent, /No languages configured/);
  assert.equal(h.get("generate").disabled, true);
});

test("HTML-like question text is displayed literally and mismatched generated criteria cannot be saved", async () => {
  const text = '<img src=x onerror="alert(1)">';
  const h = harness({generateQuestion: async input => ({...asDraft(input), questionText: text})});
  await h.readyInput(); await h.get("form").submit();
  assert.equal(h.get("preview").value, text); assert.deepEqual(h.get("preview").children, []);
  const bad = harness({generateQuestion: async input => ({...asDraft(input), standard: 6})});
  await bad.readyInput(); await bad.get("form").submit();
  assert.match(bad.get("status").textContent, /does not match/);
  assert.equal(bad.get("save-question").disabled, true);
});

test("disposed demos ignore late language, seed, generation and save responses", async () => {
  const loading = deferred();
  const first = harness({listLanguages: () => loading.promise});
  first.page.dispose(); loading.resolve(["English"]); await first.page.ready;
  assert.deepEqual(first.get("language").children, []);
  for (const operation of ["seed", "generate", "save"]) {
    const pending = deferred();
    const h = harness({getCombinedSeed: operation === "seed" ? () => pending.promise : undefined,
      generateQuestion: operation === "generate" ? () => pending.promise : undefined,
      saveQuestion: operation === "save" ? () => pending.promise : undefined});
    await h.readyInput();
    if (operation === "save") await h.get("form").submit();
    const active = operation === "seed" ? h.get("get-seed").click()
      : operation === "generate" ? h.get("form").submit() : h.get("save-question").click();
    const previous = h.get("preview").value;
    h.page.dispose();
    pending.resolve(operation === "seed" ? combined : asDraft(h.calls.generations[0]));
    await active;
    assert.equal(h.get("preview").value, previous);
    assert.equal(h.get("generate").disabled, true); assert.equal(h.get("save-question").disabled, true);
  }
});
