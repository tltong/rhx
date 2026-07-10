import {
  STUDENTS_COLLECTION,
  studentSchema
} from "../config/firebase/student_schema.js";
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
  return getFirebaseEmailAuth().read();
}

export function onStudentAuthStateChanged(callback) {
  if (typeof callback !== "function") {
    throw new Error("callback must be a function.");
  }

  return getFirebaseEmailAuth().onAuthStateChanged(callback);
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
  const user = auth.requireCurrentUser ? auth.requireCurrentUser() : null;

  if (!user) {
    throw new Error("No authenticated student is currently signed in.");
  }

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
  const user = auth.requireCurrentUser ? auth.requireCurrentUser() : null;

  if (!user) {
    throw new Error("No authenticated student is currently signed in.");
  }

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
