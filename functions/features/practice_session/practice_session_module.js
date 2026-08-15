/**
 * Stateless Functions APIs
 *
 * startPracticeSession({practiceId, studentId}): Promise<PracticeSession>
 * answerPracticeQuestion({session, questionId, selectedOption}): PracticeSession
 * submitPracticeSession({session}): Promise<PracticeResult>
 *
 * Correct answers and explanations are not included in PracticeSession.
 * No current session is stored globally because a Functions instance can
 * process concurrent requests and can be restarted at any time.
 */
const {
  getPracticeById,
  practiceTypes,
} = require("../practice/practice_module");
const {
  getPracticeResult,
  submitPracticeResult,
} = require("../practice_result/practice_result_module");
const {
  getQuestionsForPractice,
} = require("../question/question_module");
const {
  getPreAssessmentQuestionsForPractice,
} = require(
  "../pre_assessment_question/pre_assessment_question_module",
);
const {
  completeAssignedPractice,
  getAssignedPractice,
} = require("../student_practice/student_practice_module");
const {
  PracticeSession,
} = require("./domain/practice_session");
const {
  StartPracticeSession,
} = require("./application/start_practice_session");
const {
  SubmitPracticeSession,
} = require("./application/submit_practice_session");

const startPracticeSessionUseCase = new StartPracticeSession({
  getPracticeById,
  getAssignedPractice,
  getPracticeResult,
  questionLoaders: {
    [practiceTypes.ASSESSMENT]: getQuestionsForPractice,
    [practiceTypes.PRE_ASSESSMENT]: getPreAssessmentQuestionsForPractice,
  },
});
const submitPracticeSessionUseCase = new SubmitPracticeSession({
  submitPracticeResult,
  getPracticeResult,
  completeAssignedPractice,
});

async function startPracticeSession(input) {
  return startPracticeSessionUseCase.execute(input);
}

function answerPracticeQuestion({
  session,
  questionId,
  selectedOption,
} = {}) {
  const normalizedSession = session instanceof PracticeSession
    ? session
    : new PracticeSession(session);

  return normalizedSession.answerQuestion(questionId, selectedOption);
}

async function submitPracticeSession({session} = {}) {
  return submitPracticeSessionUseCase.execute(session);
}

module.exports = {
  startPracticeSession,
  answerPracticeQuestion,
  submitPracticeSession,
};
