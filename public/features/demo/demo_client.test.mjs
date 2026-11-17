import {test} from "node:test";
import assert from "node:assert/strict";
import {createDemoClient} from "./demo_module.js";

test("retrying start retains the capability; abandoning it starts a new run", async () => {
  const calls = [], tokens = ["a".repeat(43), "b".repeat(43)];
  const api = createDemoClient({makeToken: () => tokens.shift(), getApp: () => ({functions: () => ({
    httpsCallable: () => async input => {calls.push(input); return {data: {summary: {totalCoins: 1}}};},
  })})});
  await api.start(); await api.start();
  assert.equal(calls[0].token, calls[1].token);
  api.abandon(); await api.start();
  assert.notEqual(calls[1].token, calls[2].token);
});
test("lost finish responses retry the ended run without clearing a newly started capability", async () => {
  const calls = [], tokens = ["a".repeat(43), "b".repeat(43)]; let interrupt = true;
  const api = createDemoClient({makeToken: () => tokens.shift(), getApp: () => ({functions: () => ({
    httpsCallable: () => async input => {
      calls.push(input);
      if (input.action === "finishDemo" && interrupt) {interrupt = false; throw Object.assign(Error("Connection lost"), {code: "unavailable"});}
      return {data: {summary: {totalCoins: 1}}};
    },
  })})});
  await api.start(); const finishing = api.finish(); await api.start(); await finishing; await api.request("getSubjects");
  assert.deepEqual(calls.filter(call => call.action === "finishDemo").map(call => call.token), ["a".repeat(43), "a".repeat(43)]);
  assert.equal(calls.at(-1).token, "b".repeat(43));
});
