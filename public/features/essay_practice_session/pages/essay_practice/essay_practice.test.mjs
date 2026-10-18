import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {mountEssayPractice} from "./essay_practice.js";
const html = await readFile(new URL("./essay_practice.html", import.meta.url), "utf8");
class Element {
  constructor() {this.hidden = false; this.disabled = false; this.textContent = ""; this.value = ""; this.children = []; this.listeners = new Map(); this.classList = {toggle() {}};}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  addEventListener(event, callback) {this.listeners.set(event, callback);}
  removeEventListener(event) {this.listeners.delete(event);}
  async submit() {return this.listeners.get("submit")({preventDefault() {}});}
  input(value) {this.value = value; this.listeners.get("input")?.();}
}
const assigned = {status: "assigned", practice: {studentId: "student", essayPracticeId: "attempt", essayQuestionId: "question"},
  question: {questionText: "<script>Write about friendship.</script>", language: "English", level: "primary", standard: 3, difficulty: "medium", wordCountRequirement: {minWords: 100}}, result: null};
function harness(options = {}) {
  const elements = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => {
    const element = new Element(); element.hidden = /\bhidden\b/.test(match[0]); return [match[1], element];
  }));
  const get = id => elements.get(id), tasks = new Map(), submits = [], navigations = [];
  let listener, session = assigned, clock = 100000, nextTimer = 0;
  const page = mountEssayPractice({root: {getElementById: get, createElement: () => new Element()},
    params: new URLSearchParams(options.query ?? "essayPracticeId=attempt"),
    onAuthChanged: callback => {listener = callback; return () => {};}, now: () => clock,
    schedule: callback => {const id = ++nextTimer; tasks.set(id, callback); return id;}, cancel: id => tasks.delete(id),
    navigate: url => navigations.push(url),
    loadSession: input => options.loadSession ? options.loadSession(input) : Promise.resolve(session),
    submitSession: async input => {submits.push(input); return options.submitSession ? options.submitSession(input) : {...assigned.practice, ...input, scoring: {status: "pending"}};},
  });
  return {get, page, tasks, submits, navigations, auth: user => listener(user),
    setSession: value => {session = value;}, advance: delta => {clock += delta;},
    tick: async () => {const [id, fn] = tasks.entries().next().value; tasks.delete(id); await fn(); await new Promise(resolve => setImmediate(resolve));},
  };
}
test("shows question, grade, minimum word requirement and an editable essay field", async () => {
  const h = harness(); await h.auth({uid: "student"});
  assert.equal(h.get("essay-question").textContent, assigned.question.questionText);
  assert.match(h.get("essay-summary").textContent, /Grade 3/);
  assert.equal(h.get("essay-requirement").textContent, "Write at least 100 words.");
  assert.equal(h.get("essay-form").hidden, false); assert.equal(h.get("essay-result").hidden, true);
  h.page.dispose();
});
test("saves exact text and elapsed time before displaying pending grading, then polls for corrections", async () => {
  const h = harness(); await h.auth({uid: "student"});
  h.get("essay-answer").value = "  My essay.\n\nSecond paragraph. " + "word ".repeat(96) + " "; h.advance(45000);
  await h.get("essay-form").submit();
  assert.deepEqual(h.submits[0], {studentId: "student", essayPracticeId: "attempt", essayText: h.get("essay-answer").value, timeTakenSeconds: 45});
  assert.equal(h.get("essay-form").hidden, true); assert.equal(h.get("essay-submission").hidden, false);
  assert.match(h.get("essay-status").textContent, /saved.*Scoring/);
  h.setSession({...assigned, status: "completed", practice: {...assigned.practice, essayText: h.submits[0].essayText},
    result: {score: 84, reviewComment: "Your paragraph order is clear. Add an example to develop your second idea.",
      corrections: [{originalText: "My essay.", correctedText: "My essay!", explanation: "Use emphasis."}]}});
  await h.tick();
  assert.equal(h.get("essay-score").textContent, "84 / 100");
  assert.equal(h.get("essay-review").hidden, false);
  assert.equal(h.get("essay-review-comment").textContent, "Your paragraph order is clear. Add an example to develop your second idea.");
  assert.equal(h.get("essay-result").hidden, false); assert.equal(h.get("essay-corrections").children.length, 1);
  assert.equal(h.tasks.size, 0); assert.equal(h.page.hasUnsavedAnswer(), false); h.page.dispose();
});

test("a good essay displays its overall review even with no corrections and clears it on sign-out", async () => {
  const h = harness();
  const reviewComment = "Your <strong>vivid examples</strong> and thoughtful ending make your ideas clear.";
  h.setSession({...assigned, status: "completed", practice: {...assigned.practice, essayText: "Saved"},
    result: {score: 100, reviewComment, corrections: []}});
  await h.auth({uid: "student"});
  assert.equal(h.get("essay-review").hidden, false);
  assert.equal(h.get("essay-review-comment").textContent, reviewComment);
  assert.equal(h.get("essay-corrections").children[0].textContent, "No corrections were suggested.");
  await h.auth(null);
  assert.equal(h.get("essay-review").hidden, true);
  assert.equal(h.get("essay-review-comment").textContent, "");
  h.page.dispose();
});

test("a legacy result still displays its score and corrections with no empty review section", async () => {
  const h = harness();
  h.setSession({...assigned, status: "completed", practice: {...assigned.practice, essayText: "Saved"},
    result: {score: 84, corrections: []}});
  await h.auth({uid: "student"});
  assert.equal(h.get("essay-score").textContent, "84 / 100");
  assert.equal(h.get("essay-review").hidden, true);
  h.page.dispose();
});
test("a failed submission retains the student's editable answer and allows retry", async () => {
  const h = harness({submitSession: async () => {throw Error("Network unavailable");}}); await h.auth({uid: "student"});
  const text = "Keep my essay" + " word".repeat(97);
  h.get("essay-answer").value = text; await h.get("essay-form").submit();
  assert.equal(h.get("essay-answer").value, text); assert.equal(h.get("essay-answer").disabled, false);
  assert.equal(h.get("essay-submit").disabled, false); assert.match(h.get("essay-status").textContent, /Network unavailable/);
  assert.equal(h.page.hasUnsavedAnswer(), true); h.page.dispose();
});
test("live count disables submission below the minimum, enables it at the boundary, and disables it after deletion", async () => {
  const h = harness(); await h.auth({uid: "student"});
  assert.equal(h.get("essay-submit").disabled, true);
  assert.match(h.get("essay-word-count").textContent, /0 \/ 100 words minimum.*100 more needed/);
  h.get("essay-answer").input("word ".repeat(99));
  assert.equal(h.get("essay-submit").disabled, true);
  assert.match(h.get("essay-word-count").textContent, /99 \/ 100.*1 more needed/);
  await h.get("essay-form").submit(); assert.deepEqual(h.submits, []);
  assert.match(h.get("essay-status").textContent, /at least 100 words/);
  h.get("essay-answer").input("word ".repeat(100));
  assert.equal(h.get("essay-submit").disabled, false);
  assert.equal(h.get("essay-status").hidden, true);
  assert.match(h.get("essay-word-count").textContent, /100 \/ 100.*minimum reached/);
  h.get("essay-answer").input("word ".repeat(99));
  assert.equal(h.get("essay-submit").disabled, true); h.page.dispose();
});
test("a question without a minimum keeps nonempty submissions available", async () => {
  const h = harness(); h.setSession({...assigned, question: {...assigned.question, wordCountRequirement: {minWords: null}}});
  await h.auth({uid: "student"}); h.get("essay-answer").input("A brief essay.");
  assert.equal(h.get("essay-submit").disabled, false); assert.equal(h.get("essay-word-count").textContent, "3 words");
  await h.get("essay-form").submit(); assert.equal(h.submits.length, 1); h.page.dispose();
});
test("failed grading shows saved submission and stops automatic polling", async () => {
  const h = harness(); h.setSession({...assigned, status: "completed", practice: {...assigned.practice, essayText: "Saved", scoring: {status: "failed"}}});
  await h.auth({uid: "student"}); assert.match(h.get("essay-status").textContent, /saved.*retried/);
  assert.equal(h.tasks.size, 0); assert.equal(h.get("essay-refresh").hidden, false); h.page.dispose();
});
test("late load responses cannot reveal the previous account's essay", async () => {
  let resolve; const waiting = new Promise(r => {resolve = r;}); const h = harness({loadSession: () => waiting});
  const loading = h.auth({uid: "student"}); await h.auth(null); resolve(assigned); await loading;
  assert.equal(h.get("essay-question-section").hidden, true);
  assert.match(h.navigations[0], /sign_in/); h.page.dispose();
});
test("another student's link cannot load or submit their essay and missing IDs show a clear error", async () => {
  const h = harness({query: "essayPracticeId=attempt&studentId=student", loadSession: async () => assert.fail("Cannot load another student's answer")}); await h.auth({uid: "another-student"});
  assert.equal(h.get("essay-form").hidden, true); h.get("essay-answer").value = "No write";
  assert.match(h.get("essay-status").textContent, /belongs to another student/);
  await h.get("essay-form").submit(); assert.deepEqual(h.submits, []); h.page.dispose();
  const missing = harness({query: ""}); await missing.auth({uid: "student"});
  assert.match(missing.get("essay-status").textContent, /practice ID is required/); missing.page.dispose();
});
test("polling stops after two minutes and leaves a manual refresh option", async () => {
  const h = harness(); h.setSession({...assigned, status: "completed", practice: {...assigned.practice, essayText: "Saved"}});
  await h.auth({uid: "student"}); h.advance(121000); await h.tick();
  assert.equal(h.tasks.size, 0); assert.match(h.get("essay-status").textContent, /Refresh the result/); h.page.dispose();
});
