/**
 * Browser APIs
 *
 * listCurrentStudentAssignedPractices(): Promise<Array<{
 *   assignment: StudentPracticeAssignment,
 *   practice: Practice|null
 * }>>
 * startPracticeSession({practiceId}): Promise<PracticeSession>
 * getCurrentPracticeSession(): PracticeSession|null
 * answerPracticeQuestion({questionId, selectedOption}): PracticeSession
 * submitPracticeSession(): Promise<PracticeResult>
 * clearPracticeSession(): void
 *
 * Correct answers and explanations are not included in PracticeSession.
 */
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  getPracticeResult,
  submitPracticeResult
} from "../practice_result/practice_result_module.js?v=20260808-practice-session";
import {
  getQuestionsForPractice
} from "../question/question_module.js?v=20260822-question-routing";
import {
  getPreAssessmentQuestionsForPractice
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260808-practice-session";
import {
  completeAssignedPractice,
  getAssignedPractice,
  listAssignedPractices
} from "../student_practice/student_practice_module.js?v=20260816-practice-id-lists";
import {
  requireCurrentStudentAuthUser
} from "../student/student_module.js?v=20260716-no-eager-auth";
import {
  CurrentPracticeSession
} from "./application/current_practice_session.js?v=20260808-practice-session";
import {
  ListAssignedPracticeSessions
} from "./application/list_assigned_practice_sessions.js?v=20260808-assigned-practices";
import {
  StartPracticeSession
} from "./application/start_practice_session.js?v=20260808-practice-session";
import {
  SubmitPracticeSession
} from "./application/submit_practice_session.js?v=20260810-completed-practice";

const currentPracticeSession = new CurrentPracticeSession();
const listAssignedPracticeSessionsUseCase =
  new ListAssignedPracticeSessions({
    listAssignedPractices,
    getPracticeById
  });
const startPracticeSessionUseCase = new StartPracticeSession({
  getPracticeById,
  getAssignedPractice,
  getPracticeResult,
  questionLoaders: {
    [practiceTypes.ASSESSMENT]: getQuestionsForPractice,
    [practiceTypes.PRE_ASSESSMENT]: getPreAssessmentQuestionsForPractice
  }
});
const submitPracticeSessionUseCase = new SubmitPracticeSession({
  submitPracticeResult,
  getPracticeResult,
  completeAssignedPractice
});

async function listCurrentStudentAssignedPractices() {
  const authUser = requireCurrentStudentAuthUser();

  return listAssignedPracticeSessionsUseCase.execute({
    studentId: authUser.uid
  });
}

async function startPracticeSession({ practiceId } = {}) {
  const authUser = requireCurrentStudentAuthUser();
  const session = await startPracticeSessionUseCase.execute({
    practiceId,
    studentId: authUser.uid
  });

  return currentPracticeSession.set(session);
}

function getCurrentPracticeSession() {
  return currentPracticeSession.get();
}

function answerPracticeQuestion({ questionId, selectedOption } = {}) {
  const updatedSession = currentPracticeSession.require().answerQuestion(
    questionId,
    selectedOption
  );

  return currentPracticeSession.set(updatedSession);
}

async function submitPracticeSession() {
  const session = currentPracticeSession.require();
  const practiceResult = await submitPracticeSessionUseCase.execute(session);

  currentPracticeSession.set(session.markSubmitted());

  return practiceResult;
}

function clearPracticeSession() {
  currentPracticeSession.clear();
}

export {
  listCurrentStudentAssignedPractices,
  startPracticeSession,
  getCurrentPracticeSession,
  answerPracticeQuestion,
  submitPracticeSession,
  clearPracticeSession
};
