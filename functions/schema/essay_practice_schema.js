const ESSAY_PRACTICES_COLLECTION = "essayPractices";
const essayPracticeSchema = {
  collection: ESSAY_PRACTICES_COLLECTION,
  documentId: "[practiceId]",
  fields: {essayQuestionId: "string"},
};

module.exports = {ESSAY_PRACTICES_COLLECTION, essayPracticeSchema};

