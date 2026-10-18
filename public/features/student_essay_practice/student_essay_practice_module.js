/**
 * Student Essay Practice feature, independent of Student Practice.
 * Storage: studentEssayPractices/{studentId}/{assignedEssayPractices|completedEssayPractices}/{essayPracticeId}.
 * This feature provides assignment, completion and history; callers control when to invoke it.
 *
 * Essay practice APIs (backend and web):
 * assignEssayPracticeToStudent({studentId, essayQuestionId, syllabusId, topicId, essayPracticeId?})
 *   -> Promise<AssignedEssayPractice>. Allocates an attempt ID when omitted.
 *   Supply the same essayPracticeId to safely retry an identical assignment.
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
 * CompletedEssayPractice: assignment fields + {completedAt, essayText, timeTakenSeconds}.
 * Dates are returned as Date objects; timestamps are set by Firestore.
 * Web essay APIs require sign-in. No new Firebase callable endpoints.
 *
 */
import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {FirestoreStudentEssayPracticeRepository} from "./infrastructure/firestore_student_essay_practice_repository.js?v=20261017-student-essay-practice-independent-v1";
import {AssignEssayPracticeToStudent} from "./application/assign_essay_practice_to_student.js?v=20261017-student-essay-practice-independent-v1";
import {CompleteAssignedEssayPractice} from "./application/complete_assigned_essay_practice.js?v=20261017-student-essay-practice-independent-v1";
import {GetAssignedEssayPractice} from "./application/get_assigned_essay_practice.js?v=20261017-student-essay-practice-independent-v1";
import {GetCompletedEssayPractice} from "./application/get_completed_essay_practice.js?v=20261017-student-essay-practice-independent-v1";
import {ListAssignedEssayPractices} from "./application/list_assigned_essay_practices.js?v=20261017-student-essay-practice-independent-v1";
import {ListCompletedEssayPractices} from "./application/list_completed_essay_practices.js?v=20261017-student-essay-practice-independent-v1";


const studentEssayPracticeRepository = new FirestoreStudentEssayPracticeRepository();
const assignEssayPracticeUseCase = new AssignEssayPracticeToStudent({
  repository: studentEssayPracticeRepository, getEssayQuestionById,
});
const completeEssayPracticeUseCase = new CompleteAssignedEssayPractice(studentEssayPracticeRepository);
const getAssignedEssayPracticeUseCase = new GetAssignedEssayPractice(studentEssayPracticeRepository);
const getCompletedEssayPracticeUseCase = new GetCompletedEssayPractice(studentEssayPracticeRepository);
const listAssignedEssayPracticesUseCase = new ListAssignedEssayPractices(studentEssayPracticeRepository);
const listCompletedEssayPracticesUseCase = new ListCompletedEssayPractices(studentEssayPracticeRepository);

async function withEssayPracticeAccess(operation) {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
      throw new Error("The signed-in account changed. Try again.");
    }
  };
  const result = await operation({assertAccess});
  assertAccess();
  return result;
}

async function assignEssayPracticeToStudent(input) {
  return withEssayPracticeAccess(context => assignEssayPracticeUseCase.execute(input, context));
}

async function completeAssignedEssayPractice(input) {
  return withEssayPracticeAccess(context => completeEssayPracticeUseCase.execute(input, context));
}

async function getAssignedEssayPractice(input) {
  return withEssayPracticeAccess(context => getAssignedEssayPracticeUseCase.execute(input, context));
}

async function getCompletedEssayPractice(input) {
  return withEssayPracticeAccess(context => getCompletedEssayPracticeUseCase.execute(input, context));
}

async function listAssignedEssayPractices(input) {
  return withEssayPracticeAccess(context => listAssignedEssayPracticesUseCase.execute(input, context));
}

async function listCompletedEssayPractices(input) {
  return withEssayPracticeAccess(context => listCompletedEssayPracticesUseCase.execute(input, context));
}

export {
  assignEssayPracticeToStudent,
  completeAssignedEssayPractice,
  getAssignedEssayPractice,
  getCompletedEssayPractice,
  listAssignedEssayPractices,
  listCompletedEssayPractices,
};

