const FILL_IN_THE_BLANKS_PRACTICES = "fillInTheBlanksPractices";
const fillInTheBlanksPracticeSchema = {collection: FILL_IN_THE_BLANKS_PRACTICES, documentId: "{practiceId}",
  fields: {type: "assessment|pre assessment", assessmentFrameworkId: "string (pre-assessment only)",
    preAssessmentConfig: "immutable assessment framework snapshot (pre-assessment only)", dateGenerated: "timestamp", syllabusId: "string", topicId: "string",
    language: "string", passageId: "string", difficulty: "easy|medium|hard",
    questions: "array of {syllabusId,topicId,language,passageId,questionId}"}};
export {FILL_IN_THE_BLANKS_PRACTICES, fillInTheBlanksPracticeSchema};
