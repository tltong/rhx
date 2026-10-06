const assert = require("node:assert/strict");
const test = require("node:test");

const studentPractice = require("./student_practice_module");

test("backend Student Practice exposes internal processing transitions", () => {
  assert.equal(
    typeof studentPractice.startPracticeCompletionProcessing,
    "function",
  );
  assert.equal(
    typeof studentPractice.markPracticeCompletionGenerating,
    "function",
  );
  assert.equal(
    typeof studentPractice.completePracticeCompletionProcessing,
    "function",
  );
  assert.equal(
    typeof studentPractice.failPracticeCompletionProcessing,
    "function",
  );
});
