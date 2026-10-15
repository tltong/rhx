import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {StudentCoinBalanceController} from "./student_coin_balance_controller.js";

function element() {
  const classes = new Set();
  return {hidden: true, textContent: "", className: "", children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    classList: {
    toggle(name, enabled) {if (enabled) classes.add(name); else classes.delete(name);},
    contains: name => classes.has(name),
  }};
}
function fixture({watchError = null, config = {recentActivitiesLimit: 5}, recentEntries = []} = {}) {
  const subscriptions = [];
  const errors = [];
  const recentCalls = [];
  const section = element();
  const balance = element();
  const status = element();
  const activityList = element();
  const activityStatus = element();
  const controller = new StudentCoinBalanceController({
    section, balance, status, activityList, activityStatus,
    defaultRecentActivitiesLimit: 5,
    formatter: new Intl.NumberFormat("en-US"), createElement: element,
    logError: error => errors.push(error),
    getRewardConfig: async () => config,
    listRecentStudentRewardActivities: async input => {
      recentCalls.push(input);
      return recentEntries;
    },
    watchStudentRewardTotal(input) {
      if (watchError) throw watchError;
      const subscription = {...input, stops: 0};
      subscriptions.push(subscription);
      return () => {subscription.stops++;};
    },
  });
  return {controller, section, balance, status, activityList, activityStatus,
    subscriptions, errors, recentCalls};
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("shows loading, zero coins, and live login and mission reward totals", () => {
  const {controller, section, balance, status, subscriptions} = fixture();
  controller.start({studentId: "student-1"});
  assert.equal(section.hidden, false);
  assert.equal(balance.textContent, "—");
  assert.equal(status.textContent, "Loading your coins...");
  assert.equal(status.hidden, false);
  assert.equal(subscriptions[0].studentId, "student-1");
  for (const value of [0, 1, 26, 1000, Number.MAX_SAFE_INTEGER]) {
    subscriptions[0].onChange(value);
    assert.equal(balance.textContent, new Intl.NumberFormat("en-US").format(value));
    assert.equal(status.hidden, true);
    assert.equal(status.classList.contains("is-error"), false);
  }
});

test("coin read failures show unavailable instead of a fabricated zero and can recover", () => {
  const {controller, balance, status, subscriptions, errors} = fixture();
  controller.start({studentId: "student-1"});
  const error = new Error("Reward read unavailable");
  subscriptions[0].onError(error);
  assert.equal(balance.textContent, "—");
  assert.equal(status.textContent, "Could not load your coins. Refresh to try again.");
  assert.equal(status.hidden, false);
  assert.equal(status.classList.contains("is-error"), true);
  assert.deepEqual(errors, [error]);
  subscriptions[0].onChange(25);
  assert.equal(balance.textContent, "25");
  assert.equal(status.hidden, true);
  assert.equal(status.classList.contains("is-error"), false);
});

test("a later listener failure preserves the last known balance and marks it out of date", () => {
  const {controller, balance, status, subscriptions} = fixture();
  controller.start({studentId: "student-1"});
  subscriptions[0].onChange(25);
  subscriptions[0].onError(new Error("Connection failed"));
  assert.equal(balance.textContent, "25");
  assert.equal(status.textContent, "Coin balance may be out of date. Refresh to try again.");
  subscriptions[0].onChange(50);
  assert.equal(balance.textContent, "50");
  assert.equal(status.hidden, true);
});

test("changing students clears old coins, unsubscribes and ignores queued old callbacks", () => {
  const {controller, balance, section, status, subscriptions, errors} = fixture();
  controller.start({studentId: "student-1"});
  subscriptions[0].onChange(50);
  controller.start({studentId: "student-2"});
  assert.equal(subscriptions[0].stops, 1);
  assert.equal(section.hidden, false);
  assert.equal(balance.textContent, "—");
  subscriptions[1].onChange(3);
  subscriptions[0].onChange(999);
  subscriptions[0].onError(new Error("Old listener failed"));
  assert.equal(balance.textContent, "3");
  assert.equal(status.hidden, true);
  assert.equal(errors.length, 0);
  controller.stop();
  controller.stop();
  assert.equal(subscriptions[1].stops, 1);
  assert.equal(section.hidden, true);
  assert.equal(balance.textContent, "—");
  subscriptions[1].onChange(100);
  assert.equal(balance.textContent, "—");
});

test("a synchronous watcher failure stays local to the coin section", () => {
  const error = new Error("Signed-in account unavailable");
  const {controller, section, balance, status, errors} = fixture({watchError: error});
  assert.doesNotThrow(() => controller.start({studentId: "student-1"}));
  assert.equal(section.hidden, false);
  assert.equal(balance.textContent, "—");
  assert.equal(status.classList.contains("is-error"), true);
  assert.deepEqual(errors, [error]);
  controller.stop();
  assert.equal(section.hidden, true);
});

test("loads the admin-configured number of recent activities and refreshes after total changes", async () => {
  const entries = [
    {categoryId: "dailyMissionCompletion", coins: 25, details: {}},
    {categoryId: "loginStreak", coins: 5, details: {streakDays: 7}},
  ];
  const {controller, subscriptions, activityList, activityStatus, recentCalls} = fixture({
    config: {recentActivitiesLimit: 8}, recentEntries: entries,
  });
  controller.start({studentId: "student-1"});
  subscriptions[0].onChange(30);
  await settle();
  assert.deepEqual(recentCalls, [{studentId: "student-1", limit: 8}]);
  assert.equal(activityList.children.length, 2);
  assert.equal(activityList.children[0].children[0].textContent, "Daily mission completed");
  assert.equal(activityList.children[0].children[1].textContent, "+25 coins");
  assert.equal(activityList.children[1].children[0].textContent, "7-day login streak");
  assert.equal(activityStatus.hidden, true);
  subscriptions[0].onChange(50);
  await settle();
  assert.equal(recentCalls.length, 2);
});

test("uses five recent activities when reward configuration has not been saved", async () => {
  const {controller, subscriptions, recentCalls, activityStatus} = fixture({config: null});
  controller.start({studentId: "student-1"});
  subscriptions[0].onChange(0);
  await settle();
  assert.deepEqual(recentCalls, [{studentId: "student-1", limit: 5}]);
  assert.equal(activityStatus.textContent, "No coin rewards yet.");
  assert.equal(activityStatus.hidden, false);
});

test("the landing coin section precedes the syllabus and has accessible updates and lifecycle cleanup", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("./landing.html", import.meta.url), "utf8"),
    readFile(new URL("./landing.js", import.meta.url), "utf8"),
  ]);
  assert.ok(html.indexOf('id="student-additional-mission-section"') < html.indexOf('id="student-coins-section"'));
  assert.ok(html.indexOf('id="student-coins-section"') < html.indexOf('id="syllabus-progress-section"'));
  assert.match(html, /id="student-coins-total"[^>]+aria-live="polite"/);
  assert.match(html, /id="student-coin-activity-list"/);
  assert.match(html, /id="student-coin-activity-status"[^>]+role="status"/);
  assert.match(script, /watchStudentRewardTotal/);
  assert.match(script, /listRecentStudentRewardActivities/);
  assert.match(script, /studentCoinBalanceController\.start\(\{studentId: authUser\.uid\}\)/);
  assert.match(script, /await signOutStudent\(\);\s*studentCoinBalanceController\.stop\(\)/);
  assert.match(script, /"beforeunload", \(\) => \{\s*studentCoinBalanceController\.stop\(\)/);
});
