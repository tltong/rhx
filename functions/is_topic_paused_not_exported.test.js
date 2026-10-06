const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index does not publish isTopicPaused", () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      require("./index"),
      "isTopicPaused",
    ),
    false,
  );
});
