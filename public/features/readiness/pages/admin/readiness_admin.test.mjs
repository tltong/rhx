import assert from "node:assert/strict";
import test from "node:test";
import {mountReadinessAdmin} from "./readiness_admin.js";
import {DifficultyLevel, DEFAULT_DIFFICULTY_WEIGHTS, DEFAULT_NUMBER_OF_PRACTICES, DEFAULT_PRE_ASSESSMENT_WEIGHT} from "../../readiness_module.js";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.hidden = false;
  }
  get valueAsNumber() { return this.value.trim() ? Number(this.value) : NaN; }
  append(...elements) { this.children.push(...elements); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  setCustomValidity(message) { this.validationMessage = message; }
  reportValidity() { this.reportedValidity = true; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  async submit() { return this.listeners.get("submit")?.({preventDefault() {}}); }
  async click() { if (!this.disabled) return this.listeners.get("click")?.(); }
  async edit(value) { this.value = String(value); return this.listeners.get("input")?.(); }
}

const flatten = (element) => [element, ...element.children.flatMap(flatten)];
const savedConfig = (weights = {easy: 0.8, medium: 1.1, hard: 2}) => ({
  difficultyWeights: weights,
  numberOfPractices: 5,
  preAssessmentWeight: 1,
  updatedAt: new Date("2026-10-04T05:00:00Z"),
  updatedBy: "admin-1"
});

function harness({getConfig = async () => null, saveConfig} = {}) {
  const elements = new Map(["readiness-form", "weight-fields", "readiness-status", "updated-at", "save-weights", "reset-weights", "retry-load", "number-of-practices", "number-of-practices-error"]
    .map((id) => [id, new Element("div")]));
  const root = {
    querySelector: (selector) => elements.get(selector.slice(1)),
    createElement: (tagName) => new Element(tagName)
  };
  const saves = [];
  const page = mountReadinessAdmin({root, getConfig, saveConfig: async (input) => {
    saves.push(input);
    return saveConfig ? saveConfig(input) : {...savedConfig(input.difficultyWeights), numberOfPractices: input.numberOfPractices, preAssessmentWeight: input.preAssessmentWeight};
  }});
  const get = (id) => elements.get(id)
    || flatten(elements.get("weight-fields")).find((element) => element.id === id);
  return {page, saves, get};
}

test("first visit renders enum fields and proposed defaults without saving", async () => {
  const {page, saves, get} = harness();
  assert.equal(get("save-weights").disabled, true);
  await page.ready;
  const fields = flatten(get("weight-fields")).filter((element) => element.tagName === "input");
  assert.deepEqual(fields.map(({name}) => name), ["preAssessmentWeight", ...Object.values(DifficultyLevel)]);
  for (const difficulty of Object.values(DifficultyLevel)) {
    assert.equal(get(`weight-${difficulty}`).valueAsNumber, DEFAULT_DIFFICULTY_WEIGHTS[difficulty]);
  }
  assert.equal(get("number-of-practices").valueAsNumber, DEFAULT_NUMBER_OF_PRACTICES);
  assert.equal(get("weight-pre-assessment").valueAsNumber, DEFAULT_PRE_ASSESSMENT_WEIGHT);
  assert.match(get("readiness-status").textContent, /have not been saved/);
  assert.equal(get("updated-at").textContent, "Never saved");
  assert.equal(get("save-weights").disabled, false);
  assert.deepEqual(saves, []);
});

test("saved values load, reset stays in the form, and Save persists all enum weights", async () => {
  const {page, saves, get} = harness({getConfig: async () => savedConfig()});
  await page.ready;
  assert.equal(get("weight-hard").valueAsNumber, 2);
  const savedTime = get("updated-at").textContent;
  await get("reset-weights").click();
  assert.deepEqual(saves, []);
  assert.equal(get("weight-hard").valueAsNumber, 1.75);
  assert.equal(get("updated-at").textContent, savedTime);
  await get("readiness-form").submit();
  assert.deepEqual(saves, [{difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS, numberOfPractices: 5, preAssessmentWeight: 1}]);
  assert.match(get("readiness-status").textContent, /configuration saved/);
});

test("invalid weights show field errors and cannot be submitted", async () => {
  const {page, saves, get} = harness();
  await page.ready;
  for (const invalid of ["", "0", "-1", "NaN", "Infinity"]) {
    await get("weight-easy").edit(invalid);
    await get("readiness-form").submit();
    assert.equal(get("weight-easy").attributes.get("aria-invalid"), "true");
    assert.equal(get("weight-easy-error").hidden, false);
    assert.match(get("weight-easy-error").textContent, /greater than zero/);
  }
  assert.deepEqual(saves, []);
  await get("weight-easy").edit("0.5");
  assert.equal(get("weight-easy-error").hidden, true);
  await get("readiness-form").submit();
  assert.equal(saves[0].difficultyWeights.easy, 0.5);
});

test("a failed initial load prevents writes and supports retry without losing error visibility", async () => {
  let attempts = 0;
  const {page, saves, get} = harness({getConfig: async () => {
    if (++attempts === 1) throw new Error("Connection unavailable");
    return savedConfig();
  }});
  await page.ready;
  assert.equal(get("save-weights").disabled, true);
  assert.equal(get("reset-weights").disabled, true);
  assert.equal(get("retry-load").hidden, false);
  assert.equal(get("readiness-status").textContent, "Connection unavailable");
  await get("readiness-form").submit();
  assert.deepEqual(saves, []);
  await get("retry-load").click();
  assert.equal(get("retry-load").hidden, true);
  assert.equal(get("save-weights").disabled, false);
  assert.equal(get("weight-hard").valueAsNumber, 2);
});

test("failed saves preserve edits for retry and pending saves prevent duplicate submissions", async () => {
  let completeSave;
  let attempts = 0;
  const {page, saves, get} = harness({saveConfig: async (input) => {
    if (++attempts === 1) throw new Error("Save unavailable");
    return new Promise((resolve) => { completeSave = () => resolve(savedConfig(input.difficultyWeights)); });
  }});
  await page.ready;
  await get("weight-hard").edit("2.25");
  await get("readiness-form").submit();
  assert.equal(get("weight-hard").valueAsNumber, 2.25);
  assert.equal(get("readiness-status").textContent, "Save unavailable");
  assert.equal(get("save-weights").disabled, false);
  const pending = get("readiness-form").submit();
  assert.equal(get("save-weights").disabled, true);
  assert.equal(get("reset-weights").disabled, true);
  assert.equal(get("weight-hard").disabled, true);
  await get("readiness-form").submit();
  assert.equal(saves.length, 2);
  completeSave();
  await pending;
  assert.equal(get("save-weights").disabled, false);
  assert.equal(get("weight-hard").valueAsNumber, 2.25);
  assert.equal(get("readiness-status").textContent, "Readiness configuration saved.");
});

test("admin validates new parameters, saves edits, and restores all default values without writing", async () => {
  const {page, saves, get} = harness({getConfig: async () => ({...savedConfig(), numberOfPractices: 8, preAssessmentWeight: 2})});
  await page.ready;
  assert.equal(get("number-of-practices").valueAsNumber, 8);
  assert.equal(get("weight-pre-assessment").valueAsNumber, 2);
  for (const value of [0, -1, 1.5, ""]) {
    await get("number-of-practices").edit(value);
    await get("readiness-form").submit();
    assert.equal(get("number-of-practices-error").hidden, false);
  }
  await get("number-of-practices").edit(7);
  await get("weight-pre-assessment").edit(0);
  await get("readiness-form").submit();
  assert.equal(get("weight-pre-assessment-error").hidden, false);
  assert.deepEqual(saves, []);
  await get("weight-pre-assessment").edit(1.5);
  await get("readiness-form").submit();
  assert.equal(saves[0].numberOfPractices, 7);
  assert.equal(saves[0].preAssessmentWeight, 1.5);
  await get("reset-weights").click();
  assert.equal(get("number-of-practices").valueAsNumber, 5);
  assert.equal(get("weight-pre-assessment").valueAsNumber, 1);
  assert.equal(saves.length, 1);
});
