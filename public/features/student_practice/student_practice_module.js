import {
  getPracticeById
} from "../practice/practice_module.js?v=20260731-practice-replacement";
import {
  AssignPracticeToStudent
} from "./application/assign_practice_to_student.js?v=20260807-student-practice";
import {
  FirestoreStudentPracticeRepository
} from "./infrastructure/firestore_student_practice_repository.js?v=20260807-student-practice";

/**
 * @typedef {import("./domain/student_practice_assignment.js").StudentPracticeAssignmentInput} StudentPracticeAssignmentInput
 * @typedef {import("./domain/student_practice_assignment.js").StudentPracticeAssignment} StudentPracticeAssignment
 */

const studentPracticeRepository = new FirestoreStudentPracticeRepository();
const assignPracticeToStudentUseCase = new AssignPracticeToStudent({
  studentPracticeRepository,
  getPracticeById
});

/**
 * @param {StudentPracticeAssignmentInput} input
 * @returns {Promise<StudentPracticeAssignment>}
 */
async function assignPracticeToStudent(input) {
  return assignPracticeToStudentUseCase.execute(input);
}

export {
  assignPracticeToStudent
};
