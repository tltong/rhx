const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPlannedQuestionBatches,
  createQuestionBatchSizes,
} = require("./question_generation");

test("question generation batches never exceed five", () => {
  assert.deepEqual(createQuestionBatchSizes(12), [5, 5, 2]);
});

test("planned generation preserves every requested category count", () => {
  const categories = [
    { numberOfQuestions: 4, difficultyLevel: "Easy", hasDiagram: false },
    { numberOfQuestions: 3, difficultyLevel: "Hard", hasDiagram: true },
  ];
  const batches = createPlannedQuestionBatches(categories);
  const totals = new Map();

  batches.flatMap(({ categories: batchCategories }) => batchCategories)
    .forEach((category) => {
      const key = `${category.difficultyLevel}|${category.hasDiagram}`;
      totals.set(key, (totals.get(key) || 0) + category.numberOfQuestions);
    });

  assert.ok(batches.every(({ numberOfQuestions }) => numberOfQuestions <= 5));
  assert.equal(totals.get("Easy|false"), 4);
  assert.equal(totals.get("Hard|true"), 3);
});
