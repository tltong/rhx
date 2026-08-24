/**
 * Public API contracts
 *
 * listCompletedPractices({studentId: string})
 *   -> Promise<StudentPracticeCompletion[]> sorted newest first.
 *
 * listCompletedPracticeIds({studentId: string}) -> Promise<string[]>
 * listAssignedPracticeIds({studentId: string}) -> Promise<string[]>
 */
const {
  getPracticeById,
} = require("../practice/practice_module");
const {
  AssignPracticeToStudent,
} = require("./application/assign_practice_to_student");
const {
  CompleteAssignedPractice,
} = require("./application/complete_assigned_practice");
const {
  GetAssignedPractice,
} = require("./application/get_assigned_practice");
const {
  ListAssignedPracticeIds,
} = require("./application/list_assigned_practice_ids");
const {
  ListCompletedPracticeIds,
} = require("./application/list_completed_practice_ids");
const {
  ListCompletedPractices,
} = require("./application/list_completed_practices");
const {
  RemoveAssignedPractice,
} = require("./application/remove_assigned_practice");
const {
  FirestoreStudentPracticeRepository,
} = require("./infrastructure/firestore_student_practice_repository");

/**
 * @typedef {import("./domain/student_practice_assignment").StudentPracticeAssignmentInput} StudentPracticeAssignmentInput
 * @typedef {import("./domain/student_practice_assignment").StudentPracticeAssignment} StudentPracticeAssignment
 * @typedef {import("./domain/student_practice_completion").StudentPracticeCompletion} StudentPracticeCompletion
 */

const studentPracticeRepository = new FirestoreStudentPracticeRepository();
const assignPracticeToStudentUseCase = new AssignPracticeToStudent({
  studentPracticeRepository,
  getPracticeById,
});
const completeAssignedPracticeUseCase = new CompleteAssignedPractice(
  studentPracticeRepository,
);
const getAssignedPracticeUseCase = new GetAssignedPractice(
  studentPracticeRepository,
);
const listAssignedPracticeIdsUseCase = new ListAssignedPracticeIds(
  studentPracticeRepository,
);
const listCompletedPracticeIdsUseCase = new ListCompletedPracticeIds(
  studentPracticeRepository,
);
const listCompletedPracticesUseCase = new ListCompletedPractices(
  studentPracticeRepository,
);
const removeAssignedPracticeUseCase = new RemoveAssignedPractice(
  studentPracticeRepository,
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

/**
 * @param {{studentId: string}} input
 * @returns {Promise<StudentPracticeCompletion[]>}
 */
async function listCompletedPractices(input) {
  return listCompletedPracticesUseCase.execute(input);
}

async function removeAssignedPractice(input) {
  return removeAssignedPracticeUseCase.execute(input);
}

module.exports = {
  assignPracticeToStudent,
  completeAssignedPractice,
  getAssignedPractice,
  listAssignedPracticeIds,
  listCompletedPracticeIds,
  listCompletedPractices,
  removeAssignedPractice,
};
