/**
 * getStudentById(studentId: string) -> Promise<Student|null>
 */
const {
  GetStudent,
} = require("./application/get_student");
const {
  FirestoreStudentRepository,
} = require("./infrastructure/firestore_student_repository");

const studentRepository = new FirestoreStudentRepository();
const getStudentUseCase = new GetStudent(studentRepository);

async function getStudentById(studentId) {
  return getStudentUseCase.execute(studentId);
}

module.exports = {
  getStudentById,
};
