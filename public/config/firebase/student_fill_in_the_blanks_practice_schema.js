const STUDENT_FILL_IN_THE_BLANKS_PRACTICES = "studentFillInTheBlanksPractices";
const USED_FILL_IN_THE_BLANKS_PASSAGES = "userUsedFillInTheBlanksPassages";
const studentFillInTheBlanksPracticeSchema = {collection: STUDENT_FILL_IN_THE_BLANKS_PRACTICES, documentId: "{studentId}",
  subcollections: {
    assignedPractices: {documentId: "{practiceId}", fields: {type: "assessment|pre assessment (legacy default assessment)", syllabusId: "string", topicId: "string",
      language: "string", passageId: "string", difficulty: "easy|medium|hard", assignedAt: "timestamp"}},
    submissions: {documentId: "{practiceId}", fields: {answers: "map[questionId]: string", submittedAt: "timestamp",
      timeTakenSeconds: "number", markingStatus: "submitted|marking|completed|failed", leaseToken: "string|null",
      leaseUntil: "timestamp|null", errorCode: "string|null", requestId: "string", requestedAt: "timestamp"}},
    completedPractices: {documentId: "{practiceId}", fields: {type: "assessment|pre assessment (legacy default assessment)", syllabusId: "string", topicId: "string",
      language: "string", passageId: "string", difficulty: "string", assignedAt: "timestamp", dateCompleted: "timestamp",
      completedAt: "timestamp", score: "number", totalQuestions: "integer", questionsCorrect: "integer",
      studentAnswers: "map", timeTakenSeconds: "number"}},
    completionProcessing: {documentId: "{practiceId}", fields: {status: "processing|completed|failed",
      stage: "string", updatedAt: "timestamp", generatedPracticeId: "string|null", errorCode: "string|null"}},
  }};
const usedFillInTheBlanksPassageSchema = {
  collection: "userUsedFillInTheBlanksPassages/{studentId}/syllabuses/{syllabusId}/topics/{topicId}/passages",
  documentId: "{passageId}", fields: {practiceId: "string", assignedAt: "timestamp", completedAt: "timestamp|null"}};
export {STUDENT_FILL_IN_THE_BLANKS_PRACTICES, USED_FILL_IN_THE_BLANKS_PASSAGES,
  studentFillInTheBlanksPracticeSchema, usedFillInTheBlanksPassageSchema};
