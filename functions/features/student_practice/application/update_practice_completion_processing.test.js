const assert = require("node:assert/strict");
const test = require("node:test");

const {
  UpdatePracticeCompletionProcessing,
} = require("./update_practice_completion_processing");

test("processing update use case delegates every state transition", async () => {
  const calls = [];
  const useCase = new UpdatePracticeCompletionProcessing({
    processingRepository: {
      async markProcessing(input) {
        calls.push(["processing", input]);
      },
      async markGenerating(input) {
        calls.push(["generating", input]);
      },
      async markCompleted(input) {
        calls.push(["completed", input]);
      },
      async markFailed(input) {
        calls.push(["failed", input]);
      },
    },
  });
  const input = {studentId: "student-1", practiceId: "practice-1"};

  await useCase.markProcessing(input);
  await useCase.markGenerating(input);
  await useCase.markCompleted(input);
  await useCase.markFailed(input);

  assert.deepEqual(calls, [
    ["processing", input],
    ["generating", input],
    ["completed", input],
    ["failed", input],
  ]);
});
