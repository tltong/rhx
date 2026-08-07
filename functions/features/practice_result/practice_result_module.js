const {
  getPracticeById,
  practiceTypes,
} = require("../practice/practice_module");
const {
  checkPreAssessmentQuestionAnswers,
} = require(
  "../pre_assessment_question/pre_assessment_question_module",
);
const {
  checkQuestionAnswers,
} = require("../question/question_module");
const {
  GetPracticeResult,
} = require("./application/get_practice_result");
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
 */

const practiceResultRepository = new FirestorePracticeResultRepository();
const getPracticeResultUseCase = new GetPracticeResult(
  practiceResultRepository,
);
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

/** @returns {Promise<PracticeResult[]>} */
async function listPracticeResults(input) {
  return listPracticeResultsUseCase.execute(input);
}

module.exports = {
  submitPracticeResult,
  getPracticeResult,
  listPracticeResults,
};
