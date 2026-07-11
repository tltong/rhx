import {
  STUDENTS_COLLECTION,
  studentSchema
} from "../config/firebase/student_schema.js";
import { PRACTICES_COLLECTION } from "../config/firebase/practice_schema.js";
import { QUESTIONS_COLLECTION } from "../config/firebase/question_schema.js";
import {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  COMPLETED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION
} from "../config/firebase/student_practice_schema.js";
import { addCompletedQuestionIds } from "./user_completed_questions_handler.js";
import {
  getCurrentFirebaseAuthUser,
  onFirebaseAuthStateChanged,
  requireCurrentFirebaseAuthRawUser
} from "../utils/firebase/firebase_auth.js";
import { getFirebaseEmailAuth } from "../utils/firebase/firebase_email_auth.js";
import {
  createDocument,
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../utils/firebase/firebase_ops.js";

export const STUDENT_EMAIL_DOMAIN = "rhx.com";
export const STUDENT_LANDING_PAGE_URL = "/pages/student_landing_page/student_landing_page.html";
export const STUDENT_SIGN_IN_PAGE_URL = "/pages/student_sign_in/student_sign_in.html";
export const STUDENT_SIGN_UP_PAGE_URL = "/pages/student_sign_up/student_sign_up.html";
export const STUDENT_LOG_OUT_REDIRECT_URL = "/index.html";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;
const PIN_PATTERN = /^\d{6}$/;
const STANDARD_VALUES = new Set(["1", "2", "3", "4", "5", "6"]);

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function getAssignedPracticesCollectionPath(studentId) {
  return `${STUDENT_PRACTICES_COLLECTION}/${studentId}/${ASSIGNED_PRACTICES_SUBCOLLECTION}`;
}

function getCompletedPracticesCollectionPath(studentId) {
  return `${STUDENT_PRACTICES_COLLECTION}/${studentId}/${COMPLETED_PRACTICES_SUBCOLLECTION}`;
}

function requireCurrentStudentId(studentId = null) {
  const user = getCurrentStudentAuthUser();

  if (!user) {
    throw new Error("No authenticated student is currently signed in.");
  }

  const requestedStudentId = studentId === null || studentId === undefined || studentId === ""
    ? user.uid
    : requireNonEmptyString(studentId, "studentId");

  if (requestedStudentId !== user.uid) {
    throw new Error("The requested student does not match the signed-in student.");
  }

  return requestedStudentId;
}

function normalizePracticeId(practiceId) {
  return requireNonEmptyString(practiceId, "practiceId");
}

function normalizeStudentAnswerOption(value, questionId) {
  const option = requireNonEmptyString(value, `studentAnswers.${questionId}`)
    .toLowerCase();

  if (!["a", "b", "c", "d"].includes(option)) {
    throw new Error(`Answer for question ${questionId} must be a, b, c, or d.`);
  }

  return option;
}

function normalizeTimeTakenSeconds(value) {
  const seconds = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("timeTakenSeconds must be a non-negative number.");
  }

  return Math.round(seconds);
}

function getStudentAnswerMap(answers = {}) {
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("studentAnswers must be a non-null object.");
  }

  return answers;
}

function buildCompletedQuestionGroups(questions = []) {
  return questions.reduce((groups, question) => {
    const syllabusId = requireNonEmptyString(question.syllabusId, "question.syllabusId");
    const topicId = requireNonEmptyString(question.topicId, "question.topicId");
    const key = `${syllabusId}::${topicId}`;

    if (!groups.has(key)) {
      groups.set(key, {
        syllabusId,
        topicId,
        questionIds: []
      });
    }

    groups.get(key).questionIds.push(question.id);

    return groups;
  }, new Map());
}

function normalizeUsername(username) {
  const normalizedUsername = requireNonEmptyString(username, "username").toLowerCase();

  if (normalizedUsername.includes("@")) {
    throw new Error("Username must not include an email domain.");
  }

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new Error("Username must be 3-40 characters using letters, numbers, dot, underscore, or hyphen.");
  }

  return normalizedUsername;
}

function validatePin(pin) {
  const normalizedPin = String(pin || "").trim();

  if (!PIN_PATTERN.test(normalizedPin)) {
    throw new Error("PIN must be exactly 6 digits.");
  }

  return normalizedPin;
}

function validateYearOfBirth(yearOfBirth) {
  const parsedYear = Number(yearOfBirth);
  const currentYear = new Date().getFullYear();

  if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > currentYear) {
    throw new Error("Year of birth must be a valid year.");
  }

  return parsedYear;
}

function validateStandard(standard) {
  const normalizedStandard = String(standard || "").trim();

  if (!STANDARD_VALUES.has(normalizedStandard)) {
    throw new Error("Standard must be between 1 and 6.");
  }

  return normalizedStandard;
}

function validateStudentSignUpInput(input) {
  const username = normalizeUsername(input.username);

  return {
    name: requireNonEmptyString(input.name, "name"),
    username,
    yearOfBirth: validateYearOfBirth(input.yearOfBirth),
    pin: validatePin(input.pin),
    standardAtYearOfRegistration: validateStandard(input.standard)
  };
}

export function getStudentSchema() {
  return studentSchema;
}

export function buildStudentEmail(username) {
  return `${normalizeUsername(username)}@${STUDENT_EMAIL_DOMAIN}`;
}

export async function checkStudentUsernameAvailability(username) {
  const normalizedUsername = normalizeUsername(username);
  const existingStudents = await readCollection(
    STUDENTS_COLLECTION,
    (collection) => collection.where("username", "==", normalizedUsername).limit(1)
  );

  return {
    username: normalizedUsername,
    email: buildStudentEmail(normalizedUsername),
    available: existingStudents.length === 0
  };
}

export function getCurrentStudentAuthUser() {
  return getCurrentFirebaseAuthUser();
}

export function readStudent(studentId) {
  return readDocument(STUDENTS_COLLECTION, requireNonEmptyString(studentId, "studentId"));
}

export function readStudents(buildQuery = null) {
  return readCollection(STUDENTS_COLLECTION, buildQuery);
}

export async function readAssignedPracticeIds(studentId) {
  const id = requireNonEmptyString(studentId, "studentId");
  const assignedPracticeRefs = await readCollection(getAssignedPracticesCollectionPath(id));

  return assignedPracticeRefs.map((practiceRef) => practiceRef.id);
}

export async function readStudentAssignedPractices(studentId) {
  const assignedPracticeIds = await readAssignedPracticeIds(studentId);
  const practices = await Promise.all(
    assignedPracticeIds.map((practiceId) => readDocument(PRACTICES_COLLECTION, practiceId))
  );

  return practices.filter(Boolean);
}

export async function readStudentAssignedPractice(studentId, practiceId) {
  const id = requireCurrentStudentId(studentId);
  const selectedPracticeId = normalizePracticeId(practiceId);
  const assignment = await readDocument(
    getAssignedPracticesCollectionPath(id),
    selectedPracticeId
  );

  if (!assignment) {
    throw new Error("Practice is not currently assigned to this student.");
  }

  const practice = await readDocument(PRACTICES_COLLECTION, selectedPracticeId);

  if (!practice) {
    throw new Error("Practice was not found.");
  }

  const questionIds = Array.isArray(practice.questions) ? practice.questions : [];
  const questions = await Promise.all(
    questionIds.map((questionId) => readDocument(QUESTIONS_COLLECTION, questionId))
  );
  const missingQuestionIndex = questions.findIndex((question) => !question);

  if (missingQuestionIndex >= 0) {
    throw new Error(`Question ${questionIds[missingQuestionIndex]} was not found.`);
  }

  return {
    studentId: id,
    practice,
    questions
  };
}

export async function getCurrentStudentAssignedPractice(practiceId) {
  return readStudentAssignedPractice(null, practiceId);
}

export async function getCurrentStudentAssignedPractices() {
  const user = getCurrentStudentAuthUser();

  if (!user) {
    throw new Error("No authenticated student is currently signed in.");
  }

  return readStudentAssignedPractices(user.uid);
}

export async function completeStudentPractice(studentId, practiceId, studentAnswers = {}, options = {}) {
  const id = requireCurrentStudentId(studentId);
  const selectedPracticeId = normalizePracticeId(practiceId);
  const answerMap = getStudentAnswerMap(studentAnswers);
  const timeTakenSeconds = normalizeTimeTakenSeconds(options.timeTakenSeconds || 0);
  const { practice, questions } = await readStudentAssignedPractice(id, selectedPracticeId);
  const completedAnswers = {};

  questions.forEach((question) => {
    const selectedOption = normalizeStudentAnswerOption(answerMap[question.id], question.id);
    const correctAnswer = requireNonEmptyString(question.correctAnswer, "question.correctAnswer").toLowerCase();

    completedAnswers[question.id] = {
      selectedOption,
      correctAnswer,
      isCorrect: selectedOption === correctAnswer
    };
  });

  const questionsCorrect = Object.values(completedAnswers)
    .filter((answer) => answer.isCorrect).length;
  const completedPracticeData = {
    dateCompleted: new Date(),
    questionsCorrect,
    totalQuestions: questions.length,
    timeTakenSeconds,
    studentAnswers: completedAnswers
  };

  await writeDocument(STUDENT_PRACTICES_COLLECTION, id, {}, { merge: true });
  await writeDocument(
    getCompletedPracticesCollectionPath(id),
    selectedPracticeId,
    completedPracticeData,
    { merge: true }
  );
  await deleteDocument(getAssignedPracticesCollectionPath(id), selectedPracticeId);

  const completedQuestionGroups = buildCompletedQuestionGroups(questions);

  for (const group of completedQuestionGroups.values()) {
    await addCompletedQuestionIds(id, group.syllabusId, group.topicId, group.questionIds);
  }

  return {
    studentId: id,
    practice,
    completedPractice: {
      ...completedPracticeData,
      id: selectedPracticeId
    },
    questions
  };
}

export function completeCurrentStudentPractice(practiceId, studentAnswers = {}, options = {}) {
  return completeStudentPractice(null, practiceId, studentAnswers, options);
}

export function onStudentAuthStateChanged(callback) {
  if (typeof callback !== "function") {
    throw new Error("callback must be a function.");
  }

  return onFirebaseAuthStateChanged(callback);
}

export async function createStudentAccount(input) {
  const validatedInput = validateStudentSignUpInput(input);
  const usernameCheck = await checkStudentUsernameAvailability(validatedInput.username);

  if (!usernameCheck.available) {
    throw new Error("Username is already taken.");
  }

  const email = buildStudentEmail(validatedInput.username);
  const auth = getFirebaseEmailAuth();
  let authUser = null;

  try {
    authUser = await auth.create(email, validatedInput.pin, {
      displayName: validatedInput.name
    });
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      throw new Error("Username is already taken.");
    }

    throw error;
  }

  const now = new Date();
  const studentData = {
    authUid: authUser.uid,
    email,
    name: validatedInput.name,
    username: validatedInput.username,
    yearOfBirth: validatedInput.yearOfBirth,
    yearOfRegistration: now.getFullYear(),
    registrationDate: now,
    standardAtYearOfRegistration: validatedInput.standardAtYearOfRegistration
  };

  try {
    await createDocument(STUDENTS_COLLECTION, studentData, authUser.uid);
  } catch (error) {
    try {
      await auth.delete();
    } catch (rollbackError) {
      console.warn("Could not roll back Firebase Auth user after student profile write failed.", rollbackError);
    }

    throw error;
  }

  return {
    user: authUser,
    student: studentData,
    landingPageUrl: STUDENT_LANDING_PAGE_URL
  };
}

export async function signInStudent(username, pin) {
  const auth = getFirebaseEmailAuth();
  const user = await auth.signIn(buildStudentEmail(username), validatePin(pin));
  const student = await readDocument(STUDENTS_COLLECTION, user.uid);

  return {
    user,
    student,
    landingPageUrl: STUDENT_LANDING_PAGE_URL
  };
}

export async function signOutStudent() {
  await getFirebaseEmailAuth().signOut();

  return {
    signedOut: true,
    redirectUrl: STUDENT_LOG_OUT_REDIRECT_URL
  };
}

export const logOutStudent = signOutStudent;

export async function getCurrentStudent() {
  const user = getCurrentStudentAuthUser();

  if (!user) {
    return null;
  }

  const student = await readDocument(STUDENTS_COLLECTION, user.uid);

  return {
    user,
    student
  };
}

export async function updateCurrentStudent(updates = {}) {
  const auth = getFirebaseEmailAuth();
  const user = requireCurrentFirebaseAuthRawUser();

  const allowedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    allowedUpdates.name = requireNonEmptyString(updates.name, "name");
    await auth.update({ displayName: allowedUpdates.name });
  }

  if (Object.prototype.hasOwnProperty.call(updates, "yearOfBirth")) {
    allowedUpdates.yearOfBirth = validateYearOfBirth(updates.yearOfBirth);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "standardAtYearOfRegistration")) {
    allowedUpdates.standardAtYearOfRegistration = validateStandard(updates.standardAtYearOfRegistration);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid student updates were provided.");
  }

  await writeDocument(STUDENTS_COLLECTION, user.uid, allowedUpdates);

  return getCurrentStudent();
}

export async function deleteCurrentStudentAccount() {
  const auth = getFirebaseEmailAuth();
  const user = requireCurrentFirebaseAuthRawUser();

  await deleteDocument(STUDENTS_COLLECTION, user.uid);
  await auth.delete();

  return {
    uid: user.uid,
    deleted: true
  };
}

export default {
  STUDENT_EMAIL_DOMAIN,
  STUDENT_LANDING_PAGE_URL,
  STUDENT_SIGN_IN_PAGE_URL,
  STUDENT_SIGN_UP_PAGE_URL,
  STUDENT_LOG_OUT_REDIRECT_URL,
  getStudentSchema,
  buildStudentEmail,
  checkStudentUsernameAvailability,
  readStudent,
  readStudents,
  readAssignedPracticeIds,
  readStudentAssignedPractices,
  readStudentAssignedPractice,
  getCurrentStudentAssignedPractice,
  getCurrentStudentAssignedPractices,
  completeStudentPractice,
  completeCurrentStudentPractice,
  createStudentAccount,
  signInStudent,
  signOutStudent,
  logOutStudent,
  getCurrentStudent,
  getCurrentStudentAuthUser,
  onStudentAuthStateChanged,
  updateCurrentStudent,
  deleteCurrentStudentAccount
};
