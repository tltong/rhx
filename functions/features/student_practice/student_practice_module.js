const {
  getPracticeById,
} = require("../practice/practice_module");
const {
  AssignPracticeToStudent,
} = require("./application/assign_practice_to_student");
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

/**
 * @param {StudentPracticeAssignmentInput} input
 * @returns {Promise<StudentPracticeAssignment>}
 */
async function assignPracticeToStudent(input) {
  return assignPracticeToStudentUseCase.execute(input);
}

module.exports = {
  assignPracticeToStudent,
};
