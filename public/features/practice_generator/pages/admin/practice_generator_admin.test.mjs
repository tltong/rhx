import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {test} from "node:test";

const code = (await readFile(new URL("./practice_generator_admin.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from\s+"[^"]+";\n/gm, "");
class Element {
  constructor() {
    this.value = ""; this.textContent = ""; this.children = []; this.hidden = false; this.disabled = false;
    this.style = {}; this.listeners = new Map();
    this.classList = {toggle() {}, remove() {}};
  }
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  addEventListener(event, listener) {this.listeners.set(event, listener);}
  async edit(value) {
    assert.equal(this.disabled, false); this.value = value;
    const result = this.listeners.get("change")?.(); await result;
    await flush();
  }
  async click() {assert.equal(this.disabled, false); return this.listeners.get("click")?.();}
}
async function flush() {for (let i = 0; i < 12; i++) await Promise.resolve();}
function deferred() {let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve};}
function harness(options = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get("practice-type-select").value = "normal";
  const normalQuestion = {id: "normal-q", difficulty: "medium", language: "English", hasDiagram: false,
    questionText: "Which word is correct?", options: {a: "One", b: "Two", c: "Three", d: "Four"}, correctAnswer: "a", explanation: "One."};
  const essayQuestion = {questionId: "essay-q", difficulty: "medium", language: "English",
    questionText: "Write about a helpful friend.", wordCountRequirement: {minWords: 150}};
  const syllabuses = options.syllabuses || [
    {id: "normal-syllabus", country: "Malaysia", level: "primary", year: 3, subject: "Reading",
      assessmentFrameworkId: "framework", languages: ["English"], topics: [{id: "topic-1", topicName: "Reading", preAssessmentPractices: {}}]},
    {id: "essay-syllabus", country: "Malaysia", level: "primary", year: 3, subject: "Writing",
      assessmentFrameworkId: null, languages: ["English"], topics: [{id: "topic-1", topicName: "Writing", preAssessmentPractices: {}}]},
  ];
  const calls = {normal: [], essay: [], loadNormal: [], loadEssay: []};
  const normalResult = {practice: {id: "normal-p"}, assignment: {language: "English", practiceId: "normal-p", practiceType: "normal"},
    topicName: "Reading", language: "English", questions: [normalQuestion], replacement: {replaced: false},
    allocation: {totalQuestions: 1, withoutDiagram: 1, withDiagram: 0, diagramPercentage: 0,
      byDifficulty: Object.fromEntries(["easy", "medium", "hard"].map(difficulty => [difficulty,
        {difficultyLevel: difficulty, total: difficulty === "medium" ? 1 : 0, withoutDiagram: difficulty === "medium" ? 1 : 0, withDiagram: 0}]))},
    prompts: ["prompt"], categoryResults: [{}]};
  const essayResult = {practiceType: "essay", practice: {id: "essay-p", essayQuestionId: "essay-q"},
    assignment: {language: "English", practiceId: "essay-p", practiceType: "essay"},
    topicName: "Writing", language: "English", questions: [essayQuestion], replacement: {replaced: false}};
  const context = vm.createContext({
    document: {querySelector: selector => get(selector.slice(1)), createElement: () => new Element()},
    console, URL, Blob,
    setMathText: (element, text) => {element.textContent = text;},
    createSyllabusLanguageKey: value => value.toLowerCase(),
    loadPreAssessmentGeneratorOptions: async () => ({syllabuses}),
    generatePreAssessmentPractice: async input => {calls.normal.push(input); return options.normal ? options.normal(input) : normalResult;},
    generateEssayPractice: async input => {calls.essay.push(input); return options.essay ? options.essay(input) : essayResult;},
    loadPreAssessmentPractice: async input => {calls.loadNormal.push(input); return options.loadNormal ? options.loadNormal(input) : normalResult;},
    loadEssayPractice: async input => {calls.loadEssay.push(input); return options.loadEssay ? options.loadEssay(input) : essayResult;},
  });
  vm.runInContext(code, context);
  return {get, calls, syllabuses, context, ready: flush(), normalResult, essayResult};
}
test("page keeps subjects without a framework available and offers one medium essay attached to the syllabus", async () => {
  const h = harness(); await h.ready;
  assert.deepEqual(h.get("syllabus-select").children.slice(1).map(item => item.value), ["normal-syllabus", "essay-syllabus"]);
  await h.get("syllabus-select").edit("essay-syllabus");
  assert.equal(h.get("practice-type-select").value, "essay");
  assert.equal(h.get("generate-practice").disabled, false);
  assert.match(h.get("practice-type-help").textContent, /medium-difficulty/);
  await h.get("generate-practice").click();
  assert.equal(h.calls.essay.length, 1); assert.equal(h.calls.normal.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.essay[0])), {syllabusId: "essay-syllabus", topicId: "topic-1", language: "English"});
  assert.equal(h.get("allocation-summary").hidden, true);
  assert.equal(h.get("questions-container").children.length, 1);
  assert.match(h.get("results-summary").textContent, /Essay.*Medium.*1 question/);
  assert.match(h.get("status-message").textContent, /attached to the syllabus/);
  assert.equal(h.syllabuses[1].topics[0].preAssessmentPractices.english.practiceType, "essay");
});

test("normal mode keeps the current generator, allocation and MCQ preview", async () => {
  const h = harness(); await h.ready;
  await h.get("syllabus-select").edit("normal-syllabus");
  assert.equal(h.get("practice-type-select").value, "normal");
  await h.get("generate-practice").click();
  assert.equal(h.calls.normal.length, 1); assert.equal(h.calls.essay.length, 0);
  assert.equal(h.get("allocation-summary").hidden, false);
  assert.equal(h.get("allocation-body").children.length, 3);
  assert.equal(h.get("questions-container").children.length, 1);
  assert.equal(h.syllabuses[0].topics[0].preAssessmentPractices.english.practiceType, "normal");
});

test("normal generation is disabled without a framework but switching to essay enables it", async () => {
  const h = harness(); await h.ready;
  await h.get("syllabus-select").edit("essay-syllabus");
  await h.get("practice-type-select").edit("normal");
  assert.equal(h.get("generate-practice").disabled, true);
  assert.match(h.get("practice-type-help").textContent, /requires an assessment framework/);
  await h.get("practice-type-select").edit("essay");
  assert.equal(h.get("generate-practice").disabled, false);
});

test("an existing essay is previewed through its own loader and can be replaced by normal practice", async () => {
  const h = harness(); await h.ready;
  h.syllabuses[0].topics[0].preAssessmentPractices.english = {language: "English", practiceId: "old-essay", practiceType: "essay"};
  await h.get("syllabus-select").edit("normal-syllabus");
  assert.equal(h.get("practice-type-select").value, "essay");
  assert.equal(h.calls.loadEssay.length, 1); assert.equal(h.calls.loadNormal.length, 0);
  assert.match(h.get("results-summary").textContent, /Existing essay practice/);
  await h.get("practice-type-select").edit("normal");
  assert.match(h.get("assignment-message").textContent, /retained/);
  await h.get("generate-practice").click();
  assert.equal(h.calls.normal.length, 1);
  assert.equal(h.syllabuses[0].topics[0].preAssessmentPractices.english.practiceType, "normal");
});

test("legacy attachments preview as normal and the admin can switch that topic to essay", async () => {
  const h = harness(); await h.ready;
  h.syllabuses[0].topics[0].preAssessmentPractices.english = {language: "English", practiceId: "old-normal"};
  await h.get("syllabus-select").edit("normal-syllabus");
  assert.equal(h.calls.loadNormal.length, 1);
  await h.get("practice-type-select").edit("essay");
  await h.get("generate-practice").click();
  assert.equal(h.calls.essay.length, 1);
  assert.equal(h.syllabuses[0].topics[0].preAssessmentPractices.english.practiceType, "essay");
});

test("generation freezes the selection and failures display an error without changing the attachment", async () => {
  const pending = deferred(), h = harness({essay: () => pending.promise}); await h.ready;
  await h.get("syllabus-select").edit("essay-syllabus");
  const generated = h.get("generate-practice").click(); await flush();
  for (const id of ["syllabus-select", "topic-select", "language-select", "practice-type-select", "generate-practice"]) {
    assert.equal(h.get(id).disabled, true);
  }
  pending.resolve(Promise.reject(new Error("No matching theme entries are available.")));
  await generated;
  assert.match(h.get("status-message").textContent, /No matching theme/);
  assert.equal(h.get("generate-practice").disabled, false);
  assert.deepEqual(h.syllabuses[1].topics[0].preAssessmentPractices, {});
});

test("a stale existing preview cannot overwrite a newly generated essay", async () => {
  const pending = deferred(), h = harness({loadEssay: () => pending.promise}); await h.ready;
  h.syllabuses[1].topics[0].preAssessmentPractices.english = {language: "English", practiceId: "old", practiceType: "essay"};
  await h.get("syllabus-select").edit("essay-syllabus");
  await h.get("generate-practice").click();
  assert.equal(h.get("practice-id").textContent, "essay-p");
  pending.resolve({...h.essayResult, practice: {id: "old"}}); await flush();
  assert.equal(h.get("practice-id").textContent, "essay-p");
});

