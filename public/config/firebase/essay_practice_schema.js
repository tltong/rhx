export const ESSAY_PRACTICES_COLLECTION = "essayPractices";
export const essayPracticeSchema = {
  collection: ESSAY_PRACTICES_COLLECTION,
  documentId: "[practiceId]",
  fields: {essayQuestionId: "string"},
};

export default {ESSAY_PRACTICES_COLLECTION, essayPracticeSchema};

