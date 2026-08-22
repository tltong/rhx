const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
} = require("../../../schema/assessment_framework_schema");
const {
  CalculateAssessmentProgression,
} = require("./calculate_assessment_progression");

function createFramework() {
  return {
    id: "framework-1",
    endLevelName: "Ready",
    levels: [
      {
        id: "level-1",
        levelName: "Starting",
        sequenceOrder: 1,
        criteria: {
          requiredPracticeCount: 2,
          minimumScore: 80,
          questionsPerPractice: 10,
          difficultyLevel: "Easy",
        },
      },
      {
        id: "level-2",
        levelName: "Developing",
        sequenceOrder: 2,
        criteria: {
          requiredPracticeCount: 2,
          minimumScore: 85,
          questionsPerPractice: 12,
          difficultyLevel: "Medium",
        },
      },
    ],
  };
}

function createUseCase() {
  return new CalculateAssessmentProgression({
    async getById(id) {
      return id === "framework-1" ? createFramework() : null;
    },
  });
}

test("retains the current level until enough scores meet the threshold", async () => {
  const result = await createUseCase().execute({
    assessmentFrameworkId: "framework-1",
    currentLevelId: "level-1",
    scores: [95, 70],
  });

  assert.equal(result.previousLevelId, "level-1");
  assert.equal(result.levelId, "level-1");
  assert.equal(result.levelChanged, false);
  assert.equal(result.qualifyingPracticeCount, 1);
});

test("advances exactly one level when the criteria are met", async () => {
  const result = await createUseCase().execute({
    assessmentFrameworkId: "framework-1",
    currentLevelId: "level-1",
    scores: [95, 80, 45],
  });

  assert.equal(result.levelId, "level-2");
  assert.equal(result.levelChanged, true);
  assert.equal(result.isEndLevel, false);
});

test("completes the framework after passing the final level", async () => {
  const result = await createUseCase().execute({
    assessmentFrameworkId: "framework-1",
    currentLevelId: "level-2",
    scores: [90, 85],
  });

  assert.equal(result.levelId, ASSESSMENT_FRAMEWORK_END_LEVEL_ID);
  assert.equal(result.levelName, "Ready");
  assert.equal(result.isEndLevel, true);
});

test("uses the lowest level when currentLevelId is not set", async () => {
  const result = await createUseCase().execute({
    assessmentFrameworkId: "framework-1",
    scores: [],
  });

  assert.equal(result.previousLevelId, "level-1");
  assert.equal(result.levelId, "level-1");
  assert.equal(result.criteria.difficultyLevel, "Easy");
});
