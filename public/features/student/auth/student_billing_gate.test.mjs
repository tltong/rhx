import assert from "node:assert/strict";
import {test} from "node:test";
import {watchStudentBillingGate} from "./student_billing_gate.js";
import {studentSubscriptionAccess as clientAccess} from "../../syllabus_subscription/domain/student_subscription_access.js";
import accessModule from "../../../../functions/features/syllabus_subscription/domain/student_subscription_access.js";
const {studentSubscriptionAccess} = accessModule;
const now = new Date("2026-11-04T00:00:00Z");
function subscription(changes = {}) {
  return {paymentProvider: "stripe", paymentMode: "prod", paymentSubscriptionReference: "sub_student",
    activeUntil: new Date("2026-11-01Z"), applicationStatus: "active",
    renewalRecovery: {paymentProvider: "stripe", paymentMode: "prod", paymentSubscriptionReference: "sub_student",
      state: "held", graceUntil: new Date("2026-11-04Z")}, ...changes};
}
test("client and backend access enforce grace at its exact deadline without waiting for a worker", () => {
  for (const evaluate of [clientAccess, studentSubscriptionAccess]) {
    assert.equal(evaluate(subscription(), new Date(now - 1)).allowed, true);
    assert.equal(evaluate(subscription(), now).allowed, false);
    assert.equal(evaluate(subscription(), new Date(+now + 1)).allowed, false);
    assert.equal(evaluate(subscription({renewalRecovery: {...subscription().renewalRecovery, state: "pending_reset"}}), now).allowed, false);
    assert.equal(evaluate(subscription({renewalRecovery: {...subscription().renewalRecovery, state: "completed"},
      activeUntil: new Date("2026-12-04Z")}), now).allowed, true);
  }
});
test("one student's suspension has no effect on manual subscriptions or another student's paid period", () => {
  assert.equal(clientAccess(subscription(), now).allowed, false);
  assert.equal(clientAccess(subscription({renewalRecovery: null, activeUntil: new Date("2026-12-01Z")}), now).allowed, true);
  assert.equal(clientAccess({subscriptionType: "trial"}, now).allowed, true);
  assert.equal(clientAccess({subscriptionType: "ongoing", paymentProvider: null}, now).allowed, true);
});
test("client and backend retain cancelled paid or grace access only until its exact deadline", () => {
  for (const evaluate of [clientAccess, studentSubscriptionAccess]) {
    const end = new Date("2026-11-05T00:00:00Z");
    const value = subscription({activeUntil: end, renewalGraceUntil: new Date("2026-12-01Z"),
      subscriptionCancellation: {state: "cancelled", paymentMode: "prod", paymentSubscriptionReference: "sub_student", accessUntil: end}});
    assert.equal(evaluate(value, new Date(end - 1)).allowed, true);
    assert.equal(evaluate(value, end).allowed, false);
    value.activeUntil = new Date("2026-11-01Z");
    assert.equal(evaluate(value, new Date(end - 1)).allowed, true);
    assert.equal(evaluate(value, end).allowed, false);
    value.paymentSubscriptionReference = "sub_replacement";
    value.activeUntil = new Date("2026-12-01Z");
    assert.equal(evaluate(value, end).allowed, true);
  }
});
test("student auth gate waits for subscription data and rejects stale responses after an account switch", () => {
  let auth, subscriptions = new Map(), callbacks = [], redirects = [], disposed = 0;
  const stop = watchStudentBillingGate({observeAuth: cb => {auth = cb; return () => {disposed++;};},
    observeAccess: (id, callback, error) => {subscriptions.set(id, {callback, error}); return () => {disposed++;};},
    callback: user => callbacks.push(user?.uid || null), redirect: reason => redirects.push(reason)});
  auth({uid: "first"}); assert.deepEqual(callbacks, []);
  subscriptions.get("first").callback({allowed: true}); assert.deepEqual(callbacks, ["first"]);
  auth({uid: "second"}); subscriptions.get("first").callback({allowed: true});
  assert.deepEqual(callbacks, ["first"]);
  subscriptions.get("second").callback({allowed: false});
  assert.deepEqual(redirects, ["subscription-suspended"]);
  auth(null); assert.deepEqual(callbacks, ["first", null]);
  subscriptions.get("second").callback({allowed: true}); assert.deepEqual(callbacks, ["first", null]);
  stop(); assert.ok(disposed >= 3);
});
test("an access service error is distinct from a failed payment", () => {
  let errorCallback, redirect;
  watchStudentBillingGate({observeAuth: cb => {cb({uid: "student"}); return () => {};},
    observeAccess: (_id, _callback, onError) => {errorCallback = onError; return () => {};},
    callback() {throw Error("Must wait for trusted subscription data");}, redirect: value => {redirect = value;}});
  errorCallback(); assert.equal(redirect, "access-unavailable");
});

test("student access watch waits for server data, enforces expiry live, and observes recovery", async context => {
  const {watchStudentSubscriptionAccess, requireStudentSubscriptionAccess} =
    await import("../../syllabus_subscription/student_access_module.js");
  context.mock.timers.enable({apis: ["Date", "setTimeout"], now: Date.UTC(2026, 10, 3, 23, 59, 59, 950)});
  let next, visibility, getOptions;
  const raw = {...subscription(), subscriptionType: "ongoing", paymentCustomerReference: "cus_owner", planId: "monthly",
    activeUntil: new Date("2026-11-01Z"), renewalRecovery: {...subscription().renewalRecovery, graceUntil: new Date("2026-11-04Z")}};
  const snapshot = (data, fromCache = false) => ({exists: true, id: "student", data: () => data, metadata: {fromCache}});
  const reference = {onSnapshot(options, callback) {assert.equal(options.includeMetadataChanges, true); next = callback; return () => {};},
    async get(options) {getOptions = options; return snapshot(raw);}};
  const app = {firestore: () => ({collection: () => ({doc: () => reference})})};
  const previousFirebase = globalThis.firebase, previousDocument = globalThis.document;
  globalThis.firebase = {apps: [app], app: () => app, initializeApp: () => app, firestore: () => app.firestore()};
  globalThis.document = {visibilityState: "visible", addEventListener(_name, callback) {visibility = callback;}, removeEventListener() {}};
  const values = [];
  let stop;
  try {
    stop = watchStudentSubscriptionAccess("student", value => values.push(value.allowed), error => {throw error;});
    visibility(); next(snapshot(raw, true)); assert.deepEqual(values, [], "Cached data cannot unlock learning");
    next(snapshot(raw)); assert.deepEqual(values, [true]);
    context.mock.timers.tick(50); assert.deepEqual(values, [true, false]);
    await assert.rejects(() => requireStudentSubscriptionAccess("student"), error => error.code === "subscription-suspended");
    assert.deepEqual(getOptions, {source: "server"});
    next(snapshot({...raw, activeUntil: new Date("2026-12-04Z"), renewalRecovery: {...raw.renewalRecovery, state: "completed"}}));
    assert.deepEqual(values, [true, false, true]);
    stop(); context.mock.timers.tick(86400000); assert.equal(values.length, 3);
  } finally {stop?.(); globalThis.firebase = previousFirebase; globalThis.document = previousDocument;}
});

test("normal renewal collection has a finite provisional grace before a failure webhook arrives", () => {
  for (const evaluate of [clientAccess, studentSubscriptionAccess]) {
    const pending = subscription({renewalRecovery: null, renewalGraceUntil: new Date("2026-11-02Z")});
    assert.equal(evaluate(pending, new Date("2026-11-01T00:01Z")).reason, "renewal_pending");
    assert.equal(evaluate(pending, new Date("2026-11-02Z")).allowed, false);
    const legacy = subscription({renewalRecovery: null});
    assert.equal(evaluate(legacy, new Date("2026-11-03Z")).allowed, true);
    assert.equal(evaluate(legacy, new Date("2026-11-04Z")).allowed, false);
    assert.equal(evaluate({...pending, billingSummary: {subscriptionStatus: "canceled"}}, new Date("2026-11-01T00:01Z")).allowed, false);
  }
});
