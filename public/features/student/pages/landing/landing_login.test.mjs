import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {runInNewContext} from "node:vm";

const script = await readFile(new URL("./landing.js", import.meta.url), "utf8");
const handleAuth = script.match(/async function handleAuthState\([\s\S]*?\n}/)[0];

function fixture({dashboard = true, dashboardError = null, loginError = null, pendingLogin = false, completedPracticeId = ""} = {}) {
  const events = [];
  const errors = [];
  const statuses = [];
  const coinEvents = [];
  const essayEvents = [];
  const scope = {
    authenticatedStudentId: null,
    INDEX_URL: "/index.html",
    welcomeEl: {textContent: "Welcome, Student."},
    console: {error: (...args) => errors.push(args)},
    window: {location: {replace: url => events.push(["redirect", url])}},
    studentCoinBalanceController: {
      stop: () => coinEvents.push(["stop"]),
      start: ({studentId}) => coinEvents.push(["start", studentId]),
    },
    essayPracticeRefreshController: {
      stop: () => essayEvents.push(["stop"]),
      start: studentId => essayEvents.push(["start", studentId]),
    },
    completionProcessingRefreshController: {
      stop: () => events.push(["stop"]),
      start: input => events.push(["start", input.studentId]),
    },
    setStatus: (...args) => statuses.push(args),
    loadAndRenderDashboard: async studentId => {
      events.push(["dashboard", studentId]);
      if (dashboardError) throw dashboardError;
      return dashboard;
    },
    recordStudentLogin: async ({studentId}) => {
      events.push(["login", studentId]);
      if (loginError) throw loginError;
      if (pendingLogin) await new Promise(() => {});
      return {isFirstLoginOfDay: true};
    },
    completedPracticeIdFromUrl: () => completedPracticeId,
    getPracticeById: async () => ({questions: [{syllabusId: "math", topicId: "fractions"}]}),
  };
  runInNewContext(handleAuth, scope);
  return {scope, events, errors, statuses, coinEvents, essayEvents};
}

test("a returning authenticated student watches coins and records login after the dashboard loads", async () => {
  const {scope, events, coinEvents, essayEvents} = fixture();
  await scope.handleAuthState({uid: "student-1"});
  assert.deepEqual(events, [["stop"], ["dashboard", "student-1"], ["login", "student-1"]]);
  await scope.handleAuthState({uid: "student-1"});
  assert.equal(events.filter(([action]) => action === "login").length, 1);
  assert.deepEqual(coinEvents, [["stop"], ["start", "student-1"]]);
  assert.deepEqual(essayEvents, [["stop"], ["start", "student-1"]]);
});

test("signed-out users and missing student dashboards do not record logins", async () => {
  const signedOut = fixture();
  await signedOut.scope.handleAuthState(null);
  assert.deepEqual(signedOut.events, [["stop"], ["redirect", "/index.html"]]);
  const missing = fixture({dashboard: false});
  await missing.scope.handleAuthState({uid: "student-1"});
  assert.equal(missing.events.some(([action]) => action === "login"), false);
});

test("dashboard failures do not create daily login records", async () => {
  const {scope, events, statuses} = fixture({dashboardError: new Error("Dashboard unavailable")});
  await scope.handleAuthState({uid: "student-1"});
  assert.equal(events.some(([action]) => action === "login"), false);
  assert.equal(statuses.at(-1)[0], "Dashboard unavailable");
});

test("login-record failures leave the dashboard and completion refresh usable", async () => {
  const {scope, events, errors, statuses} = fixture({loginError: new Error("Login write failed"), completedPracticeId: "practice-1"});
  await scope.handleAuthState({uid: "student-1"});
  await Promise.resolve();
  assert.equal(errors[0][0], "Could not record the student login.");
  assert.equal(scope.welcomeEl.textContent, "Welcome, Student.");
  assert.ok(events.some(([action]) => action === "start"));
  assert.equal(statuses.some(([, isError]) => isError === true), false);
});

test("a slow login write does not delay practice completion refresh", async () => {
  const {scope, events} = fixture({pendingLogin: true, completedPracticeId: "practice-1"});
  await scope.handleAuthState({uid: "student-1"});
  assert.ok(events.some(([action]) => action === "start"));
});

test("dashboard refresh after a practice does not record another login", async () => {
  const loadDashboard = script.match(/async function loadAndRenderDashboard\([\s\S]*?\n}/)[0];
  let rendered = 0;
  const scope = {
    authenticatedStudentId: "student-1",
    getStudentDashboard: async () => ({student: {id: "student-1"}}),
    renderDashboard: () => {rendered += 1;},
    recordStudentLogin: () => assert.fail("Dashboard refresh must not record login"),
  };
  runInNewContext(loadDashboard, scope);
  assert.equal(await scope.loadAndRenderDashboard("student-1"), true);
  assert.equal(rendered, 1);
  scope.authenticatedStudentId = "student-2";
  assert.equal(await scope.loadAndRenderDashboard("student-1"), false);
  assert.equal(rendered, 1);
});

test("an account switch during dashboard loading cannot start the old student's coin listener or login", async () => {
  let resolve;
  const dashboard = new Promise(done => {resolve = done;});
  const {scope, coinEvents, events} = fixture({dashboard});
  const first = scope.handleAuthState({uid: "student-1"});
  const second = scope.handleAuthState({uid: "student-2"});
  resolve(true);
  await Promise.all([first, second]);
  assert.deepEqual(coinEvents, [["stop"], ["stop"], ["start", "student-2"]]);
  assert.deepEqual(events.filter(([action]) => action === "login"), [["login", "student-2"]]);
});

test("sign-out during dashboard loading prevents a late coin listener and login", async () => {
  let resolve;
  const dashboard = new Promise(done => {resolve = done;});
  const {scope, coinEvents, events} = fixture({dashboard});
  const pending = scope.handleAuthState({uid: "student-1"});
  await scope.handleAuthState(null);
  resolve(true);
  await pending;
  assert.equal(scope.authenticatedStudentId, null);
  assert.deepEqual(coinEvents, [["stop"], ["stop"]]);
  assert.equal(events.some(([action]) => action === "login"), false);
});
