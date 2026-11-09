const SUBJECT_ASSESSMENT_SUBMISSIONS = "subjectAssessmentSubmissions";
const subjectAssessmentSubmissionSchema = {
  collection: SUBJECT_ASSESSMENT_SUBMISSIONS, documentId: "{assessmentId}",
  fields: {studentId: "string", syllabusId: "string", language: "string", status: "draft|submitted", revision: "integer",
    startedAt: "timestamp", updatedAt: "timestamp", submittedAt: "timestamp|null", timeTakenSeconds: "number|null",
    markingStatus: "notStarted|pending|marking|failed|completed", markingRequest: "integer", markedItemCount: "integer",
    itemCount: "integer", errorMessage: "safe retry guidance|null"},
  subcollections: {
    items: {documentId: "{position}", fields: {position: "integer", questionType: "normal|essay|fillInTheBlanks",
      selectedOption: "a|b|c|d|null; MCQ", answer: "string; essay", answers: "map[blankId]:string; passage"}},
    private: {documentId: "marking", description: "Server-only marking settings snapshot, policy, lease and per-item checkpoints in items/{position}."},
  },
};
export {SUBJECT_ASSESSMENT_SUBMISSIONS, subjectAssessmentSubmissionSchema};
