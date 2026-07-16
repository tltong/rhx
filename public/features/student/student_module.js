import { FirestoreStudentRepository } from "./infrastructure/firestore_student_repository.js?v=20260716-no-eager-auth";
import { GetStudent } from "./application/get_student.js?v=20260716-no-eager-auth";
import { ListStudents } from "./application/list_students.js?v=20260716-no-eager-auth";
import { CreateStudent } from "./application/create_student.js?v=20260716-no-eager-auth";
import { UpdateStudent } from "./application/update_student.js?v=20260716-no-eager-auth";
import { DeleteStudent } from "./application/delete_student.js?v=20260716-no-eager-auth";
import { CurrentStudentSession } from "./application/current_student_session.js?v=20260716-no-eager-auth";
import { getStudentAuthService } from "./auth/student_auth_service.js?v=20260716-no-eager-auth";

const studentRepository = new FirestoreStudentRepository();
const getStudent = new GetStudent(studentRepository);
const listStudentsUseCase = new ListStudents(studentRepository);
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

async function listStudents() {
  return listStudentsUseCase.execute();
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
  return getStudentAuthService().signUp(credentials);
}

async function signInStudent(credentials) {
  return getStudentAuthService().signIn(credentials);
}

async function signOutStudent() {
  return getStudentAuthService().signOut();
}

function getCurrentStudentAuthUser() {
  return getStudentAuthService().getCurrentUser();
}

function requireCurrentStudentAuthUser() {
  return getStudentAuthService().requireCurrentUser();
}

function onStudentAuthStateChanged(callback) {
  return getStudentAuthService().onAuthStateChanged(callback);
}

async function getStudentIdToken(forceRefresh = false) {
  return getStudentAuthService().getIdToken(forceRefresh);
}

export {
  getStudentById,
  findStudentByUsername,
  listStudents,
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
