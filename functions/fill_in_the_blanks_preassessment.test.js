const test = require("node:test"), assert = require("node:assert/strict");
const {AssessmentFramework} = require("./features/assessment_framework/domain/assessment_framework");
const {CalculatePreAssessmentLevel} = require("./features/assessment_framework/application/calculate_pre_assessment_level");
const {placementSnapshot} = require("./features/fill_in_the_blanks_practice/domain/pre_assessment");
const bands = require("./schema/assessment_framework_schema").assessmentFrameworkPreAssessmentScoreBands;
function framework(changes = {}) {
  return {id: "framework", name: "Fill placement", frameworkType: "fillInTheBlanks", endLevelName: "Mastered",
    levels: ["first", "second"].map((id, index) => ({id, levelName: id, sequenceOrder: index + 1,
      criteria: {requiredPracticeCount: 2, minimumScore: 60, questionsPerPractice: 1, difficultyLevel: index ? "hard" : "easy"}})),
    preAssessment: {scoreLevelSplit: Object.fromEntries(bands.map(({field}, index) => [field, index === 6 ? "endLevel" : index >= 2 ? "second" : "first"]))}, ...changes};
}
test("backend and web accept one-passage placement config with Medium as the default", async () => {
  const web = await import("../public/features/assessment_framework/domain/assessment_framework.js?v=20261104-fill-preassessment-v3");
  for (const Type of [AssessmentFramework, web.AssessmentFramework]) {
    const value = new Type(framework());
    assert.equal(value.preAssessment.difficultyLevel, "medium");
    assert.equal(value.preAssessment.numberOfQuestions, undefined);
    assert.equal(value.preAssessment.difficultySplit, undefined);
    assert.equal(new Type(framework({preAssessment: {...framework().preAssessment, difficultyLevel: "hard"}})).preAssessment.difficultyLevel, "hard");
    assert.throws(() => new Type(framework({preAssessment: {...framework().preAssessment, difficultyLevel: "invalid"}})), /difficulty/);
    assert.throws(() => new Type(framework({preAssessment: {scoreLevelSplit: {}}})), /scoreLevelSplit/);
  }
});
test("placement uses the exact MCQ score bands, including their boundaries and end-level mapping", async () => {
  const {CalculatePreAssessmentLevel: Web} = await import("../public/features/assessment_framework/application/calculate_pre_assessment_level.js?v=20261104-fill-preassessment-v3");
  const snapshot = placementSnapshot(framework());
  for (const Type of [CalculatePreAssessmentLevel, Web]) {
    const calculator = new Type({getById: () => assert.fail("An assigned snapshot must retain its original mapping")});
    for (const [score, band] of [[0, 0], [39.99, 0], [40, 1], [49.99, 1], [50, 2], [60, 3], [70, 4], [80, 5], [89.99, 5], [90, 6], [100, 6]]) {
      const result = await calculator.execute({assessmentFrameworkId: snapshot.id, score, frameworkSnapshot: snapshot});
      assert.equal(result.scoreBand, bands[band].field);
      assert.equal(result.levelId, snapshot.preAssessment.scoreLevelSplit[bands[band].field]);
      assert.equal(result.isEndLevel, band === 6);
    }
    await assert.rejects(calculator.execute({assessmentFrameworkId: "different", score: 80, frameworkSnapshot: snapshot}), /snapshot/);
  }
});
test("placement snapshots are independent of later administrator edits", () => {
  const original = framework(), snapshot = placementSnapshot(original);
  original.preAssessment.scoreLevelSplit.over80Percent = "endLevel";
  original.levels[1].levelName = "Changed";
  assert.equal(snapshot.preAssessment.scoreLevelSplit.over80Percent, "second");
  assert.equal(snapshot.levels[1].levelName, "second");
});
