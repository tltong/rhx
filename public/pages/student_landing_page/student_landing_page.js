import {
  getCurrentStudent,
  getCurrentStudentAssignedPractices,
  onStudentAuthStateChanged,
  signOutStudent
} from "/handler/student_handler.js?v=20260711-nested-questions";

const STUDENT_SIGN_IN_PAGE_URL = "/pages/student_sign_in/student_sign_in.html";
const STUDENT_LOG_OUT_REDIRECT_URL = "/index.html";
const PRACTICE_COMMENCE_PAGE_URL = "/pages/practice_commence/practice_commence.html";
const subtitleEl = document.querySelector("#student-landing-subtitle");
const profileEl = document.querySelector("#student-profile");
const practicesEl = document.querySelector("#student-practices");
const practiceListEl = document.querySelector("#student-practice-list");
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

function formatPracticeTitle(practice = {}) {
  return [
    practice.country,
    practice.level,
    practice.year ? `Year ${practice.year}` : "",
    practice.subject
  ]
    .filter(Boolean)
    .join(" / ");
}

function renderEmptyPractices() {
  if (!practiceListEl) {
    return;
  }

  practiceListEl.innerHTML = "";

  const empty = document.createElement("p");

  empty.className = "empty-state";
  empty.textContent = "No practices assigned yet.";
  practiceListEl.append(empty);
}

function renderPracticeCard(practice = {}) {
  const card = document.createElement("div");
  const title = document.createElement("p");
  const meta = document.createElement("p");
  const action = document.createElement("a");
  const questionCount = Array.isArray(practice.questions)
    ? practice.questions.length
    : 0;

  card.className = "practice-card";
  title.className = "practice-card-title";
  meta.className = "practice-card-meta";
  title.textContent = formatPracticeTitle(practice) || `Practice ${practice.id || ""}`.trim();
  meta.textContent = [
    practice.difficulty,
    practice.language,
    `${questionCount} question${questionCount === 1 ? "" : "s"}`,
    practice.dateGenerated ? `Generated ${formatDate(practice.dateGenerated)}` : ""
  ]
    .filter(Boolean)
    .join(" | ");
  action.className = "practice-card-action";
  action.href = `${PRACTICE_COMMENCE_PAGE_URL}?practiceId=${encodeURIComponent(practice.id || "")}`;
  action.textContent = "Start Practice";

  card.append(title, meta, action);

  return card;
}

function renderAssignedPractices(practices = []) {
  setHidden(practicesEl, false);

  if (!practiceListEl) {
    return;
  }

  practiceListEl.innerHTML = "";

  if (practices.length === 0) {
    renderEmptyPractices();
    return;
  }

  practices.forEach((practice) => {
    practiceListEl.append(renderPracticeCard(practice));
  });
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

    const practices = await getCurrentStudentAssignedPractices();

    renderAssignedPractices(practices);
    setStatus(practices.length > 0
      ? `Signed in. ${practices.length} practice(s) assigned.`
      : "Signed in. No practices assigned yet.");
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
