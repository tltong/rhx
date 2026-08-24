/**
 * Public API contracts
 *
 * submitPracticeResult({
 *   practiceId: string,
 *   studentId: string,
 *   timeTakenSeconds: number,
 *   answers: Array<{
 *     questionId: string,
 *     selectedOption: "a"|"b"|"c"|"d"
 *   }>
 * }) -> Promise<PracticeResult>
 *
 * getPracticeResult({practiceId: string, studentId: string})
 *   -> Promise<PracticeResult|null>
 *
 * getPracticeResultReview({practiceId: string, studentId: string})
 *   -> Promise<PracticeResultReview|null>
 *
 * listPracticeResults({practiceId: string}) -> Promise<PracticeResult[]>
 *
 * PracticeResultReview output:
 * {
 *   practiceId, studentId, practiceType, submittedAt, timeTakenSeconds,
 *   questionsCorrect, totalQuestions, score,
 *   questions: Array<{
 *     questionId, questionText, options, selectedOption, correctAnswer,
 *     isCorrect, explanation, hasDiagram, svg
 *   }>
 * }
 *
 * getPracticeResultReview returns correct answers and explanations only after
 * a stored result has been found for the student and practice.
 */
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  checkPreAssessmentQuestionAnswers,
  getPreAssessmentQuestion
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260824-practice-review";
import {
  checkQuestionAnswers,
  getQuestion
} from "../question/question_module.js?v=20260824-practice-review";
import {
  GetPracticeResult
} from "./application/get_practice_result.js?v=20260807-practice-result";
import {
  GetPracticeResultReview
} from "./application/get_practice_result_review.js?v=20260824-practice-review";
import {
  ListPracticeResults
} from "./application/list_practice_results.js?v=20260807-practice-result";
import {
  SubmitPracticeResult
} from "./application/submit_practice_result.js?v=20260816-question-routing";
import {
  FirestorePracticeResultRepository
} from "./infrastructure/firestore_practice_result_repository.js?v=20260807-practice-result";

/**
 * @typedef {import("./domain/practice_result.js").PracticeResult} PracticeResult
 * @typedef {import("./domain/practice_result_review.js").PracticeResultReview} PracticeResultReview
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
      reference.questionId
    )
  )));
}

const practiceResultRepository = new FirestorePracticeResultRepository();
const getPracticeResultUseCase = new GetPracticeResult(
  practiceResultRepository
);
const getPracticeResultReviewUseCase = new GetPracticeResultReview({
  practiceResultRepository,
  getPracticeById,
  questionLoaders: {
    [practiceTypes.ASSESSMENT]: loadAssessmentReviewQuestions,
    [practiceTypes.PRE_ASSESSMENT]: loadPreAssessmentReviewQuestions
  }
});
const listPracticeResultsUseCase = new ListPracticeResults(
  practiceResultRepository
);
const submitPracticeResultUseCase = new SubmitPracticeResult({
  practiceResultRepository,
  getPracticeById,
  answerCheckers: {
    [practiceTypes.ASSESSMENT]: checkQuestionAnswers,
    [practiceTypes.PRE_ASSESSMENT]: checkPreAssessmentQuestionAnswers
  }
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

export {
  submitPracticeResult,
  getPracticeResult,
  getPracticeResultReview,
  listPracticeResults
};
