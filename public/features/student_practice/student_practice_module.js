import {
  getPracticeById
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  AssignPracticeToStudent
} from "./application/assign_practice_to_student.js?v=20260807-student-practice";
import {
  CompleteAssignedPractice
} from "./application/complete_assigned_practice.js?v=20260810-completed-practice";
import {
  GetAssignedPractice
} from "./application/get_assigned_practice.js?v=20260808-practice-session";

import {
  ListAssignedPractices
} from "./application/list_assigned_practices.js?v=20260808-assigned-practices";
import {
  ListAssignedPracticeIds
} from "./application/list_assigned_practice_ids.js?v=20260816-practice-id-lists";
import {
  ListCompletedPracticeIds
} from "./application/list_completed_practice_ids.js?v=20260816-practice-id-lists";
import {
  RemoveAssignedPractice
} from "./application/remove_assigned_practice.js?v=20260808-practice-session";
import {
  FirestoreStudentPracticeRepository
} from "./infrastructure/firestore_student_practice_repository.js?v=20260816-practice-id-lists";

/**
 * @typedef {import("./domain/student_practice_assignment.js").StudentPracticeAssignmentInput} StudentPracticeAssignmentInput
 * @typedef {import("./domain/student_practice_assignment.js").StudentPracticeAssignment} StudentPracticeAssignment
 */

const studentPracticeRepository = new FirestoreStudentPracticeRepository();
const assignPracticeToStudentUseCase = new AssignPracticeToStudent({
  studentPracticeRepository,
  getPracticeById
});
const completeAssignedPracticeUseCase = new CompleteAssignedPractice(
  studentPracticeRepository
);
const getAssignedPracticeUseCase = new GetAssignedPractice(
  studentPracticeRepository
);

const listAssignedPracticesUseCase = new ListAssignedPractices(
  studentPracticeRepository
);
const listAssignedPracticeIdsUseCase = new ListAssignedPracticeIds(
  studentPracticeRepository
);
const listCompletedPracticeIdsUseCase = new ListCompletedPracticeIds(
  studentPracticeRepository
);
const removeAssignedPracticeUseCase = new RemoveAssignedPractice(
  studentPracticeRepository
);

/**
 * @param {StudentPracticeAssignmentInput} input
 * @returns {Promise<StudentPracticeAssignment>}
 */
async function assignPracticeToStudent(input) {
  return assignPracticeToStudentUseCase.execute(input);
}

async function completeAssignedPractice(practiceResult) {
  return completeAssignedPracticeUseCase.execute(practiceResult);
}

async function getAssignedPractice(input) {
  return getAssignedPracticeUseCase.execute(input);
}


async function listAssignedPractices(input) {
  return listAssignedPracticesUseCase.execute(input);
}

/**
 * @param {{studentId: string}} input
 * @returns {Promise<string[]>}
 */
async function listAssignedPracticeIds(input) {
  return listAssignedPracticeIdsUseCase.execute(input);
}

/**
 * @param {{studentId: string}} input
 * @returns {Promise<string[]>}
 */
async function listCompletedPracticeIds(input) {
  return listCompletedPracticeIdsUseCase.execute(input);
}

async function removeAssignedPractice(input) {
  return removeAssignedPracticeUseCase.execute(input);
}

export {
  assignPracticeToStudent,
  completeAssignedPractice,
  getAssignedPractice,
  listAssignedPractices,
  listAssignedPracticeIds,
  listCompletedPracticeIds,
  removeAssignedPractice
};
