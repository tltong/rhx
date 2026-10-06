const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index does not publish checkPausedTopicValidity", () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      require("./index"),
      "checkPausedTopicValidity",
    ),
    false,
  );
});
