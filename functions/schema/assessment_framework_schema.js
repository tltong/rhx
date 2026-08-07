const ASSESSMENT_FRAMEWORKS_COLLECTION = "assessmentFrameworks";
const ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION = "levels";
const ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION = "preAssessment";
const ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID = "default";
const ASSESSMENT_FRAMEWORK_END_LEVEL_ID = "endLevel";

const assessmentFrameworkDocumentIdPattern = "[auto_generated_id]";
const assessmentFrameworkLevelDocumentIdPattern = "[level_id]";
const assessmentFrameworkPreAssessmentDocumentIdPattern =
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID;
const assessmentFrameworkPreAssessmentDifficultyLevels = Object.freeze([
  "easy",
  "medium",
  "hard"
]);
const assessmentFrameworkPreAssessmentScoreBands = Object.freeze([
  Object.freeze({
    field: "under40Percent",
    label: "Under 40%",
    minimumScore: 0
  }),
  Object.freeze({
    field: "over40Percent",
    label: "Over 40%",
    minimumScore: 40
  }),
  Object.freeze({
    field: "over50Percent",
    label: "Over 50%",
    minimumScore: 50
  }),
  Object.freeze({
    field: "over60Percent",
    label: "Over 60%",
    minimumScore: 60
  }),
  Object.freeze({
    field: "over70Percent",
    label: "Over 70%",
    minimumScore: 70
  }),
  Object.freeze({
    field: "over80Percent",
    label: "Over 80%",
    minimumScore: 80
  }),
  Object.freeze({
    field: "over90Percent",
    label: "Over 90%",
    minimumScore: 90
  })
]);

const assessmentFrameworkSchema = {
  collection: ASSESSMENT_FRAMEWORKS_COLLECTION,
  documentId: assessmentFrameworkDocumentIdPattern,
  fields: {
    name: "string",
    endLevelName: "string"
  },
  subcollections: {
    levels: {
      collection: ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
      documentId: assessmentFrameworkLevelDocumentIdPattern,
      fields: {
        levelName: "string",
        sequenceOrder: "number",
        criteria: {
          type: "map",
          fields: {
            requiredPracticeCount: "number",
            minimumScore: "number",
            questionsPerPractice: "number",
            difficultyLevel: "string"
          }
        }
      }
    },
    preAssessment: {
      collection: ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION,
      documentId: assessmentFrameworkPreAssessmentDocumentIdPattern,
      fields: {
        numberOfQuestions: "number",
        difficultySplit: {
          type: "map",
          fields: {
            easyPercentage: "number",
            mediumPercentage: "number",
            hardPercentage: "number"
          }
        },
        scoreLevelSplit: {
          type: "map",
          fields: Object.fromEntries(
            assessmentFrameworkPreAssessmentScoreBands.map(({ field }) => [
              field,
              {
                type: "string",
                endLevelValue: ASSESSMENT_FRAMEWORK_END_LEVEL_ID
              }
            ])
          )
        }
      }
    }
  }
};

module.exports = {
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION,
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID,
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkDocumentIdPattern,
  assessmentFrameworkLevelDocumentIdPattern,
  assessmentFrameworkPreAssessmentDocumentIdPattern,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreBands,
  assessmentFrameworkSchema
};
