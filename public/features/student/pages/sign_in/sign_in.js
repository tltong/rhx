import {
  loadCurrentStudent,
  onStudentAuthStateChanged,
  signInStudent,
  signOutStudent
} from "../../student_module.js?v=20260716-no-eager-auth";

const STUDENT_EMAIL_DOMAIN = "rhx.com";
const STUDENT_LANDING_URL =
  "/features/student/pages/landing/landing.html";
const PIN_PATTERN = /^\d{6}$/;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;

const formEl = document.querySelector("#student-sign-in-form");
const usernameEl = document.querySelector("#student-username");
const pinEl = document.querySelector("#student-pin");
const submitButton = document.querySelector("#student-sign-in-submit");
const statusEl = document.querySelector("#student-sign-in-status");

let redirecting = false;

function redirectToStudentLanding() {
  if (redirecting) {
    return;
  }

  redirecting = true;
  window.location.replace(STUDENT_LANDING_URL);
}

function normalizeUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Username must be 3-40 characters using letters, numbers, dot, underscore, or hyphen."
    );
  }

  return username;
}

function normalizePin(value) {
  const pin = String(value ?? "").trim();

  if (!PIN_PATTERN.test(pin)) {
    throw new Error("PIN must be exactly 6 digits.");
  }

  return pin;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function updateSubmitState() {
  const usernameIsValid = USERNAME_PATTERN.test(
    usernameEl.value.trim().toLowerCase()
  );
  const pinIsValid = PIN_PATTERN.test(pinEl.value.trim());

  submitButton.disabled = !(usernameIsValid && pinIsValid);
}

function getErrorMessage(error, username) {
  const authCode = String(error?.code ?? "");

  if (
    authCode === "auth/invalid-credential" ||
    authCode === "auth/user-not-found" ||
    authCode === "auth/wrong-password" ||
    authCode === "auth/invalid-login-credentials"
  ) {
    return "Username or PIN is incorrect.";
  }

  const internalEmail = `${username}@${STUDENT_EMAIL_DOMAIN}`;

  return String(error?.message || "Could not sign in.")
    .replaceAll(internalEmail, username);
}

onStudentAuthStateChanged((authUser) => {
  if (authUser) {
    redirectToStudentLanding();
  }
});

formEl.addEventListener("input", updateSubmitState);

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  let username = usernameEl.value.trim().toLowerCase();

  submitButton.disabled = true;
  setStatus("Signing in...");

  try {
    username = normalizeUsername(username);
    const pin = normalizePin(pinEl.value);
    const authUser = await signInStudent({
      email: `${username}@${STUDENT_EMAIL_DOMAIN}`,
      password: pin
    });
    const student = await loadCurrentStudent(authUser.uid);

    if (!student) {
      await signOutStudent();
      throw new Error("Student profile was not found.");
    }

    setStatus("Signed in. Redirecting...");
    redirectToStudentLanding();
  } catch (error) {
    console.error(error);
    setStatus(getErrorMessage(error, username), true);
    updateSubmitState();
  }
});

updateSubmitState();
