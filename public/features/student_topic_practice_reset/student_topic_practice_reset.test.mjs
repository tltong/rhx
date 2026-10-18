import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {createTopicResetClient} from "./student_topic_practice_reset_module.js";
import {mountTopicResetAdmin} from "./pages/admin/student_topic_practice_reset_admin.js";
import {FirestoreEssayGenerationRepository} from "../student_essay_practice_generator/infrastructure/firestore_essay_generation_repository.js";
import {FirestorePracticeResultRepository as WebResultRepository} from "../practice_result/infrastructure/firestore_practice_result_repository.js";
const require = createRequire(import.meta.url);
const {fakeFirestore, deferred} = require("../../../functions/features/student_topic_practice_reset/test_support");
const {FirestorePracticeResultRepository: BackendResultRepository} = require("../../../functions/features/practice_result/infrastructure/firestore_practice_result_repository");
const scope = {studentId: "s", syllabusId: "language", topicId: "writing"};

test("web client sends a verified admin bearer token, preserves reset IDs and never accepts a changed account", async () => {
  let current = {uid: "admin", email: "admin@example.com", emailVerified: true, getIdToken: async () => "id-token"};
  const calls = [];
  const client = createTopicResetClient({getUser: () => current, requireAdmin: async () => ({email: "admin@example.com"}), endpoint: "/reset",
    fetchImpl: async (url, options) => {calls.push({url, options}); return {ok: true, json: async () => ({result: {status: "completed"}})};}});
  assert.equal((await client.requestStudentTopicPracticeReset({...scope, resetId: "reset-1"})).status, "completed");
  assert.equal(calls[0].url, "/reset"); assert.equal(calls[0].options.headers.Authorization, "Bearer id-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {action: "request", input: {...scope, resetId: "reset-1"}});
  current.emailVerified = false;
  await assert.rejects(client.previewStudentTopicPracticeReset(scope), /administrator account changed/); assert.equal(calls.length, 1);
  current = {...current, emailVerified: true, getIdToken: async () => {current = {...current, uid: "different"}; return "token";}};
  await assert.rejects(client.previewStudentTopicPracticeReset(scope), /account changed/); assert.equal(calls.length, 1);
});

test("web client reports server permission failures and the ID needed to resume a partial reset", async () => {
  const user = {uid: "admin", email: "admin@example.com", emailVerified: true, getIdToken: async () => "token"};
  const client = createTopicResetClient({getUser: () => user, requireAdmin: async () => ({email: user.email}),
    fetchImpl: async () => ({ok: false, json: async () => ({error: {code: "permission-denied", message: "Administrator required"}})})});
  await assert.rejects(client.requestStudentTopicPracticeReset({...scope, resetId: "saved-id"}), {code: "permission-denied", resetId: "saved-id"});
});

class Element {
  constructor() {this.value = ""; this.textContent = ""; this.children = []; this.hidden = false; this.disabled = false; this.listeners = new Map(); this.classList = {toggle() {}};}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children; this.value = "";}
  addEventListener(name, callback) {this.listeners.set(name, callback);}
  edit(value, event = "change") {this.value = value; this.listeners.get(event)?.();}
}
function page(options = {}) {
  const elements = new Map(), get = id => {if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id);};
  let onAuth; const calls = {preview: [], request: [], status: []}, timers = new Map(); let timerId = 0;
  const previewValue = {scope, student: {id: "s", name: "Student"}, syllabus: {id: "language", subject: "Language"}, topic: {id: "writing", name: "Writing"},
    totalRecords: 5, counts: {completedEssays: 2, essayResults: 3}, warnings: [], protectedEssayResults: 0, activeReset: null};
  const view = mountTopicResetAdmin({root: {getElementById: get, createElement: () => new Element()},
    loadStudents: options.loadStudents ?? (async () => [{id: "s", name: "Student"}]),
    loadSyllabuses: async () => [{id: "language", subject: "Language", level: "primary", year: 3, topics: [{id: "writing", topicName: "Writing"}, {id: "reading", topicName: "Reading"}]}],
    preview: async input => {calls.preview.push(input); return options.preview ? options.preview(input) : previewValue;},
    request: async input => {calls.request.push(input); return options.request ? options.request(input) : {...input, status: "completed", stage: "completed", deletedCounts: {essays: 5}, plannedCounts: {essays: 5}};},
    status: async input => {calls.status.push(input); return options.status ? options.status(input) : null;},
    subscribeAuth: callback => {onAuth = callback; callback({uid: "admin", email: "admin@example.com", emailVerified: true}); return () => {};},
    schedule: fn => {timers.set(++timerId, fn); return timerId;}, cancel: id => timers.delete(id), newId: () => "stable-id",
  });
  return {view, get, calls, timers, previewValue, auth: user => onAuth(user), select() {get("reset-student").edit("s"); get("reset-syllabus").edit("language"); get("reset-topic").edit("writing");}};
}

test("admin page populates topics and allows reset after preview without typing the student ID", async () => {
  const h = page(); await h.view.ready; h.select();
  assert.equal(h.get("reset-topic").children.length, 3); assert.equal(h.get("preview-reset").disabled, false);
  await h.view.execute(); assert.equal(h.calls.request.length, 0);
  await h.view.showPreview(); assert.deepEqual(h.calls.preview, [scope]);
  assert.equal(h.get("reset-counts").children.length, 2); assert.equal(h.get("execute-reset").disabled, false);
  await h.view.execute(); assert.deepEqual(h.calls.request, [{...scope, resetId: "stable-id"}]);
  assert.equal(h.get("reset-progress").value, 5); assert.match(h.get("reset-status").textContent, /Topic reset completed/);
  assert.equal(h.timers.size, 0); assert.equal(h.get("execute-reset").disabled, true); h.view.dispose();
});

test("target changes invalidate the preview and discard a stale preview response", async () => {
  const delayed = deferred(), h = page({preview: () => delayed.promise}); await h.view.ready; h.select();
  const pending = h.view.showPreview(); h.get("reset-topic").edit("reading");
  delayed.resolve(h.previewValue); await pending;
  assert.equal(h.get("reset-preview").hidden, true); assert.equal(h.get("execute-reset").disabled, true); h.view.dispose();
});

test("failed resets resume the same student, topic and reset ID with the maintenance lock retained", async () => {
  let fail = true;
  const failed = {...scope, resetId: "stable-id", status: "failed", stage: "deleting", error: "Connection lost", deletedCounts: {essays: 1}, plannedCounts: {essays: 5}};
  const h = page({request: async input => {if (fail) throw new Error("Lost response"); return {...input, status: "completed", stage: "completed"};}, status: async () => failed});
  await h.view.ready; h.select(); await h.view.showPreview(); await h.view.execute();
  assert.equal(h.get("resume-reset").hidden, false); assert.match(h.get("reset-status").textContent, /maintenance remains active/);
  assert.equal(h.get("execute-reset").disabled, true);
  await h.view.execute(); assert.equal(h.calls.request.length, 1, "failed resets must resume their existing ID");
  fail = false; await h.view.execute(true);
  assert.deepEqual(h.calls.request[1], h.calls.request[0]); assert.equal(h.get("resume-reset").hidden, true); h.view.dispose();
});

test("a still-pending request keeps polling when prevalidation has not created its job document yet", async () => {
  const pending = deferred(), h = page({request: () => pending.promise});
  await h.view.ready; h.select(); await h.view.showPreview();
  const running = h.view.execute(); await h.view.refresh();
  assert.equal(h.get("resume-reset").hidden, true); assert.equal(h.timers.size, 1);
  pending.resolve({...scope, resetId: "stable-id", status: "completed", stage: "completed"}); await running;
  assert.equal(h.timers.size, 0); assert.match(h.get("reset-status").textContent, /completed/); h.view.dispose();
});

test("an active reset from another selected topic can be resumed using its actual scope", async () => {
  const h = page(); await h.view.ready; h.select();
  h.previewValue.activeReset = {...scope, topicId: "reading", resetId: "existing-id", status: "failed", stage: "deleting", error: "Retry"};
  await h.view.showPreview(); assert.equal(h.get("execute-reset").disabled, true);
  await h.view.execute(true); assert.equal(h.calls.request[0].topicId, "reading"); assert.equal(h.calls.request[0].resetId, "existing-id"); h.view.dispose();
});

test("sign-out discards pending admin reads, clears sensitive data and disables destructive controls", async () => {
  const students = deferred(), h = page({loadStudents: () => students.promise});
  h.auth(null); students.resolve([{id: "s", name: "Student"}]); await h.view.ready;
  assert.equal(h.get("reset-student").children.length, 0); assert.equal(h.get("preview-reset").disabled, true);
  await h.view.showPreview(); await h.view.execute(); assert.equal(h.calls.preview.length, 0); assert.equal(h.calls.request.length, 0);
  assert.match(h.get("reset-status").textContent, /account changed/); h.view.dispose();
});

test("essay generation cannot recreate its job after the source completion was reset", async () => {
  const store = fakeFirestore(), repository = new FirestoreEssayGenerationRepository({getFirestoreDb: () => store.db, serverTimestamp: () => new Date()});
  await assert.rejects(repository.claim({studentId: "s", completedEssayPracticeId: "source"}, {
    sourceCompletion: {completedAt: new Date(), syllabusId: "language", topicId: "writing"},
  }), {code: "topic-practice-reset"}); assert.equal(store.documents.size, 0);
});

for (const [layer, Repository] of [["backend", BackendResultRepository], ["web", WebResultRepository]]) {
  test(layer + ": practice results reject maintenance and deleted assignments after reset, while retaining duplicate protection", async () => {
    const store = fakeFirestore(), repository = new Repository({getFirestoreDb: () => store.db, getFirestoreDbOperation: () => store.db});
    const key = encodeURIComponent(JSON.stringify([scope.syllabusId, scope.topicId]));
    const result = {studentId: "s", practiceId: "p", submittedAt: new Date(), timeTakenSeconds: 5, score: 100,
      questionsCorrect: 1, totalQuestions: 1, answers: {q: {selectedOption: "a", correctAnswer: "a", isCorrect: true}}};
    const options = {questionReferences: [scope]};
    store.documents.set("studentPracticeResets/s", {activeResetId: "reset-1"});
    await assert.rejects(repository.create(result, options), {code: "student-maintenance"});
    store.documents.set("studentPracticeResets/s", {topics: {[key]: {revision: 1}}});
    await assert.rejects(repository.create(result, options), {code: "topic-practice-reset"});
    assert.equal(store.documents.has("practiceResults/p/studentSubmissions/s"), false);
    store.documents.set("studentPractices/s/assignedPractices/p", {});
    await repository.create(result, options);
    assert.equal(store.documents.get("practiceResults/p/studentSubmissions/s").score, 100);
    await assert.rejects(repository.create(result, options), {code: "practice-result-already-exists"});
  });
}
