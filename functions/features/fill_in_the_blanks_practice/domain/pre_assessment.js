const {AssessmentFramework} = require("../../assessment_framework/domain/assessment_framework");
const {assessmentFrameworkPreAssessmentScoreBands} = require("../../../schema/assessment_framework_schema");
const PRE_ASSESSMENT = "pre assessment", ASSESSMENT = "assessment";
function practiceType(value = ASSESSMENT) {
  if (![ASSESSMENT, PRE_ASSESSMENT].includes(value)) throw new Error("Unknown fill-in-the-blanks practice type.");
  return value;
}
function placementSnapshot(input, expectedId = input?.id) {
  const framework = new AssessmentFramework(input);
  if (framework.id !== expectedId || framework.frameworkType !== "fillInTheBlanks" || !framework.preAssessment || !framework.levels.length) {
    throw new Error("Configure fill-in-the-blanks pre-assessment difficulty and score mapping first.");
  }
  return {id: framework.id, name: framework.name, frameworkType: framework.frameworkType, endLevelName: framework.endLevelName,
    levels: framework.levels.map(level => ({id: level.id, levelName: level.levelName, sequenceOrder: level.sequenceOrder,
      criteria: {requiredPracticeCount: level.criteria.requiredPracticeCount, minimumScore: level.criteria.minimumScore,
        questionsPerPractice: level.criteria.questionsPerPractice, difficultyLevel: level.criteria.difficultyLevel}})),
    preAssessment: {difficultyLevel: framework.preAssessment.difficultyLevel,
      scoreLevelSplit: Object.fromEntries(assessmentFrameworkPreAssessmentScoreBands.map(({field}) => [field, framework.preAssessment.scoreLevelSplit[field]]))}};
}
function sameSnapshot(first, second) {
  return JSON.stringify(placementSnapshot(first)) === JSON.stringify(placementSnapshot(second));
}
module.exports = {PRE_ASSESSMENT, ASSESSMENT, practiceType, placementSnapshot, sameSnapshot};
