/**
 * Student Essay Practice feature, independent of Student Practice.
 * Storage: studentEssayPractices/{studentId}/{assignedEssayPractices|completedEssayPractices}/{essayPracticeId}.
 * This feature provides assignment, completion and history; callers control when to invoke it.
 *
 * Essay practice APIs (backend and web):
 * assignEssayPracticeToStudent({studentId, essayQuestionId, syllabusId, topicId, essayPracticeId?})
 *   -> Promise<AssignedEssayPractice>. Allocates an attempt ID when omitted.
 *   Supply the same essayPracticeId to safely retry an identical assignment.
 *   Optional second argument {preventQuestionReuse: true} atomically rejects a question already
 *   assigned to this student under another attempt ID (code: essay-question-already-used).
 *   questionUsage/{essayQuestionId} records the first assignment and persists after completion.
 *   The follow-up essay generator enables this guard; initial syllabus attachments retain their existing behavior.
 * getAssignedEssayPractice({studentId, essayPracticeId}) -> Promise<AssignedEssayPractice|null>
 * listAssignedEssayPractices({studentId, syllabusId?, topicId?, limit, cursor?})
 * completeAssignedEssayPractice({studentId, essayPracticeId, essayText, timeTakenSeconds})
 *   -> Promise<CompletedEssayPractice>. Atomically moves the assignment into history.
 *   Retrying a completed attempt returns its original saved submission.
 * getCompletedEssayPractice({studentId, essayPracticeId}) -> Promise<CompletedEssayPractice|null>
 * listCompletedEssayPractices({studentId, syllabusId?, topicId?, limit, cursor?})
 *   Both lists -> Promise<{practices: object[], nextCursor: string|null}>.
 *   limit: integer 1-100. Stable ascending attempt-ID order; cursors require the same filters.
 * AssignedEssayPractice: {studentId, essayPracticeId, essayQuestionId, syllabusId, topicId, assignedAt}.
 * CompletedEssayPractice: assignment fields + {completedAt, essayText, timeTakenSeconds, scoring?: {status}}.
 * Scoring status is managed by the backend completion trigger; submissions start pending.
 * Dates are returned as Date objects; timestamps are set by Firestore.
 * Web essay APIs require sign-in. No new Firebase callable endpoints.
 *
 */
const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {FirestoreStudentEssayPracticeRepository} = require("./infrastructure/firestore_student_essay_practice_repository");
const {AssignEssayPracticeToStudent} = require("./application/assign_essay_practice_to_student");
const {CompleteAssignedEssayPractice} = require("./application/complete_assigned_essay_practice");
const {GetAssignedEssayPractice} = require("./application/get_assigned_essay_practice");
const {GetCompletedEssayPractice} = require("./application/get_completed_essay_practice");
const {ListAssignedEssayPractices} = require("./application/list_assigned_essay_practices");
const {ListCompletedEssayPractices} = require("./application/list_completed_essay_practices");


const studentEssayPracticeRepository = new FirestoreStudentEssayPracticeRepository();
const assignEssayPracticeUseCase = new AssignEssayPracticeToStudent({
  repository: studentEssayPracticeRepository, getEssayQuestionById,
});
const completeEssayPracticeUseCase = new CompleteAssignedEssayPractice(studentEssayPracticeRepository);
const getAssignedEssayPracticeUseCase = new GetAssignedEssayPractice(studentEssayPracticeRepository);
const getCompletedEssayPracticeUseCase = new GetCompletedEssayPractice(studentEssayPracticeRepository);
const listAssignedEssayPracticesUseCase = new ListAssignedEssayPractices(studentEssayPracticeRepository);
const listCompletedEssayPracticesUseCase = new ListCompletedEssayPractices(studentEssayPracticeRepository);

async function assignEssayPracticeToStudent(input, context) {
  return assignEssayPracticeUseCase.execute(input, context);
}

async function completeAssignedEssayPractice(input) {
  return completeEssayPracticeUseCase.execute(input);
}

async function getAssignedEssayPractice(input) {
  return getAssignedEssayPracticeUseCase.execute(input);
}

async function getCompletedEssayPractice(input) {
  return getCompletedEssayPracticeUseCase.execute(input);
}

async function listAssignedEssayPractices(input) {
  return listAssignedEssayPracticesUseCase.execute(input);
}

async function listCompletedEssayPractices(input) {
  return listCompletedEssayPracticesUseCase.execute(input);
}

module.exports = {
  // Trusted backend orchestration only. Browser APIs cannot set grading status.
  claimEssayPracticeScoring: input => studentEssayPracticeRepository.claimScoring(input),
  setEssayPracticeScoringStatus: input => studentEssayPracticeRepository.setScoringStatus(input),
  assignEssayPracticeToStudent,
  completeAssignedEssayPractice,
  getAssignedEssayPractice,
  getCompletedEssayPractice,
  listAssignedEssayPractices,
  listCompletedEssayPractices,
};

