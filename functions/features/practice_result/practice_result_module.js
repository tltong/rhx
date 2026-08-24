/**
 * Public API contracts
 *
 * getPracticeResultReview({practiceId: string, studentId: string})
 *   -> Promise<PracticeResultReview|null>
 *
 * PracticeResultReview contains the result summary and ordered reviewed
 * questions with selectedOption, correctAnswer, isCorrect, and explanation.
 */
const {
  getPracticeById,
  practiceTypes,
} = require("../practice/practice_module");
const {
  checkPreAssessmentQuestionAnswers,
  getPreAssessmentQuestion,
} = require(
  "../pre_assessment_question/pre_assessment_question_module",
);
const {
  checkQuestionAnswers,
  getQuestion,
} = require("../question/question_module");
const {
  GetPracticeResult,
} = require("./application/get_practice_result");
const {
  GetPracticeResultReview,
} = require("./application/get_practice_result_review");
const {
  ListPracticeResults,
} = require("./application/list_practice_results");
const {
  SubmitPracticeResult,
} = require("./application/submit_practice_result");
const {
  FirestorePracticeResultRepository,
} = require("./infrastructure/firestore_practice_result_repository");

/**
 * @typedef {import("./domain/practice_result").PracticeResult} PracticeResult
 * @typedef {import("./domain/practice_result_review").PracticeResultReview} PracticeResultReview
 */

async function loadAssessmentReviewQuestions(questionReferences) {
  return Promise.all(questionReferences.map((reference) => (
    getQuestion(reference)
  )));
}

async function loadPreAssessmentReviewQuestions(questionReferences) {
  return Promise.all(questionReferences.map((reference) => (
    getPreAssessmentQuestion(
      reference.syllabusId,
      reference.topicId,
      reference.questionId,
    )
  )));
}

const practiceResultRepository = new FirestorePracticeResultRepository();
const getPracticeResultUseCase = new GetPracticeResult(
  practiceResultRepository,
);
const getPracticeResultReviewUseCase = new GetPracticeResultReview({
  practiceResultRepository,
  getPracticeById,
  questionLoaders: {
    [practiceTypes.ASSESSMENT]: loadAssessmentReviewQuestions,
    [practiceTypes.PRE_ASSESSMENT]: loadPreAssessmentReviewQuestions,
  },
});
const listPracticeResultsUseCase = new ListPracticeResults(
  practiceResultRepository,
);
const submitPracticeResultUseCase = new SubmitPracticeResult({
  practiceResultRepository,
  getPracticeById,
  answerCheckers: {
    [practiceTypes.ASSESSMENT]: checkQuestionAnswers,
    [practiceTypes.PRE_ASSESSMENT]: checkPreAssessmentQuestionAnswers,
  },
});

/** @returns {Promise<PracticeResult>} */
async function submitPracticeResult(input) {
  return submitPracticeResultUseCase.execute(input);
}

/** @returns {Promise<PracticeResult|null>} */
async function getPracticeResult(input) {
  return getPracticeResultUseCase.execute(input);
}

/** @returns {Promise<PracticeResultReview|null>} */
async function getPracticeResultReview(input) {
  return getPracticeResultReviewUseCase.execute(input);
}

/** @returns {Promise<PracticeResult[]>} */
async function listPracticeResults(input) {
  return listPracticeResultsUseCase.execute(input);
}

module.exports = {
  submitPracticeResult,
  getPracticeResult,
  getPracticeResultReview,
  listPracticeResults,
};
