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
  RemoveAssignedPractice,
} = require("./application/remove_assigned_practice");
const {
  FirestoreStudentPracticeRepository,
} = require("./infrastructure/firestore_student_practice_repository");

/**
 * @typedef {import("./domain/student_practice_assignment").StudentPracticeAssignmentInput} StudentPracticeAssignmentInput
 * @typedef {import("./domain/student_practice_assignment").StudentPracticeAssignment} StudentPracticeAssignment
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


async function removeAssignedPractice(input) {
  return removeAssignedPracticeUseCase.execute(input);
}

module.exports = {
  assignPracticeToStudent,
  completeAssignedPractice,
  getAssignedPractice,
  removeAssignedPractice,
};
