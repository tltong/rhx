const SUBJECT_ASSESSMENT_RESULTS = "subjectAssessmentResults";
const subjectAssessmentResultSchema = {
  collection: SUBJECT_ASSESSMENT_RESULTS, documentId: "{assessmentId}",
  fields: {studentId: "string", syllabusId: "string", language: "string", submittedAt: "timestamp", scoredAt: "timestamp",
    timeTakenSeconds: "number", score: "percentage 0..100", earnedMarks: "number", maxMarks: "number", scoringPolicy: "versioned policy snapshot",
    itemCount: "integer", questionCount: "integer; includes individual blanks", topicBreakdown: "array of score summaries",
    formatBreakdown: "array of score summaries", difficultyBreakdown: "array of score summaries"},
  subcollections: {items: {documentId: "{position}", fields: {position: "integer", topicId: "string", topicName: "string",
    questionType: "normal|essay|fillInTheBlanks", difficulty: "easy|medium|hard", score: "percentage 0..100",
    earnedMarks: "number", maxMarks: "number", questionCount: "integer", answer: "submitted answer and format-specific feedback"}}},
};
export {SUBJECT_ASSESSMENT_RESULTS, subjectAssessmentResultSchema};
