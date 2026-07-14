import { FirestoreStudentRepository } from "./infrastructure/firestore_student_repository.js?v=20260715-module-api";
import { GetStudent } from "./application/get_student.js?v=20260715-module-api";
import { CreateStudent } from "./application/create_student.js?v=20260715-module-api";
import { UpdateStudent } from "./application/update_student.js?v=20260715-module-api";
import { DeleteStudent } from "./application/delete_student.js?v=20260715-module-api";
import { CurrentStudentSession } from "./application/current_student_session.js?v=20260715-module-api";
import { studentAuthService } from "./auth/student_auth_service.js?v=20260715-module-api";

const studentRepository = new FirestoreStudentRepository();
const getStudent = new GetStudent(studentRepository);
const createStudent = new CreateStudent(studentRepository);
const updateStudent = new UpdateStudent(studentRepository);
const deleteStudent = new DeleteStudent(studentRepository);
const currentStudentSession = new CurrentStudentSession(getStudent);

async function getStudentById(studentId) {
  return getStudent.execute(studentId);
}

async function findStudentByUsername(username) {
  return studentRepository.findByUsername(username);
}

async function createStudentRecord(data) {
  return createStudent.execute(data);
}

async function updateStudentRecord(student, changes) {
  return updateStudent.execute(student, changes);
}

async function deleteStudentRecord(studentId) {
  return deleteStudent.execute(studentId);
}

async function loadCurrentStudent(studentId) {
  return currentStudentSession.load(studentId);
}

function getCurrentStudent() {
  return currentStudentSession.get();
}

function clearCurrentStudent() {
  currentStudentSession.clear();
}

async function signUpStudent(credentials) {
  return studentAuthService.signUp(credentials);
}

async function signInStudent(credentials) {
  return studentAuthService.signIn(credentials);
}

async function signOutStudent() {
  return studentAuthService.signOut();
}

function getCurrentStudentAuthUser() {
  return studentAuthService.getCurrentUser();
}

function requireCurrentStudentAuthUser() {
  return studentAuthService.requireCurrentUser();
}

function onStudentAuthStateChanged(callback) {
  return studentAuthService.onAuthStateChanged(callback);
}

async function getStudentIdToken(forceRefresh = false) {
  return studentAuthService.getIdToken(forceRefresh);
}

export {
  getStudentById,
  findStudentByUsername,
  createStudentRecord,
  updateStudentRecord,
  deleteStudentRecord,
  loadCurrentStudent,
  getCurrentStudent,
  clearCurrentStudent,
  signUpStudent,
  signInStudent,
  signOutStudent,
  getCurrentStudentAuthUser,
  requireCurrentStudentAuthUser,
  onStudentAuthStateChanged,
  getStudentIdToken
};
