const FILL_IN_THE_BLANKS_RESULTS = "fillInTheBlanksPracticeResults";
const FILL_IN_THE_BLANKS_SCORING = "fillInTheBlanksScoring";
const fillInTheBlanksScoringConfigSchema = {collection: FILL_IN_THE_BLANKS_SCORING, documentId: "config",
  fields: {markingInstructions: "string", updatedAt: "timestamp", updatedBy: "string"}};
const fillInTheBlanksResultsSchema = {collection: FILL_IN_THE_BLANKS_RESULTS, documentId: "{practiceId}",
  subcollections: {studentSubmissions: {documentId: "{studentId}", fields: {submittedAt: "timestamp", scoredAt: "timestamp",
    timeTakenSeconds: "number", questionsCorrect: "integer", totalQuestions: "integer", score: "number 0..100",
    answers: "map[questionId]: {submittedAnswer,correctAnswer,isCorrect,markingMethod: static|llm|unanswered}"}}}};
module.exports = {FILL_IN_THE_BLANKS_RESULTS, FILL_IN_THE_BLANKS_SCORING,
  fillInTheBlanksScoringConfigSchema, fillInTheBlanksResultsSchema};
