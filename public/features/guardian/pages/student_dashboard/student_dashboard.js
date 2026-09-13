import {
  getGuardianById,
  onGuardianAuthStateChanged
} from "../../guardian_module.js?v=20260908-guardian-student-dashboard-v1";
import {
  getGuardianStudentLink,
  guardianStudentLinkStates
} from "../../../guardian_student_link/guardian_student_link_module.js?v=20260908-guardian-student-dashboard-v1";
import {
  getStudentDashboard,
  renderSyllabusProgressPane
} from "../../../student_dashboard/student_dashboard_module.js?v=20260908-guardian-progress-pane-v1";

const GUARDIAN_SIGN_IN_URL =
  "/features/guardian/pages/sign_in/sign_in.html";

const pageTitleEl = document.querySelector("#page-title");
const summaryEl = document.querySelector("#student-summary");
const studentNameEl = document.querySelector("#student-summary-heading");
const initialsEl = document.querySelector("#student-initials");
const countryEl = document.querySelector("#student-country");
const gradeEl = document.querySelector("#student-grade");
const streamEl = document.querySelector("#student-stream");
const statusEl = document.querySelector("#student-dashboard-status");
const progressPaneEl = document.querySelector("#syllabus-progress-pane");

function getRequestedStudentId() {
  const studentId = String(
    new URLSearchParams(window.location.search).get("studentId") || ""
  ).trim();

  if (!studentId) {
    throw new Error("A linked student ID is required.");
  }

  return studentId;
}

function waitForGuardianAuthState() {
  return new Promise((resolve, reject) => {
    let unsubscribe = null;

    try {
      unsubscribe = onGuardianAuthStateChanged((authUser) => {
        unsubscribe?.();
        resolve(authUser);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function titleCase(value) {
  const text = String(value || "").trim();

  return text
    ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    : "Not specified";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = !message;
}

function renderStudentSummary(dashboard) {
  const {student, stream} = dashboard;
  const studentName = student.name || "Student";

  pageTitleEl.textContent = `${studentName}'s Progress`;
  studentNameEl.textContent = studentName;
  initialsEl.textContent = getInitials(studentName);
  countryEl.textContent = student.country || "Not specified";
  gradeEl.textContent = [
    titleCase(student.level),
    student.currentGrade ? `Year ${student.currentGrade}` : ""
  ].filter(Boolean).join(" / ");
  streamEl.textContent = stream?.name || "Not assigned";
  summaryEl.hidden = false;
}

async function requireGuardianStudentAccess(guardianId, studentId) {
  const link = await getGuardianStudentLink({guardianId, studentId});

  if (!link || link.state !== guardianStudentLinkStates.ACTIVE) {
    throw new Error(
      "This student is not actively linked to your guardian account."
    );
  }
}

async function initializePage() {
  try {
    const studentId = getRequestedStudentId();
    const authUser = await waitForGuardianAuthState();

    if (!authUser) {
      window.location.replace(GUARDIAN_SIGN_IN_URL);
      return;
    }

    const guardian = await getGuardianById(authUser.uid);

    if (!guardian) {
      throw new Error("The signed-in account is not a guardian account.");
    }

    await requireGuardianStudentAccess(authUser.uid, studentId);
    setStatus("Loading student progress...");

    const dashboard = await getStudentDashboard(studentId);

    if (!dashboard) {
      throw new Error("The linked student's dashboard could not be loaded.");
    }

    renderStudentSummary(dashboard);
    renderSyllabusProgressPane({
      container: progressPaneEl,
      studentId,
      syllabuses: dashboard.syllabuses,
      description:
        "Topic levels and completed practice history for this student."
    });
    progressPaneEl.hidden = false;
    setStatus("");
  } catch (error) {
    console.error(error);
    progressPaneEl.hidden = true;
    setStatus(error.message || "Could not load student progress.", true);
  }
}

void initializePage();
