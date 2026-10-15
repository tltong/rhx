/**
 * getPreAssessmentQuestionById(questionId: string) -> Promise<PreAssessmentQuestion|null>
 * Returns the full question, answers, explanation and SVG using only its ID.
 * Missing IDs return null; duplicate IDs throw with code "ambiguous-question-id".
 */
const {GetPreAssessmentQuestionById} = require("./application/get_pre_assessment_question_by_id");

const {
  CheckPreAssessmentQuestionAnswers,
} = require("./application/check_pre_assessment_question_answers");
const {
  GetPreAssessmentQuestion,
} = require("./application/get_pre_assessment_question");
const {
  GetPreAssessmentQuestionsForPractice,
} = require("./application/get_pre_assessment_questions_for_practice");
const {
  WritePreAssessmentQuestions,
} = require("./application/write_pre_assessment_questions");
const {
  FirestorePreAssessmentQuestionRepository,
} = require(
  "./infrastructure/firestore_pre_assessment_question_repository",
);

const preAssessmentQuestionRepository =
  new FirestorePreAssessmentQuestionRepository();
const checkPreAssessmentQuestionAnswersUseCase =
  new CheckPreAssessmentQuestionAnswers(preAssessmentQuestionRepository);
const getPreAssessmentQuestionUseCase =
  new GetPreAssessmentQuestion(preAssessmentQuestionRepository);
const getPreAssessmentQuestionByIdUseCase =
  new GetPreAssessmentQuestionById(preAssessmentQuestionRepository);
const getPreAssessmentQuestionsForPracticeUseCase =
  new GetPreAssessmentQuestionsForPractice(
    preAssessmentQuestionRepository,
  );
const writePreAssessmentQuestionsUseCase =
  new WritePreAssessmentQuestions(preAssessmentQuestionRepository);

async function checkPreAssessmentQuestionAnswers(input) {
  return checkPreAssessmentQuestionAnswersUseCase.execute(input);
}

async function getPreAssessmentQuestion(syllabusId, topicId, questionId) {
  return getPreAssessmentQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId,
  );
}

async function getPreAssessmentQuestionById(questionId) {
  return getPreAssessmentQuestionByIdUseCase.execute(questionId);
}

async function getPreAssessmentQuestionsForPractice(questionReferences) {
  return getPreAssessmentQuestionsForPracticeUseCase.execute(
    questionReferences,
  );
}

async function writePreAssessmentQuestions(questionInputs) {
  return writePreAssessmentQuestionsUseCase.execute(questionInputs);
}

module.exports = {
  checkPreAssessmentQuestionAnswers,
  getPreAssessmentQuestion,
  getPreAssessmentQuestionById,
  getPreAssessmentQuestionsForPractice,
  writePreAssessmentQuestions,
};
