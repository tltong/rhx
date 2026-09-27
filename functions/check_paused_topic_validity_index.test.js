const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index exports checkPausedTopicValidity", () => {
  assert.equal(
    typeof require("./index").checkPausedTopicValidity,
    "function",
  );
});
