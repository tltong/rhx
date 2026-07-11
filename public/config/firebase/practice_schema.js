export const PRACTICES_COLLECTION = "practices";

export const practiceDocumentIdPattern = "[auto_generated_id]";
export const practiceQuestionIdPattern = "[question_id]";

export const practiceSchema = {
  collection: PRACTICES_COLLECTION,
  documentId: practiceDocumentIdPattern,
  fields: {
    country: "string",
    level: "string",
    year: "number",
    subject: "string",
    difficulty: "string",
    language: "string",
    dateGenerated: "timestamp",
    questions: {
      type: "array",
      items: {
        type: "string",
        pattern: practiceQuestionIdPattern,
        references: "questions"
      }
    }
  }
};

export default {
  PRACTICES_COLLECTION,
  practiceDocumentIdPattern,
  practiceQuestionIdPattern,
  practiceSchema
};
