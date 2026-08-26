import { FirestoreStudentRepository } from "./infrastructure/firestore_student_repository.js?v=20260825-student-pin-v1";
import { GetStudent } from "./application/get_student.js?v=20260716-no-eager-auth";
import { GetStudentAcademicScope } from "./application/get_student_academic_scope.js?v=20260825-stream-syllabus-subscriptions-v1";
import { GetStudentSummary } from "./application/get_student_summary.js";
import { ListStudents } from "./application/list_students.js?v=20260716-no-eager-auth";
import { SearchStudents } from "./application/search_students.js";
import { CreateStudent } from "./application/create_student.js?v=20260825-student-pin-v1";
import { UpdateStudent } from "./application/update_student.js?v=20260716-no-eager-auth";
import { DeleteStudent } from "./application/delete_student.js?v=20260716-no-eager-auth";
import { CurrentStudentSession } from "./application/current_student_session.js?v=20260716-no-eager-auth";
import { getStudentAuthService } from "./auth/student_auth_service.js?v=20260716-no-eager-auth";
import { findSyllabusScopeByCountry } from "../syllabusscope/syllabusscope_module.js?v=20260823-student-country-v1";
import { studentLevels } from "../../config/firebase/student_schema.js";

const studentRepository = new FirestoreStudentRepository();
const getStudent = new GetStudent(studentRepository);
const getStudentAcademicScopeUseCase = new GetStudentAcademicScope(
  studentRepository
);
const getStudentSummaryUseCase = new GetStudentSummary(studentRepository);
const listStudentsUseCase = new ListStudents(studentRepository);
const searchStudentsUseCase = new SearchStudents(studentRepository);
const createStudent = new CreateStudent({
  studentRepository,
  findSyllabusScopeByCountry
});
const updateStudent = new UpdateStudent(studentRepository);
const deleteStudent = new DeleteStudent(studentRepository);
const currentStudentSession = new CurrentStudentSession(getStudent);

async function getStudentById(studentId) {
  return getStudent.execute(studentId);
}

/**
 * @param {string} studentId
 * @returns {Promise<{
 *   studentId: string,
 *   country: string,
 *   level: string,
 *   year: number
 * }|null>}
 */
async function getStudentAcademicScope(studentId) {
  return getStudentAcademicScopeUseCase.execute(studentId);
}

async function getStudentSummaryById(studentId) {
  return getStudentSummaryUseCase.execute(studentId);
}

async function findStudentByUsername(username) {
  return studentRepository.findByUsername(username);
}

async function listStudents() {
  return listStudentsUseCase.execute();
}

/**
 * @param {{name: string, yearOfBirth: number, level: string, grade: number}} criteria
 * @returns {Promise<Array<{id: string, name: string, yearOfBirth: number, level: string, grade: number}>>}
 */
async function searchStudents(criteria) {
  return searchStudentsUseCase.execute(criteria);
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
  clearCurrentStudent,
  createStudentRecord,
  deleteStudentRecord,
  findStudentByUsername,
  getCurrentStudent,
  getCurrentStudentAuthUser,
  getStudentAcademicScope,
  getStudentById,
  getStudentIdToken,
  getStudentSummaryById,
  listStudents,
  loadCurrentStudent,
  onStudentAuthStateChanged,
  requireCurrentStudentAuthUser,
  searchStudents,
  signInStudent,
  signOutStudent,
  signUpStudent,
  studentLevels,
  updateStudentRecord
};
