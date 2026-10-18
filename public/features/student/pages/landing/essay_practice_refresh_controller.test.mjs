import assert from "node:assert/strict";
import {test} from "node:test";
import {EssayPracticeRefreshController} from "./essay_practice_refresh_controller.js";
import {FirestoreStudentEssayPracticeRepository} from "../../../student_essay_practice/infrastructure/firestore_student_essay_practice_repository.js";

function deferred() {let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve};}
async function flush() {for (let i = 0; i < 8; i++) await Promise.resolve();}
function harness(refreshDashboard = async () => {}) {
  let changed, failures, stopped = 0, next = 0; const timers = new Map(), refreshed = [], errors = [];
  const controller = new EssayPracticeRefreshController({
    watchUpdates: (scope, change, error) => {changed = change; failures = error; return () => {stopped++;};},
    refreshDashboard: async id => {refreshed.push(id); await refreshDashboard(id);}, onError: error => errors.push(error),
    schedule: callback => {timers.set(++next, callback); return next;}, cancel: id => timers.delete(id),
  });
  return {controller, timers, refreshed, errors, changed: () => changed(), fail: error => failures(error), get stopped() {return stopped;},
    async runTimer() {const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); await flush();}};
}
test("essay assignment and scoring updates are coalesced and an in-flight refresh retains later changes", async () => {
  const pending = deferred(), h = harness(() => pending.promise); h.controller.start("student");
  h.changed(); h.changed(); assert.equal(h.timers.size, 1);
  await h.runTimer(); assert.deepEqual(h.refreshed, ["student"]);
  h.changed(); h.changed(); assert.equal(h.timers.size, 0);
  pending.resolve(); await flush(); assert.equal(h.timers.size, 1);
  await h.runTimer(); assert.deepEqual(h.refreshed, ["student", "student"]); h.controller.stop();
});
test("stopping or changing the student cancels subscriptions and ignores old events and failures", async () => {
  const h = harness(); h.controller.start("old"); h.changed(); const oldTimer = [...h.timers.values()][0];
  h.controller.start("new"); assert.equal(h.stopped, 1); oldTimer(); await flush(); assert.deepEqual(h.refreshed, []);
  h.changed(); await h.runTimer(); assert.deepEqual(h.refreshed, ["new"]);
  h.controller.stop(); h.changed(); h.fail(new Error("late")); assert.equal(h.timers.size, 0); assert.deepEqual(h.errors, []);
});
test("refresh failures are reported without preventing a later assignment update from refreshing", async () => {
  let fail = true; const h = harness(async () => {if (fail) throw new Error("Dashboard read failed");});
  h.controller.start("student"); h.changed(); await h.runTimer(); assert.equal(h.errors.length, 1);
  fail = false; h.changed(); await h.runTimer(); assert.equal(h.refreshed.length, 2); h.controller.stop();
});
test("essay feature repository watches both assignment and submission collections and releases both listeners", () => {
  const calls = [], stops = [];
  const repository = new FirestoreStudentEssayPracticeRepository({getFirestoreDb: () => ({collection: () => ({doc: () => ({collection: name => ({
    onSnapshot(change, error) {calls.push({name, change, error}); return () => stops.push(name);},
  })})})})});
  let changes = 0; const stop = repository.watchChanges("student", () => {changes++;}, () => {});
  assert.deepEqual(calls.map(c => c.name), ["assignedEssayPractices", "completedEssayPractices"]);
  calls[0].change(); calls[1].change(); assert.equal(changes, 2); stop(); assert.equal(stops.length, 2);
});
