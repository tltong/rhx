import { FirestoreStudentRepository } from "./infrastructure/firestore_student_repository.js?v=20261110-student-profile-v1";
import { GetStudent } from "./application/get_student.js?v=20260716-no-eager-auth";
import { GetStudentAcademicScope } from "./application/get_student_academic_scope.js?v=20261110-student-profile-v1";
import { DeleteStudent } from "./application/delete_student.js?v=20260716-no-eager-auth";
import { CurrentStudentSession } from "./application/current_student_session.js?v=20260716-no-eager-auth";
import { getStudentAuthService } from "./auth/student_auth_service.js?v=20261031-renewal-restart-v1";
import { studentLevels } from "../../config/firebase/student_schema.js";
import {createStudentProfile, updateStudentProfile, getStudentSummary, listStudentProfiles, searchStudentProfiles,
  isStudentUsernameAvailable} from "./student_profile_module.js?v=20261110-student-profile-v1";
export {getStudentProfile, updateStudentProfile, listStudentProfiles, changeStudentUsername, getStudentCredentialChange,
  retryStudentUsernameChange, resetStudentPin} from "./student_profile_module.js?v=20261110-student-profile-v1";

const studentRepository = new FirestoreStudentRepository();
const getStudent = new GetStudent(studentRepository);
const getStudentAcademicScopeUseCase = new GetStudentAcademicScope(
  studentRepository
);
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
  return getStudentSummary({studentId});
}

async function findStudentByUsername(username) {
  return (await isStudentUsernameAvailable({username})).available ? null : {username};
}

async function listStudents() {
  const students = []; let cursor;
  do {
    const page = await listStudentProfiles({limit: 100, ...(cursor ? {cursor} : {})});
    students.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  return students.sort((first, second) => String(first.name || "").localeCompare(String(second.name || "")));
}

/**
 * @param {{name: string, yearOfBirth: number, level: string, grade: number}} criteria
 * @returns {Promise<Array<{id: string, name: string, yearOfBirth: number, level: string, grade: number}>>}
 */
async function searchStudents(criteria) {
  return searchStudentProfiles(criteria);
}

async function createStudentRecord(data) {
  return createStudentProfile({studentId: data.id, name: data.name, username: data.username, country: data.country, level: data.level,
    yearOfBirth: data.yearOfBirth, standardAtYearOfRegistration: data.standardAtYearOfRegistration});
}

async function updateStudentRecord(student, changes) {
  const saved = await updateStudentProfile({studentId: student.id, expectedVersion: student.profileVersion || 0, changes});
  Object.assign(student, saved);
  return student;
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
