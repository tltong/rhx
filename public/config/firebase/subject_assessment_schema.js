const SUBJECT_ASSESSMENTS = "subjectAssessments";
const subjectAssessmentSchema = {
  collection: SUBJECT_ASSESSMENTS, documentId: "{assessmentId}",
  fields: {studentId: "string", syllabusId: "string", language: "string", configurationVersion: "integer",
    configurationSnapshot: "immutable subject assessment configuration", contextSnapshot: "frozen level, grade, subject and country", generationId: "string", createdBy: "string",
    generatedAt: "timestamp", itemCount: "integer", questionCount: "integer; includes blanks", passageCount: "integer",
    reusedCount: "integer; questions/passages", generatedCount: "integer; questions/passages"},
  subcollections: {
    items: {documentId: "{position}", fields: {position: "integer", topicId: "string", topicName: "string",
      questionType: "normal|essay|fillInTheBlanks", difficulty: "easy|medium|hard", sourceKey: "SHA-256 content identity",
      sourceReference: "pool document path", source: "reused|generated", contentSnapshot: "immutable public content; one question or whole passage"}},
    private: {documentId: "{position}", fields: {marking: "protected MCQ answer/explanation or passage model answers"}},
  },
};
export {SUBJECT_ASSESSMENTS, subjectAssessmentSchema};
