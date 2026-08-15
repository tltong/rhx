import {
  listCurrentStudentAssignedPractices
} from "../../practice_session_module.js?v=20260810-completed-practice";
import {
  onStudentAuthStateChanged
} from "../../../student/student_module.js?v=20260716-no-eager-auth";

const SIGN_IN_URL = "/features/student/pages/sign_in/sign_in.html";
const COMMENCE_PRACTICE_URL =
  "/features/practice_session/pages/commence_practice/commence_practice.html";

const statusEl = document.querySelector("#assigned-practices-status");
const listEl = document.querySelector("#assigned-practices-list");

let loadedStudentId = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.classList.toggle("is-error", isError);
}

function formatPracticeType(type) {
  return String(type || "Practice")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium"
  }).format(date);
}

function createDetail(label, value) {
  const container = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  container.append(term, description);

  return container;
}

function createCommencePracticeUrl(practiceId) {
  const url = new URL(COMMENCE_PRACTICE_URL, window.location.origin);

  url.searchParams.set("practiceId", practiceId);

  return `${url.pathname}${url.search}`;
}

function renderPractices(entries) {
  listEl.replaceChildren();

  entries.forEach(({ assignment, practice }, index) => {
    const item = document.createElement("li");
    const content = practice
      ? document.createElement("a")
      : document.createElement("div");
    const heading = document.createElement("h2");
    const details = document.createElement("dl");

    item.className = "practice-item";
    content.className = practice
      ? "practice-link"
      : "unavailable-practice";

    if (practice) {
      content.href = createCommencePracticeUrl(assignment.practiceId);
    } else {
      item.classList.add("is-unavailable");
    }

    heading.textContent = practice
      ? `${formatPracticeType(practice.type)} ${index + 1}`
      : `Unavailable Practice ${index + 1}`;
    details.className = "practice-details";
    details.append(
      createDetail("Practice ID", assignment.practiceId),
      createDetail(
        "Questions",
        practice ? String(practice.questions.length) : "Unavailable"
      ),
      createDetail(
        "Generated",
        practice ? formatDate(practice.dateGenerated) : "Unavailable"
      )
    );
    content.append(heading, details);
    item.append(content);
    listEl.append(item);
  });

  statusEl.hidden = entries.length > 0;
  listEl.hidden = entries.length === 0;

  if (entries.length === 0) {
    setStatus("No practices are currently assigned.");
  }
}

async function loadAssignedPractices(authUser) {
  if (loadedStudentId === authUser.uid) {
    return;
  }

  loadedStudentId = authUser.uid;
  setStatus("Loading assigned practices...");

  try {
    renderPractices(await listCurrentStudentAssignedPractices());
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load assigned practices.", true);
  }
}

onStudentAuthStateChanged((authUser) => {
  if (!authUser) {
    window.location.replace(SIGN_IN_URL);
    return;
  }

  void loadAssignedPractices(authUser);
});