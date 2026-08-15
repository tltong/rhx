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
const getPreAssessmentQuestionsForPracticeUseCase =
  new GetPreAssessmentQuestionsForPractice(
    preAssessmentQuestionRepository,
  );

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

async function getPreAssessmentQuestionsForPractice(questionReferences) {
  return getPreAssessmentQuestionsForPracticeUseCase.execute(
    questionReferences,
  );
}

module.exports = {
  checkPreAssessmentQuestionAnswers,
  getPreAssessmentQuestion,
  getPreAssessmentQuestionsForPractice,
};
