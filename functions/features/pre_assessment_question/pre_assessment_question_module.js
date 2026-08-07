const {
  CheckPreAssessmentQuestionAnswers,
} = require("./application/check_pre_assessment_question_answers");
const {
  GetPreAssessmentQuestion,
} = require("./application/get_pre_assessment_question");
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

module.exports = {
  checkPreAssessmentQuestionAnswers,
  getPreAssessmentQuestion,
};
