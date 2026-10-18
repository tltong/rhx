import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {mountQuestionSeedGeneratorAdmin} from "./question_seed_generator_admin.js";

class Element {
  constructor(tag = "div") {
    this.tagName = tag; this.children = []; this.listeners = new Map(); this.attributes = new Map();
    this.classes = new Set(); this.classList = {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};
    this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false; this.checked = false;
  }
  replaceChildren(...children) {this.children = children;}
  append(...children) {this.children.push(...children);}
  setAttribute(name, value) {this.attributes.set(name, value);}
  addEventListener(name, callback) {this.listeners.set(name, callback);}
  removeEventListener(name, callback) {if (this.listeners.get(name) === callback) this.listeners.delete(name);}
  async click() {if (!this.disabled) return this.listeners.get("click")?.();}
  async submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
  async check(value) {
    assert.equal(this.disabled, false, "Cannot edit disabled checkbox");
    this.checked = value; return this.listeners.get("change")?.({target: this});
  }
  async edit(value, event = "input") {
    assert.equal(this.disabled, false, "Cannot edit disabled field");
    this.value = String(value); return this.listeners.get(event)?.({target: this});
  }
}
const flatten = element => [element, ...element.children.flatMap(flatten)];
const verticals = ["theme", "setting", "type"];
const ids = [
  "seed-config-form", "seed-page-status", "seed-config-status", "seed-retry-load", "seed-generation-seed",
  "seed-llm-instructions", "seed-updated-at", "seed-save-config", "seed-get-combined", "seed-combined-output",
  "seed-combined-status", "seed-combined-panel", "seed-combined-availability", "seed-combined-level", "seed-combined-grade",
  ...verticals.flatMap(vertical => ["card", "use-seed", "override", "association-section", "associations", "preview", "generate", "save", "remove", "status", "count", "empty", "entries"]
    .map(suffix => "seed-" + vertical + "-" + suffix)),
];
const associations = {primary: [1], secondary: [2]};
const entry = (value, links = associations) => ({value, associations: structuredClone(links)});
const savedConfig = input => ({...input, updatedAt: new Date("2026-10-17T00:00:00Z"), updatedBy: "admin-1"});
function deferred() {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
function harness(options = {}) {
  const elements = new Map(ids.map(id => [id, new Element()]));
  const get = id => elements.get(id) || [...elements.values()].flatMap(flatten).find(element => element.id === id);
  const root = {getElementById: get, createElement: tag => new Element(tag)};
  const stored = structuredClone(options.pools || {theme: [entry("Technology")], setting: [entry("Library")], type: [entry("Persuasive")]});
  const generations = [], saves = [], settings = [], removals = [], combines = [], lists = [];
  const page = mountQuestionSeedGeneratorAdmin({root,
    getConfig: options.getConfig || (async () => null),
    getEntries: async input => {lists.push(structuredClone(input)); return options.getEntries ? options.getEntries(input) : structuredClone(stored[input.vertical]);},
    saveConfig: async input => {settings.push(structuredClone(input)); return options.saveConfig ? options.saveConfig(input) : savedConfig(input);},
    generateEntry: async input => {generations.push(structuredClone(input)); return options.generateEntry ? options.generateEntry(input) : entry("New " + input.vertical, {});},
    saveEntry: async input => {
      saves.push(structuredClone(input));
      const saved = options.saveEntry ? await options.saveEntry(input) : structuredClone(input.entry);
      const index = stored[input.vertical].findIndex(item => item.value === saved.value);
      if (index < 0) stored[input.vertical].push(saved); else stored[input.vertical][index] = saved;
      return saved;
    },
    removeEntries: async input => {
      removals.push(structuredClone(input));
      if (options.removeEntries) return options.removeEntries(input);
      stored[input.vertical] = stored[input.vertical].filter(item => !input.entries.includes(item.value));
      return structuredClone(stored[input.vertical]);
    },
    getCombinedSeed: async input => {
      combines.push(structuredClone(input));
      if (options.getCombinedSeed) return options.getCombinedSeed(input);
      return verticals.map(vertical => {
        const eligible = stored[vertical].find(item => item.associations[input.level]?.includes(input.grade));
        if (!eligible) throw new Error("No matching " + vertical);
        return vertical[0].toUpperCase() + vertical.slice(1) + ": " + eligible.value;
      }).join("\n");
    },
  });
  const row = (vertical, value) => get("seed-" + vertical + "-entries").children.find(item => item.children[0].children[0].value === value);
  const entryTexts = vertical => get("seed-" + vertical + "-entries").children.map(item => item.children[0].children[1].textContent);
  const detail = (vertical, value) => row(vertical, value).children[1];
  const saveAssociations = (vertical, value) => detail(vertical, value).children.at(-1).click();
  const savedGrade = (vertical, value, level, grade) => flatten(detail(vertical, value)).find(element => element.id?.endsWith("-" + level + "-" + grade));
  const draftGrade = (vertical, level, grade) => get("seed-" + vertical + "-draft-" + level + "-" + grade);
  async function select(vertical, value, checked = true) {
    const checkbox = row(vertical, value).children[0].children[0];
    assert.equal(checkbox.disabled, false);
    checkbox.checked = checked;
    return get("seed-" + vertical + "-entries").listeners.get("change")?.({target: checkbox});
  }
  async function scope(level = "primary", grade = 1) {
    await get("seed-combined-level").edit(level, "change");
    await get("seed-combined-grade").edit(grade, "change");
  }
  return {page, get, stored, generations, saves, settings, removals, combines, lists, row, detail, entryTexts,
    saveAssociations, savedGrade, draftGrade, select, scope};
}

test("loads all Entry objects with generation and manual entry enabled and empty draft associations hidden", async () => {
  const h = harness();
  assert.equal(h.get("seed-save-config").disabled, true);
  await h.page.ready;
  assert.equal(h.get("seed-generation-seed").value, "latest news");
  assert.deepEqual(h.lists, verticals.map(vertical => ({vertical})));
  for (const vertical of verticals) {
    assert.equal(h.get("seed-" + vertical + "-use-seed").checked, true);
    assert.equal(h.get("seed-" + vertical + "-preview").disabled, false);
    assert.equal(h.get("seed-" + vertical + "-generate").disabled, false);
    assert.equal(h.get("seed-" + vertical + "-save").disabled, true);
    assert.equal(h.get("seed-" + vertical + "-remove").disabled, true);
    assert.equal(h.get("seed-" + vertical + "-count").textContent, "1 saved");
    assert.deepEqual(h.entryTexts(vertical), h.stored[vertical].map(item => item.value));
    assert.equal(h.draftGrade(vertical, "primary", 1).checked, false);
    assert.equal(h.draftGrade(vertical, "primary", 1).disabled, true);
    assert.equal(h.get("seed-" + vertical + "-association-section").hidden, true);
  }
  assert.equal(h.get("seed-get-combined").disabled, true);
  assert.match(h.get("seed-combined-availability").textContent, /Choose a level and grade/);
  assert.deepEqual(h.saves, []); assert.deepEqual(h.settings, []); assert.deepEqual(h.generations, []);
});

test("configuration still loads and saves seed defaults and additional instructions", async () => {
  const h = harness({getConfig: async () => savedConfig({generationSeed: "Conservation", additionalLlmInstructions: "For children"})});
  await h.page.ready;
  assert.equal(h.get("seed-generation-seed").value, "Conservation");
  await h.get("seed-generation-seed").edit(" ");
  await h.get("seed-llm-instructions").edit(" Simple language. ");
  await h.get("seed-config-form").submit();
  assert.deepEqual(h.settings, [{generationSeed: "latest news", additionalLlmInstructions: "Simple language."}]);
  assert.equal(h.get("seed-config-status").textContent, "Settings saved.");
});

test("each vertical generates first, then saves the entry with associations selected afterward", async () => {
  const h = harness(); await h.page.ready;
  for (const vertical of verticals) {
    await h.get("seed-" + vertical + "-generate").click();
    assert.equal(h.get("seed-" + vertical + "-association-section").hidden, false);
    assert.equal(h.get("seed-" + vertical + "-save").disabled, true);
    await h.draftGrade(vertical, "primary", 1).check(true);
    await h.draftGrade(vertical, "primary", 6).check(true);
    await h.draftGrade(vertical, "secondary", 2).check(true);
    const links = {primary: [1, 6], secondary: [2]};
    assert.deepEqual(h.generations.at(-1), {vertical, useHighLevelSeed: true, seed: "latest news", save: false});
    assert.equal(h.get("seed-" + vertical + "-preview").value, "New " + vertical);
    assert.equal(h.stored[vertical].length, 1);
    await h.get("seed-" + vertical + "-save").click();
    assert.deepEqual(h.saves.at(-1), {vertical, entry: entry("New " + vertical, links)});
    assert.equal(h.get("seed-" + vertical + "-count").textContent, "2 saved");
    assert.equal(h.get("seed-" + vertical + "-association-section").hidden, true);
    assert.match(h.detail(vertical, "New " + vertical).children[0].textContent, /Primary: 1, 6; Secondary: 2/);
  }
});

test("manual entries for every vertical save the typed text and selected associations without calling the LLM", async () => {
  const h = harness(); await h.page.ready;
  for (const vertical of verticals) {
    const preview = h.get("seed-" + vertical + "-preview");
    await preview.edit("  Manual   " + vertical + "\nentry  ");
    assert.equal(h.get("seed-" + vertical + "-association-section").hidden, false);
    assert.equal(h.get("seed-" + vertical + "-save").disabled, true);
    await h.draftGrade(vertical, "primary", 3).check(true);
    await h.draftGrade(vertical, "secondary", 5).check(true);
    await h.get("seed-" + vertical + "-save").click();
    assert.deepEqual(h.saves.at(-1), {vertical, entry: entry("Manual " + vertical + " entry", {primary: [3], secondary: [5]})});
    assert.ok(h.entryTexts(vertical).includes("Manual " + vertical + " entry"));
    assert.equal(preview.value, "");
    assert.equal(h.get("seed-" + vertical + "-association-section").hidden, true);
    assert.equal(h.get("seed-" + vertical + "-save").disabled, true);
    await preview.edit("Another " + vertical);
    assert.equal(h.draftGrade(vertical, "primary", 3).checked, false);
    assert.equal(h.get("seed-" + vertical + "-save").disabled, true);
  }
  assert.deepEqual(h.generations, []);
});

test("editing a generated entry saves the revised text while retaining selected grades", async () => {
  const h = harness(); await h.page.ready;
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 4).check(true);
  await h.get("seed-theme-preview").edit("A revised theme");
  assert.equal(h.draftGrade("theme", "primary", 4).checked, true);
  await h.get("seed-theme-save").click();
  assert.deepEqual(h.saves, [{vertical: "theme", entry: entry("A revised theme", {primary: [4]})}]);
  assert.ok(!h.entryTexts("theme").includes("New theme"));
  assert.equal(h.generations.length, 1);
});

test("blank entries cannot be saved and a failed manual save retains text and grades for retry", async () => {
  const pending = deferred(); let attempts = 0;
  const h = harness({saveEntry: async input => ++attempts === 1 ? pending.promise : input.entry});
  assert.equal(h.get("seed-theme-preview").disabled, true);
  await h.page.ready;
  await h.get("seed-theme-preview").edit("Manual draft");
  await h.draftGrade("theme", "secondary", 6).check(true);
  await h.get("seed-theme-preview").edit(" \n ");
  assert.equal(h.get("seed-theme-save").disabled, true);
  await h.get("seed-theme-save").listeners.get("click")();
  assert.deepEqual(h.saves, []);
  await h.get("seed-theme-preview").edit("Manual draft");
  const saving = h.get("seed-theme-save").click();
  assert.equal(h.get("seed-theme-preview").disabled, true);
  await h.get("seed-theme-save").click();
  assert.equal(h.saves.length, 1);
  pending.reject(new Error("Write unavailable")); await saving;
  assert.equal(h.get("seed-theme-preview").disabled, false);
  assert.equal(h.get("seed-theme-preview").value, "Manual draft");
  assert.equal(h.draftGrade("theme", "secondary", 6).checked, true);
  assert.match(h.get("seed-theme-status").textContent, /Write unavailable/);
  await h.get("seed-theme-save").click();
  assert.deepEqual(h.saves[1], {vertical: "theme", entry: entry("Manual draft", {secondary: [6]})});
  h.page.dispose();
  assert.equal(h.get("seed-theme-preview").disabled, true);
});

test("no-seed checkboxes are independent, disable overrides and restore previous override values", async () => {
  const h = harness(); await h.page.ready;
  await h.get("seed-generation-seed").edit("Global inspiration");
  await h.get("seed-theme-override").edit("Theme inspiration");
  await h.get("seed-theme-use-seed").check(false);
  await h.get("seed-theme-generate").click();
  assert.deepEqual(h.generations[0], {vertical: "theme", useHighLevelSeed: false, save: false});
  assert.equal(h.get("seed-theme-override").disabled, true);
  await h.get("seed-setting-generate").click();
  assert.equal(h.generations[1].seed, "Global inspiration");
  await h.get("seed-theme-use-seed").check(true);
  await h.get("seed-theme-generate").click();
  assert.equal(h.generations[2].seed, "Theme inspiration");
});

test("association changes preserve the preview and do not trigger another LLM call", async () => {
  const h = harness(); await h.page.ready;
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 1).check(true);
  await h.draftGrade("theme", "secondary", 2).check(true);
  assert.equal(h.get("seed-theme-save").disabled, false);
  assert.equal(h.get("seed-theme-preview").value, "New theme");
  assert.equal(h.generations.length, 1);
  await h.get("seed-theme-save").click();
  assert.deepEqual(h.saves[0].entry.associations, {primary: [1], secondary: [2]});
});

test("a new generated entry starts with no associations from the previous draft", async () => {
  let count = 0;
  const h = harness({generateEntry: async () => entry("Candidate " + (++count), {})});
  await h.page.ready;
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 1).check(true);
  await h.get("seed-theme-generate").click();
  assert.equal(h.get("seed-theme-preview").value, "Candidate 2");
  assert.equal(h.draftGrade("theme", "primary", 1).checked, false);
  assert.equal(h.get("seed-theme-save").disabled, true);
  await h.draftGrade("theme", "secondary", 6).check(true);
  await h.get("seed-theme-save").click();
  assert.deepEqual(h.saves, [{vertical: "theme", entry: entry("Candidate 2", {secondary: [6]})}]);
  assert.equal(h.generations.length, 2);
  assert.ok(h.generations.every(input => !Object.hasOwn(input, "associations")));
});

test("clearing draft associations keeps the entry but blocks saving until a grade is selected", async () => {
  const h = harness(); await h.page.ready;
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 1).check(true);
  await h.draftGrade("theme", "primary", 1).check(false);
  assert.equal(h.get("seed-theme-preview").value, "New theme");
  assert.equal(h.get("seed-theme-save").disabled, true);
  await h.get("seed-theme-save").listeners.get("click")();
  assert.deepEqual(h.saves, []);
  assert.match(h.get("seed-theme-status").textContent, /at least one level and grade/);
  await h.draftGrade("theme", "primary", 6).check(true);
  await h.get("seed-theme-save").click();
  assert.deepEqual(h.saves[0].entry.associations, {primary: [6]});
  assert.equal(h.generations.length, 1);
});

test("generation blocks duplicate actions while other verticals remain available for generation", async () => {
  const pending = deferred();
  const h = harness({generateEntry: () => pending.promise}); await h.page.ready;
  await h.get("seed-theme-use-seed").check(false);
  const generating = h.get("seed-theme-generate").click();
  assert.match(h.get("seed-theme-status").textContent, /without a high-level seed/);
  assert.equal(h.draftGrade("theme", "primary", 1).disabled, true);
  assert.equal(h.get("seed-theme-use-seed").disabled, true);
  assert.equal(h.get("seed-setting-generate").disabled, false);
  await h.get("seed-theme-generate").click();
  assert.equal(h.generations.length, 1);
  pending.resolve(entry("Generated", {})); await generating;
  assert.equal(h.get("seed-theme-save").disabled, true);
  await h.draftGrade("theme", "primary", 1).check(true);
  assert.equal(h.get("seed-theme-save").disabled, false);
});

test("generation and save errors preserve valid previews and enable retries", async () => {
  let failGeneration = false, failSave = true;
  const h = harness({
    generateEntry: async () => {if (failGeneration) throw new Error("AI unavailable"); return entry("Candidate", {});},
    saveEntry: async input => {if (failSave) throw new Error("Save unavailable"); return input.entry;},
  });
  await h.page.ready;
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 1).check(true);
  failGeneration = true; await h.get("seed-theme-generate").click();
  assert.equal(h.get("seed-theme-preview").value, "Candidate");
  await h.get("seed-theme-save").click();
  assert.equal(h.get("seed-theme-save").disabled, false);
  assert.match(h.get("seed-theme-status").textContent, /Save unavailable/);
  failSave = false; await h.get("seed-theme-save").click();
  assert.equal(h.get("seed-theme-count").textContent, "2 saved");
});

test("combined selection requires exact level-grade matches and excludes unassigned entries", async () => {
  const h = harness({pools: {
    theme: [entry("Unassigned", {}), entry("Primary two", {primary: [2], secondary: [1]})],
    setting: [entry("Library")], type: [entry("Persuasive")],
  }});
  await h.page.ready; await h.scope("primary", 1);
  assert.equal(h.get("seed-get-combined").disabled, true);
  assert.match(h.get("seed-combined-availability").textContent, /theme/);
  await h.scope("secondary", 1);
  assert.equal(h.get("seed-get-combined").disabled, true);
  await h.scope("secondary", 2);
  assert.equal(h.get("seed-get-combined").disabled, true);
  const ready = harness(); await ready.page.ready; await ready.scope();
  await ready.get("seed-get-combined").click();
  assert.deepEqual(ready.combines, [{level: "primary", grade: 1}]);
  assert.equal(ready.get("seed-combined-output").value, "Theme: Technology\nSetting: Library\nType: Persuasive");
});

test("saved entries allow multi-association edits without changing the new preview associations", async () => {
  const h = harness(); await h.page.ready;
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 6).check(true);
  await h.savedGrade("theme", "Technology", "primary", 3).check(true);
  await h.savedGrade("theme", "Technology", "secondary", 6).check(true);
  await h.saveAssociations("theme", "Technology");
  assert.deepEqual(h.saves[0], {vertical: "theme", entry: entry("Technology", {primary: [1, 3], secondary: [2, 6]})});
  assert.equal(h.draftGrade("theme", "primary", 6).checked, true);
  assert.equal(h.draftGrade("theme", "primary", 3).checked, false);
  assert.match(h.get("seed-theme-status").textContent, /Associations saved/);
});

test("unassigned entries can be associated and become eligible for combined generation", async () => {
  const h = harness({pools: {theme: [entry("Old string entry", {})], setting: [entry("Library")], type: [entry("Persuasive")]}});
  await h.page.ready; await h.scope();
  assert.match(h.detail("theme", "Old string entry").children[0].textContent, /Unassigned/);
  assert.equal(h.get("seed-get-combined").disabled, true);
  await h.savedGrade("theme", "Old string entry", "primary", 1).check(true);
  await h.saveAssociations("theme", "Old string entry");
  assert.equal(h.get("seed-get-combined").disabled, false);
  await h.get("seed-get-combined").click();
  assert.match(h.get("seed-combined-output").value, /Old string entry/);
});

test("clearing associations makes an entry unassigned, clears combined output and updates availability", async () => {
  const h = harness(); await h.page.ready; await h.scope();
  await h.get("seed-get-combined").click();
  await h.savedGrade("theme", "Technology", "primary", 1).check(false);
  await h.savedGrade("theme", "Technology", "secondary", 2).check(false);
  await h.saveAssociations("theme", "Technology");
  assert.deepEqual(h.saves[0].entry.associations, {});
  assert.match(h.detail("theme", "Technology").children[0].textContent, /Unassigned/);
  assert.equal(h.get("seed-combined-output").value, "");
  assert.equal(h.get("seed-get-combined").disabled, true);
});

test("unsaved edits on other entries and open editors survive list re-rendering", async () => {
  const h = harness({pools: {theme: [entry("A"), entry("B")], setting: [entry("Library")], type: [entry("Persuasive")]}});
  await h.page.ready;
  h.detail("theme", "B").open = true;
  await h.savedGrade("theme", "B", "primary", 6).check(true);
  await h.savedGrade("theme", "A", "secondary", 6).check(true);
  await h.saveAssociations("theme", "A");
  assert.equal(h.detail("theme", "B").open, true);
  assert.equal(h.savedGrade("theme", "B", "primary", 6).checked, true);
  await h.saveAssociations("theme", "B");
  assert.deepEqual(h.saves[1].entry.associations.primary, [1, 6]);
});

test("failed association saves retain checkbox edits for retry without changing saved values", async () => {
  let fail = true;
  const h = harness({saveEntry: async input => {if (fail) throw new Error("Write unavailable"); return input.entry;}});
  await h.page.ready;
  await h.savedGrade("theme", "Technology", "primary", 6).check(true);
  await h.saveAssociations("theme", "Technology");
  assert.equal(h.savedGrade("theme", "Technology", "primary", 6).checked, true);
  assert.equal(h.detail("theme", "Technology").children.at(-1).disabled, false);
  assert.match(h.get("seed-theme-status").textContent, /Write unavailable/);
  assert.deepEqual(h.stored.theme[0].associations, associations);
  fail = false; await h.saveAssociations("theme", "Technology");
  assert.deepEqual(h.stored.theme[0].associations.primary, [1, 6]);
});

test("grade-checkbox events cannot select a saved entry for removal, even when its value is a grade number", async () => {
  const h = harness({pools: {theme: [entry("1")], setting: [entry("Library")], type: [entry("Persuasive")]}});
  await h.page.ready;
  const gradeInput = h.savedGrade("theme", "1", "primary", 6);
  await gradeInput.check(true);
  h.get("seed-theme-entries").listeners.get("change")({target: gradeInput});
  assert.equal(h.get("seed-theme-remove").disabled, true);
  assert.deepEqual(h.removals, []);
});

test("selected entry removal sends string values and renders returned object associations", async () => {
  const h = harness({pools: {theme: [entry("A"), entry("B"), entry("C")], setting: [entry("Library")], type: [entry("Persuasive")]}});
  await h.page.ready;
  await h.select("theme", "A"); await h.select("theme", "C");
  assert.equal(h.get("seed-theme-remove").textContent, "Remove selected (2)");
  await h.get("seed-theme-remove").click();
  assert.deepEqual(h.removals, [{vertical: "theme", entries: ["A", "C"]}]);
  assert.deepEqual(h.entryTexts("theme"), ["B"]);
  assert.equal(h.savedGrade("theme", "B", "primary", 1).checked, true);
  assert.equal(h.get("seed-theme-count").textContent, "1 saved");
});

test("removing the last matching entry disables combined selection but preserves an unsaved preview", async () => {
  const h = harness(); await h.page.ready; await h.scope();
  await h.get("seed-theme-generate").click();
  await h.draftGrade("theme", "primary", 1).check(true);
  await h.get("seed-get-combined").click();
  await h.select("theme", "Technology"); await h.get("seed-theme-remove").click();
  assert.equal(h.get("seed-get-combined").disabled, true);
  assert.equal(h.get("seed-combined-output").value, "");
  assert.equal(h.get("seed-theme-empty").hidden, false);
  assert.equal(h.get("seed-theme-preview").value, "New theme");
  await h.get("seed-theme-save").click();
  assert.equal(h.get("seed-get-combined").disabled, false);
});

test("failed removals preserve selection and combined output for retry", async () => {
  let fail = true;
  const h = harness({removeEntries: async () => {if (fail) throw new Error("Remove unavailable"); return [];}});
  await h.page.ready; await h.scope(); await h.get("seed-get-combined").click();
  const previous = h.get("seed-combined-output").value;
  await h.select("theme", "Technology"); await h.get("seed-theme-remove").click();
  assert.equal(h.row("theme", "Technology").children[0].children[0].checked, true);
  assert.equal(h.get("seed-combined-output").value, previous);
  assert.match(h.get("seed-theme-status").textContent, /Remove unavailable/);
  fail = false; await h.get("seed-theme-remove").click();
  assert.deepEqual(h.entryTexts("theme"), []);
});

test("scope changes and saved association updates invalidate late combined responses", async () => {
  for (const action of ["scope", "association", "remove"]) {
    const pending = deferred();
    const h = harness({getCombinedSeed: () => pending.promise});
    await h.page.ready; await h.scope();
    const combining = h.get("seed-get-combined").click();
    if (action === "scope") await h.scope("secondary", 2);
    else if (action === "association") {
      await h.savedGrade("theme", "Technology", "primary", 6).check(true);
      await h.saveAssociations("theme", "Technology");
    } else {await h.select("theme", "Technology"); await h.get("seed-theme-remove").click();}
    pending.resolve("Old combined seed"); await combining;
    assert.equal(h.get("seed-combined-output").value, "");
  }
});

test("initial load failures and corrupt lists keep mutations disabled until retry succeeds", async () => {
  let fail = true;
  const h = harness({getEntries: async ({vertical}) => {
    if (fail && vertical === "setting") throw new Error("Read unavailable");
    return [entry(vertical)];
  }});
  await h.page.ready;
  assert.equal(h.get("seed-save-config").disabled, true);
  assert.equal(h.get("seed-retry-load").hidden, false);
  assert.match(h.get("seed-page-status").textContent, /Read unavailable/);
  fail = false; await h.get("seed-retry-load").click();
  assert.equal(h.get("seed-save-config").disabled, false);
  const corrupt = harness({getEntries: async () => ["Unexpected unnormalized string"]});
  await corrupt.page.ready;
  assert.equal(corrupt.get("seed-save-config").disabled, true);
});

test("saving configuration suppresses repeated submissions and retains failed edits", async () => {
  const pending = deferred();
  const h = harness({saveConfig: () => pending.promise}); await h.page.ready;
  await h.get("seed-generation-seed").edit("Draft");
  const saving = h.get("seed-config-form").submit();
  await h.get("seed-config-form").submit();
  assert.equal(h.settings.length, 1);
  pending.reject(new Error("Save unavailable")); await saving;
  assert.equal(h.get("seed-generation-seed").value, "Draft");
  assert.match(h.get("seed-config-status").textContent, /Save unavailable/);
});

test("combined errors preserve previous output and block duplicate clicks", async () => {
  const pending = deferred(); let count = 0;
  const h = harness({getCombinedSeed: () => ++count === 1 ? "Previous" : pending.promise});
  await h.page.ready; await h.scope(); await h.get("seed-get-combined").click();
  const combining = h.get("seed-get-combined").click(); await h.get("seed-get-combined").click();
  assert.equal(h.combines.length, 2);
  pending.reject(new Error("Read unavailable")); await combining;
  assert.equal(h.get("seed-combined-output").value, "Previous");
  assert.match(h.get("seed-combined-status").textContent, /Read unavailable/);
});

test("HTML-like entry text is rendered as literal text with no executable markup", async () => {
  const value = '<img src=x onerror="alert(1)">';
  const h = harness({pools: {theme: [entry(value, {})], setting: [], type: []}});
  await h.page.ready;
  const span = h.row("theme", value).children[0].children[1];
  assert.equal(span.textContent, value); assert.deepEqual(span.children, []);
  await h.select("theme", value);
  assert.equal(h.get("seed-theme-remove").disabled, false);
});

test("disposal disables grade editors and ignores late loading, generation and association-save results", async () => {
  const loading = deferred();
  const first = harness({getConfig: () => loading.promise});
  first.page.dispose(); loading.resolve(null); await first.page.ready;
  assert.equal(first.get("seed-save-config").disabled, true);
  for (const action of ["generate", "edit", "remove"]) {
    const pending = deferred();
    const h = harness({generateEntry: () => pending.promise, saveEntry: () => pending.promise, removeEntries: () => pending.promise});
    await h.page.ready;
    let operation;
    if (action === "generate") {
      operation = h.get("seed-theme-generate").click();
    } else if (action === "edit") {
      await h.savedGrade("theme", "Technology", "primary", 6).check(true);
      operation = h.saveAssociations("theme", "Technology");
    } else {await h.select("theme", "Technology"); operation = h.get("seed-theme-remove").click();}
    h.page.dispose();
    pending.resolve(action === "remove" ? [] : entry("Late", {primary: [1]})); await operation;
    assert.deepEqual(h.entryTexts("theme"), ["Technology"]);
    assert.equal(h.draftGrade("theme", "primary", 1).disabled, true);
    assert.equal(h.savedGrade("theme", "Technology", "primary", 1).disabled, true);
  }
});

test("the page retains the shared admin guard, all static controls and its Site Admin link", async () => {
  const html = await readFile(new URL("./question_seed_generator_admin.html", import.meta.url), "utf8");
  const site = await readFile(new URL("../../../site_admin/pages/site_admin/site_admin.html", import.meta.url), "utf8");
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id);
  for (const vertical of verticals) {
    const generate = html.indexOf('id="seed-' + vertical + '-generate"');
    const preview = html.indexOf('id="seed-' + vertical + '-preview"');
    const associations = html.indexOf('id="seed-' + vertical + '-association-section"');
    const save = html.indexOf('id="seed-' + vertical + '-save"');
    assert.ok(generate < preview && preview < associations && associations < save);
    const textarea = html.match(new RegExp('<textarea id="seed-' + vertical + '-preview"[^>]*>'))?.[0];
    assert.ok(textarea);
    assert.doesNotMatch(textarea, /readonly/);
  }
  assert.match(html, /data-site-admin-page/);
  assert.match(html, /site_admin_page_loader\.js/);
  assert.match(html, /question_seed_generator_admin\.js\?v=20261017-seed-manual-entry-v1/);
  assert.match(site, /question_seed_generator\/pages\/admin\/question_seed_generator_admin\.html/);
});
