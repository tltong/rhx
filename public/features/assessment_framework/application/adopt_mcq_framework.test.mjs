import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {adoptMcqFramework, adoptMcqPreAssessment} from "./adopt_mcq_framework.js";
import {AssessmentFramework as WebFramework} from "../domain/assessment_framework.js";
const require = createRequire(import.meta.url);
const {AssessmentFramework: BackendFramework} = require("../../../../functions/features/assessment_framework/domain/assessment_framework");
function source() {return {id: "mcq", frameworkType: "normal", endLevelName: "Fluent", levels: [
  {id: "b", levelName: "Developing", sequenceOrder: 2, criteria: {requiredPracticeCount: 20, questionsPerPractice: 15, minimumScore: 85, difficultyLevel: "Hard"}},
  {id: "a", levelName: "Starting", sequenceOrder: 1, criteria: {requiredPracticeCount: 10, questionsPerPractice: 12, minimumScore: 65, difficultyLevel: "Easy"}},
]};}
for (const frameworkType of ["essay", "fillInTheBlanks"]) {
  test(frameworkType + ": copies only requested settings in source order, retaining target IDs/counts and allowing independent edits", () => {
    const mcq = source(), before = structuredClone(mcq);
    const target = {frameworkType, levels: [{id: "existing-first", levelName: "Foundation", criteria: {requiredPracticeCount: 4}},
      {id: "existing-second", levelName: "Advanced", criteria: {requiredPracticeCount: 6}}]};
    const draft = adoptMcqFramework(mcq, target);
    assert.equal(draft.endLevelName, "Fluent");
    assert.deepEqual(draft.levels.map(level => [level.id, level.levelName, level.sequenceOrder, level.criteria.requiredPracticeCount, level.criteria.minimumScore, level.criteria.difficultyLevel, level.criteria.questionsPerPractice]),
      [["existing-first", "Starting", 1, 4, 65, "Easy", 1], ["existing-second", "Developing", 2, 6, 85, "Hard", 1]]);
    draft.levels[0].criteria.minimumScore = 77; draft.levels[0].criteria.difficultyLevel = "Medium";
    assert.deepEqual(mcq, before); assert.equal(target.levels[0].levelName, "Foundation");
  });
  test(frameworkType + ": a new framework uses independent IDs and type-appropriate defaults", () => {
    const draft = adoptMcqFramework(source(), {frameworkType});
    assert.ok(draft.levels.every(level => level.id === null && level.criteria.requiredPracticeCount === 3 && level.criteria.questionsPerPractice === 1));
  });
}
test("rejects ineligible source/target, missing levels, invalid copied criteria and removal of mapped placement levels", () => {
  for (const invalid of [null, {...source(), frameworkType: "essay"}, {...source(), levels: []}]) assert.throws(() => adoptMcqFramework(invalid, {frameworkType: "essay"}));
  assert.throws(() => adoptMcqFramework(source(), {frameworkType: "normal"}));
  for (const criteria of [{minimumScore: 101}, {difficultyLevel: "Extreme"}]) {
    const s = source(); Object.assign(s.levels[0].criteria, criteria); assert.throws(() => adoptMcqFramework(s, {frameworkType: "essay"}));
  }
  assert.throws(() => adoptMcqFramework(source(), {frameworkType: "fillInTheBlanks", preAssessment: {scoreLevelSplit: {under40Percent: "removed"}}}), /pre-assessment mapping/);
});
test("web and backend accept all three per-level essay difficulties and reject invalid difficulty/count", () => {
  for (const Type of [WebFramework, BackendFramework]) {
    const input = {id: "essay", name: "Essay", frameworkType: "essay", endLevelName: "Ready", levels: ["easy", "medium", "hard"].map((difficultyLevel, index) => ({
      id: "level-" + index, levelName: difficultyLevel, sequenceOrder: index + 1,
      criteria: {requiredPracticeCount: 2, minimumScore: 70, questionsPerPractice: 1, difficultyLevel}}))};
    assert.equal(new Type(input).levels.length, 3);
    for (const criteria of [{difficultyLevel: "extreme"}, {questionsPerPractice: 2}]) {
      const bad = structuredClone(input); Object.assign(bad.levels[0].criteria, criteria); assert.throws(() => new Type(bad));
    }
  }
});

test("reordered name matches still preserve every available target level ID", () => {
  const target = {frameworkType: "fillInTheBlanks", levels: [{id: "first", levelName: "Other", criteria: {requiredPracticeCount: 4}},
    {id: "second", levelName: "Starting", criteria: {requiredPracticeCount: 5}}], preAssessment: {scoreLevelSplit: {under40Percent: "first", over90Percent: "second"}}};
  const draft = adoptMcqFramework(source(), target);
  assert.deepEqual(draft.levels.map(level => level.id), ["second", "first"]);
  assert.deepEqual(draft.levels.map(level => level.criteria.requiredPracticeCount), [5, 4]);
});

const bands = ["under40Percent", "over40Percent", "over50Percent", "over60Percent", "over70Percent", "over80Percent", "over90Percent"].map(field => ({field}));
function placementSource() {
  return {...source(), preAssessment: {numberOfQuestions: 12, difficultySplit: {easyPercentage: 20, mediumPercentage: 50, hardPercentage: 30},
    scoreLevelSplit: Object.fromEntries(bands.map(({field}, index) => [field, index === 6 ? "endLevel" : index >= 3 ? "b" : "a"]))}};
}
function placementTarget() {
  return {frameworkType: "fillInTheBlanks", levels: [{id: "target-first", levelName: "Starting", sequenceOrder: 1},
    {id: "target-second", levelName: "Developing", sequenceOrder: 2}]};
}
test("pre-assessment adoption translates MCQ level references, preserves chosen difficulty, and copies no counts/split", () => {
  const mcq = placementSource(), before = structuredClone(mcq), target = placementTarget();
  target.preAssessment = {difficultyLevel: "hard", scoreLevelSplit: {}};
  const draft = adoptMcqPreAssessment(mcq, target, bands);
  assert.equal(draft.difficultyLevel, "hard"); assert.equal(draft.numberOfQuestions, undefined); assert.equal(draft.difficultySplit, undefined);
  assert.deepEqual(Object.values(draft.scoreLevelSplit), ["target-first", "target-first", "target-first", "target-second", "target-second", "target-second", "endLevel"]);
  draft.scoreLevelSplit.under40Percent = "endLevel";
  assert.deepEqual(mcq, before); assert.deepEqual(target.preAssessment.scoreLevelSplit, {});
});
test("pre-assessment adopts by level name even when target ordering differs and falls back to sequence for renamed levels", () => {
  const target = placementTarget(); target.levels.reverse();
  target.levels[0].sequenceOrder = 1; target.levels[1].sequenceOrder = 2;
  const named = adoptMcqPreAssessment(placementSource(), target, bands);
  assert.equal(named.scoreLevelSplit.under40Percent, "target-first");
  target.levels[0].levelName = "படி ஒன்று"; target.levels[1].levelName = "படி இரண்டு";
  const sequenced = adoptMcqPreAssessment(placementSource(), target, bands);
  assert.equal(sequenced.scoreLevelSplit.under40Percent, "target-second");
  assert.equal(sequenced.difficultyLevel, "medium");
});
test("pre-assessment adoption rejects incompatible or incomplete mappings without mutating the target", () => {
  const cases = [
    [null, placementTarget()], [{...placementSource(), frameworkType: "essay"}, placementTarget()],
    [source(), placementTarget()], [placementSource(), {...placementTarget(), frameworkType: "essay"}],
    [placementSource(), {...placementTarget(), levels: [{levelName: "Unsaved", sequenceOrder: 1}]}],
    [placementSource(), {...placementTarget(), levels: [{id: "only", levelName: "Other", sequenceOrder: 9}]}],
    [placementSource(), {...placementTarget(), preAssessment: {difficultyLevel: "invalid"}}],
  ];
  const incomplete = placementSource(); delete incomplete.preAssessment.scoreLevelSplit.over50Percent;
  cases.push([incomplete, placementTarget()]);
  for (const [mcq, target] of cases) {
    const before = structuredClone(target); assert.throws(() => adoptMcqPreAssessment(mcq, target, bands)); assert.deepEqual(target, before);
  }
});
