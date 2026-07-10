import {
  checkStudentUsernameAvailability,
  createStudentAccount
} from "/handler/student_handler.js?v=20260709-username-message-fix";

const form = document.querySelector("#student-sign-up-form");
const submitButton = document.querySelector("#student-sign-up-submit");
const statusEl = document.querySelector("#student-sign-up-status");
const usernameInput = document.querySelector("#student-username");
const emailPreviewEl = document.querySelector("#student-email-preview");
const pinInput = document.querySelector("#student-pin");
const nameInput = document.querySelector("#student-name");
const yearOfBirthInput = document.querySelector("#student-year-of-birth");
const standardInput = document.querySelector("#student-standard");

let isSubmitting = false;
let isCheckingUsername = false;
let usernameIsAvailable = false;
let checkedUsername = "";
let usernameCheckTimer = null;
let usernameCheckSequence = 0;

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function getUserSafeErrorMessage(error, fallbackMessage) {
  if (error?.code === "auth/email-already-in-use") {
    return "Username is already taken.";
  }

  return (error?.message || fallbackMessage).replace(
    /([a-z0-9._-]+)@rhx\.com/gi,
    "$1"
  );
}

function setBusy(isBusy) {
  isSubmitting = isBusy;
  submitButton.textContent = isBusy ? "Creating account..." : "Create Student Account";
  updateSubmitState();
}

function updateEmailPreview() {
  emailPreviewEl.textContent = "";
}

function getCurrentUsername() {
  return usernameInput.value.trim().toLowerCase();
}

function hasCompleteForm() {
  return Boolean(
    nameInput.value.trim() &&
    getCurrentUsername() &&
    /^\d{6}$/.test(pinInput.value.trim()) &&
    yearOfBirthInput.value.trim() &&
    standardInput.value
  );
}

function updateSubmitState() {
  const usernameStillMatches = checkedUsername === getCurrentUsername();

  submitButton.disabled = Boolean(
    isSubmitting ||
    isCheckingUsername ||
    !hasCompleteForm() ||
    !usernameIsAvailable ||
    !usernameStillMatches
  );
}

async function runUsernameCheck(username, sequence) {
  if (!username || username.length < 3) {
    return;
  }

  isCheckingUsername = true;
  usernameIsAvailable = false;
  checkedUsername = username;
  emailPreviewEl.textContent = `Checking ${username}...`;
  updateSubmitState();

  try {
    const result = await checkStudentUsernameAvailability(username);

    if (sequence !== usernameCheckSequence) {
      return;
    }

    checkedUsername = result.username;
    usernameIsAvailable = result.available;
    emailPreviewEl.textContent = result.available
      ? `${result.username} is available.`
      : `${result.username} is already taken.`;
  } catch (error) {
    if (sequence !== usernameCheckSequence) {
      return;
    }

    usernameIsAvailable = false;
    checkedUsername = username;
    emailPreviewEl.textContent = getUserSafeErrorMessage(error, "Could not check username.");
  } finally {
    if (sequence === usernameCheckSequence) {
      isCheckingUsername = false;
      updateSubmitState();
    }
  }
}

function scheduleUsernameCheck() {
  clearTimeout(usernameCheckTimer);
  usernameCheckSequence += 1;

  const username = getCurrentUsername();
  const sequence = usernameCheckSequence;
  usernameIsAvailable = false;
  checkedUsername = "";
  isCheckingUsername = false;

  updateEmailPreview();

  if (!username) {
    updateSubmitState();
    return;
  }

  if (username.length < 3) {
    emailPreviewEl.textContent = "Username must be at least 3 characters.";
    updateSubmitState();
    return;
  }

  isCheckingUsername = true;
  emailPreviewEl.textContent = `Checking ${username}...`;
  updateSubmitState();

  usernameCheckTimer = setTimeout(() => {
    runUsernameCheck(username, sequence);
  }, 650);
}

pinInput.addEventListener("input", () => {
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
  updateSubmitState();
});

usernameInput.addEventListener("input", scheduleUsernameCheck);
usernameInput.addEventListener("blur", () => {
  clearTimeout(usernameCheckTimer);
  const username = getCurrentUsername();

  if (username && username.length >= 3 && checkedUsername !== username) {
    usernameCheckSequence += 1;
    runUsernameCheck(username, usernameCheckSequence);
  }
});

nameInput.addEventListener("input", updateSubmitState);
yearOfBirthInput.addEventListener("input", updateSubmitState);
standardInput.addEventListener("change", updateSubmitState);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (submitButton.disabled) {
    setStatus("Please complete all fields and choose an available username.", true);
    return;
  }

  setBusy(true);
  setStatus("Creating your student account...");

  try {
    const formData = new FormData(form);
    const result = await createStudentAccount({
      name: formData.get("name"),
      username: formData.get("username"),
      pin: formData.get("pin"),
      yearOfBirth: formData.get("yearOfBirth"),
      standard: formData.get("standard")
    });

    setStatus("Account created. Opening student landing page...");
    window.location.href = result.landingPageUrl;
  } catch (error) {
    console.error(error);
    setStatus(getUserSafeErrorMessage(error, "Could not create student account."), true);
  } finally {
    setBusy(false);
  }
});

updateEmailPreview();
updateSubmitState();
