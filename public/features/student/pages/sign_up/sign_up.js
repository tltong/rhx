import {
  createStudentRecord,
  findStudentByUsername,
  signUpStudent
} from "../../student_module.js?v=20260715-student-levels";
import { studentLevels } from "../../../../config/firebase/student_schema.js?v=20260715-student-levels";

const STUDENT_EMAIL_DOMAIN = "rhx.com";
const PIN_PATTERN = /^\d{6}$/;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;
const STUDENT_LEVELS = new Set(Object.values(studentLevels));

const formEl = document.querySelector("#student-sign-up-form");
const levelEl = document.querySelector("#student-level");
const submitButton = document.querySelector("#student-sign-up-submit");
const statusEl = document.querySelector("#student-sign-up-status");

function formatLevelLabel(level) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function renderLevelOptions() {
  Object.values(studentLevels).forEach((level) => {
    const option = document.createElement("option");

    option.value = level;
    option.textContent = formatLevelLabel(level);
    levelEl.append(option);
  });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function normalizeUsername(username) {
  const normalizedUsername = String(username || "").trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new Error("Username must be 3-40 characters using letters, numbers, dot, underscore, or hyphen.");
  }

  return normalizedUsername;
}

function buildStudentEmail(username) {
  return `${normalizeUsername(username)}@${STUDENT_EMAIL_DOMAIN}`;
}

function validatePin(pin) {
  const normalizedPin = String(pin || "").trim();

  if (!PIN_PATTERN.test(normalizedPin)) {
    throw new Error("PIN must be exactly 6 digits.");
  }

  return normalizedPin;
}

function validateLevel(level) {
  const normalizedLevel = String(level || "").trim().toLowerCase();

  if (!STUDENT_LEVELS.has(normalizedLevel)) {
    throw new Error(`Level must be one of: ${Object.values(studentLevels).join(", ")}.`);
  }

  return normalizedLevel;
}

renderLevelOptions();

function getFormData() {
  const formData = new FormData(formEl);
  const now = new Date();
  const yearOfBirth = Number(formData.get("yearOfBirth"));

  if (!Number.isInteger(yearOfBirth)) {
    throw new Error("Year of birth must be a valid year.");
  }

  return {
    name: String(formData.get("name") || "").trim(),
    username: normalizeUsername(formData.get("username")),
    pin: validatePin(formData.get("pin")),
    yearOfBirth,
    level: validateLevel(formData.get("level")),
    standardAtYearOfRegistration: String(formData.get("standard") || "").trim(),
    yearOfRegistration: now.getFullYear(),
    registrationDate: now
  };
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  setStatus("Creating student account...");

  try {
    const input = getFormData();
    const existingStudent = await findStudentByUsername(input.username);

    if (existingStudent) {
      throw new Error("Username is already taken.");
    }

    const email = buildStudentEmail(input.username);
    const authUser = await signUpStudent({
      email,
      password: input.pin,
      displayName: input.name
    });

    await createStudentRecord({
      id: authUser.uid,
      email,
      name: input.name,
      username: input.username,
      level: input.level,
      yearOfBirth: input.yearOfBirth,
      yearOfRegistration: input.yearOfRegistration,
      registrationDate: input.registrationDate,
      standardAtYearOfRegistration: input.standardAtYearOfRegistration
    });

    formEl.reset();
    setStatus("Student account created.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not create student account.", true);
  } finally {
    submitButton.disabled = false;
  }
});
