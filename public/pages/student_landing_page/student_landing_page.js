import {
  getCurrentStudent,
  onStudentAuthStateChanged,
  signOutStudent
} from "/handler/student_handler.js";

const STUDENT_SIGN_IN_PAGE_URL = "/pages/student_sign_in/student_sign_in.html";
const STUDENT_LOG_OUT_REDIRECT_URL = "/index.html";
const subtitleEl = document.querySelector("#student-landing-subtitle");
const profileEl = document.querySelector("#student-profile");
const statusEl = document.querySelector("#student-landing-status");
const logOutButton = document.querySelector("#student-log-out, #student-sign-out");
let isLoggingOut = false;

const fieldEls = {
  name: document.querySelector("#student-profile-name"),
  username: document.querySelector("#student-profile-username"),
  yearOfBirth: document.querySelector("#student-profile-year-of-birth"),
  yearOfRegistration: document.querySelector("#student-profile-year-of-registration"),
  registrationDate: document.querySelector("#student-profile-registration-date"),
  standard: document.querySelector("#student-profile-standard")
};

function setStatus(message, isError = false) {
  if (!statusEl) {
    return;
  }

  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setHidden(element, isHidden) {
  if (element) {
    element.hidden = isHidden;
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  return String(value);
}

function renderStudent(student) {
  setText(fieldEls.name, student.name || "");
  setText(fieldEls.username, student.username || "");
  setText(fieldEls.yearOfBirth, student.yearOfBirth || "");
  setText(fieldEls.yearOfRegistration, student.yearOfRegistration || "");
  setText(fieldEls.registrationDate, formatDate(student.registrationDate));
  setText(fieldEls.standard, student.standardAtYearOfRegistration
    ? `Standard ${student.standardAtYearOfRegistration}`
    : "");

  setText(subtitleEl, `Welcome, ${student.name || "student"}.`);
  setHidden(profileEl, false);
  setHidden(logOutButton, false);

  setStatus("Signed in.");
}

onStudentAuthStateChanged(async (user) => {
  if (!user) {
    if (isLoggingOut) {
      return;
    }

    window.location.href = STUDENT_SIGN_IN_PAGE_URL;
    return;
  }

  try {
    const currentStudent = await getCurrentStudent();

    if (!currentStudent?.student) {
      setStatus("Signed in, but no student profile was found.", true);
      return;
    }

    renderStudent(currentStudent.student);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load student profile.", true);
  }
});

if (logOutButton) {
  logOutButton.addEventListener("click", async () => {
    isLoggingOut = true;
    logOutButton.disabled = true;
    setStatus("Logging out...");

    try {
      await signOutStudent();

      window.location.href = STUDENT_LOG_OUT_REDIRECT_URL;
    } catch (error) {
      console.error(error);
      isLoggingOut = false;
      logOutButton.disabled = false;
      setStatus(error.message || "Could not log out.", true);
    }
  });
}
