export const ASSESSMENT_FRAMEWORKS_COLLECTION = "assessmentFrameworks";
export const ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION = "levels";

export const assessmentFrameworkDocumentIdPattern = "[auto_generated_id]";
export const assessmentFrameworkLevelDocumentIdPattern = "[level_id]";

export const assessmentFrameworkSchema = {
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
    }
  }
};

export default {
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
  assessmentFrameworkDocumentIdPattern,
  assessmentFrameworkLevelDocumentIdPattern,
  assessmentFrameworkSchema
};
