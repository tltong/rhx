import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260731-practice-replacement";
import {
  checkPreAssessmentQuestionAnswers
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260807-pre-assessment-answer-check";
import {
  checkQuestionAnswers
} from "../question/question_module.js?v=20260807-question-answer-check";
import {
  GetPracticeResult
} from "./application/get_practice_result.js?v=20260807-practice-result";
import {
  ListPracticeResults
} from "./application/list_practice_results.js?v=20260807-practice-result";
import {
  SubmitPracticeResult
} from "./application/submit_practice_result.js?v=20260807-practice-question-source";
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
