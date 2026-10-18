import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {fillFrameworkSelect} from "../../../assessment_framework/components/framework_select.js";
import {createSyllabusLanguageKey} from "../../domain/syllabus.js";

class Element {
  constructor(tag = "div", values = {}) {Object.assign(this, {tag, children: [], dataset: {}, value: "", checked: false, disabled: false, hidden: false, textContent: "", listeners: new Map(), className: "", classList: {toggle() {}, remove() {}}}, values);}
  append(...children) {children.forEach(child => {child.parent = this; this.children.push(child);});}
  replaceChildren(...children) {this.children = []; this.append(...children);}
  addEventListener(event, listener) {this.listeners.set(event, listener);}
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    const tag = selector.match(/^([a-z]+)/)?.[1]; if (tag && tag !== this.tag) return false;
    for (const match of selector.matchAll(/\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)) {
      const key = match[1].replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = match[1].startsWith("data-") ? this.dataset[key] : this[key];
      if (value === undefined || (match[2] !== undefined && String(value) !== match[2])) return false;
    }
    return !selector.includes(":checked") || this.checked;
  }
  querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);}
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  get options() {return this.querySelectorAll("option");}
  remove() {if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);}
  async click() {assert.equal(this.disabled, false); await this.listeners.get("click")?.();}
  async edit(value) {assert.equal(this.disabled, false); this.value = value; await this.listeners.get("change")?.();}
}
function field(name, tag = "input", values = {}) {return new Element(tag, {dataset: {field: name}, ...values});}
function template(kind) {
  return {content: {cloneNode() {
    const fragment = new Element(), row = new Element("section", {className: kind + "-row"});
    const action = name => new Element("button", {dataset: {action: name}});
    if (kind === "topic") row.append(field("topicName"), field("pausable", "input", {type: "checkbox"}), new Element("div", {dataset: {role: "topic-frameworks"}}),
      new Element("div", {dataset: {role: "subtopics"}}), action("remove-topic"), action("add-subtopic"));
    if (kind === "subtopic") row.append(field("subtopicName"), action("remove-subtopic"));
    if (kind === "level") row.append(...["levelName", "sequenceOrder", "requiredPracticeCount", "minimumScore", "questionsPerPractice"].map(name => field(name)), field("difficultyLevel", "select"),
      new Element("span", {dataset: {label: "practice-count"}}), action("move-up"), action("move-down"), action("remove-level"));
    fragment.append(row); return fragment;
  }}};
}
function documentFixture() {
  const elements = new Map();
  const get = id => {if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id);};
  for (const kind of ["topic", "subtopic", "level"]) elements.set(kind + "-template", template(kind));
  const difficulties = ["easy", "medium", "hard"].map(name => new Element("input", {dataset: {difficultyField: name + "Percentage"}}));
  const document = {querySelector: selector => get(selector.slice(1)), querySelectorAll: () => difficulties, createElement: tag => new Element(tag)};
  return {get, document};
}
const names = [{id: "normal", name: "Normal framework"}, {id: "essay", name: "Essay framework", frameworkType: "essay"}];
test("framework dropdown groups Normal and Essay and retains a missing configured reference", () => {
  const {document} = documentFixture(), select = new Element("select");
  fillFrameworkSelect(select, names, "missing", {documentRef: document});
  assert.deepEqual(select.children.filter(child => child.tag === "optgroup").map(group => group.label), ["Normal", "Essay"]);
  assert.equal(select.children[0].textContent, "Use syllabus default");
  assert.equal(select.value, "missing"); assert.match(select.children.at(-1).textContent, /Unavailable/);
});
test("syllabus admin renders topic/language overrides, saves them and restores default inheritance", async () => {
  const {get, document} = documentFixture(), saves = [];
  const syllabus = {id: "syllabus", country: "Malaysia", level: "primary", year: 3, subject: "Language", assessmentFrameworkId: "normal", languages: ["English", "Bahasa Melayu"],
    topics: [{id: "writing", topicName: "Writing", pausable: false, subtopics: {}, preAssessmentPractices: {}, assessmentFrameworkIds: {english: "essay"}}]};
  const source = (await readFile(new URL("./syllabus_admin.js", import.meta.url), "utf8")).replace(/^import[\s\S]*?from\s+"[^"]+";\n/gm, "");
  const context = vm.createContext({document, console, createSyllabusLanguageKey,
    fillFrameworkSelect: (select, frameworks, selected, options) => fillFrameworkSelect(select, frameworks, selected, {...options, documentRef: document}),
    listSyllabusScopes: async () => [{country: "Malaysia", languages: ["English", "Bahasa Melayu"], levels: {primary: {3: true}}}],
    listAssessmentFrameworks: async () => names, listSyllabuses: async () => [syllabus], getSyllabusById: async () => syllabus,
    updateSyllabusRecord: async (current, changes) => {saves.push(JSON.parse(JSON.stringify(changes))); return {...current, ...changes};},
  });
  vm.runInContext(source, context); await new Promise(resolve => setImmediate(resolve));
  let selects = get("topics-container").querySelectorAll("select[data-framework-language]");
  assert.deepEqual(Object.fromEntries(selects.map(select => [select.dataset.frameworkLanguage, select.value])), {english: "essay", bahasa_melayu: ""});
  selects.find(select => select.dataset.frameworkLanguage === "bahasa_melayu").value = "essay"; await get("save-syllabus").click();
  assert.deepEqual(saves[0].topics[0].assessmentFrameworkIds, {english: "essay", bahasa_melayu: "essay"});
  assert.equal(saves[0].topics[0].pausable, false);
  selects = get("topics-container").querySelectorAll("select[data-framework-language]");
  selects.find(select => select.dataset.frameworkLanguage === "english").value = ""; await get("save-syllabus").click();
  assert.deepEqual(saves[1].topics[0].assessmentFrameworkIds, {bahasa_melayu: "essay"});
  assert.equal(saves[1].assessmentFrameworkId, "normal");
});
test("framework admin saves essay levels with configurable count/score, fixed medium difficulty and no pre-assessment editor", async () => {
  const {get, document} = documentFixture(), saves = [];
  get("framework-type").value = "normal";
  const source = (await readFile(new URL("../../../assessment_framework/pages/admin/assessment_framework_admin.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from\s+"[^"]+";\n/gm, "");
  const context = vm.createContext({document, console, assessmentFrameworkPreAssessmentScoreBands: [], assessmentFrameworkPreAssessmentDifficultyLevels: ["easy", "medium", "hard"],
    ASSESSMENT_FRAMEWORK_END_LEVEL_ID: "endLevel", listAssessmentFrameworks: async () => [{id: "existing-normal", name: "Normal", endLevelName: "Ready", levels: []}],
    createAssessmentFrameworkRecord: async input => {saves.push(JSON.parse(JSON.stringify(input))); return {...input, id: "new"};},
  });
  vm.runInContext(source, context); await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("framework-type").disabled, true);
  get("new-framework-name").value = "Essay progression"; await get("use-new-framework").click();
  assert.equal(get("framework-type").disabled, false);
  await get("framework-type").edit("essay");
  const row = get("levels-container").children[0];
  assert.equal(get("pre-assessment-section").hidden, true);
  assert.equal(row.querySelector("[data-field='questionsPerPractice']").value, 1);
  assert.equal(row.querySelector("[data-field='difficultyLevel']").value, "Medium");
  assert.equal(row.querySelector("[data-field='difficultyLevel']").disabled, true);
  row.querySelector("[data-field='levelName']").value = "Starting";
  row.querySelector("[data-field='requiredPracticeCount']").value = 4;
  row.querySelector("[data-field='minimumScore']").value = 85;
  get("framework-end-level-name").value = "Ready";
  await get("save-framework").click();
  assert.equal(saves[0].frameworkType, "essay");
  assert.deepEqual(saves[0].levels[0].criteria, {requiredPracticeCount: 4, minimumScore: 85, questionsPerPractice: 1, difficultyLevel: "medium"});
});
