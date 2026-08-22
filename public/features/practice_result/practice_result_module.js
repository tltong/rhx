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

 * listPracticeResults({practiceId: string})
 *   -> Promise<PracticeResult[]>
 *
 * PracticeResult output:
 * {
 *   practiceId: string,
 *   studentId: string,
 *   submittedAt: Date,
 *   timeTakenSeconds: number,
 *   questionsCorrect: number,
 *   totalQuestions: number,
 *   score: number,
 *   answers: Object<string, {
 *     selectedOption: "a"|"b"|"c"|"d",
 *     correctAnswer: "a"|"b"|"c"|"d",
 *     isCorrect: boolean
 *   }>
 * }
 *
 * submitPracticeResult validates and scores the submitted answers before
 * storing the result. Callers do not supply submittedAt, correct answers,
 * questionsCorrect, totalQuestions, or score.
 */
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  checkPreAssessmentQuestionAnswers
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260808-practice-session";
import {
  checkQuestionAnswers
} from "../question/question_module.js?v=20260817-question-writes";

import {
  GetPracticeResult
} from "./application/get_practice_result.js?v=20260807-practice-result";

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
 */

const practiceResultRepository = new FirestorePracticeResultRepository();
const getPracticeResultUseCase = new GetPracticeResult(
  practiceResultRepository
);

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


/** @returns {Promise<PracticeResult[]>} */
async function listPracticeResults(input) {
  return listPracticeResultsUseCase.execute(input);
}

export {
  submitPracticeResult,
  getPracticeResult,
  listPracticeResults
};
