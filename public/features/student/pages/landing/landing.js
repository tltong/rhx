import {
  clearCurrentStudent,
  onStudentAuthStateChanged,
  signOutStudent
} from "../../student_module.js?v=20260823-student-country-v1";
import {
  getStudentDashboard
} from "../../../student_dashboard/student_dashboard_module.js?v=20260823-topic-practice-v1";

const INDEX_URL = "/index.html";
const COMMENCE_PRACTICE_URL =
  "/features/practice_session/pages/commence_practice/commence_practice.html";

const welcomeEl = document.querySelector("#student-welcome");
const statusEl = document.querySelector("#student-landing-status");
const logOffButton = document.querySelector("#student-log-off");
const studentSummarySection = document.querySelector(
  "#student-summary-section"
);
const syllabusProgressSection = document.querySelector(
  "#syllabus-progress-section"
);
const studentNameEl = document.querySelector("#student-name");
const studentCountryEl = document.querySelector("#student-country");
const studentGradeEl = document.querySelector("#student-grade");
const studentStreamEl = document.querySelector("#student-stream");
const syllabusProgressList = document.querySelector(
  "#syllabus-progress-list"
);

let authenticatedStudentId = null;

function setStatus(message, isError = false, hidden = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = hidden;
}

function titleCase(value) {
  const text = String(value || "").trim();

  return text
    ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    : "Not specified";
}

function getPreAssessmentPresentation(state) {
  if (state === "completed") {
    return { label: "Completed", className: "completed" };
  }

  if (state === "not-configured") {
    return { label: "Not configured", className: "not-configured" };
  }

  return { label: "Not completed", className: "" };
}

function createMetric(label, value) {
  const metric = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("span");

  metric.className = "topic-metric";
  labelEl.className = "metric-label";
  labelEl.textContent = label;
  valueEl.className = "metric-value";
  valueEl.textContent = value;
  metric.append(labelEl, valueEl);

  return metric;
}

function createPracticeMetric(nextAssignedPractice) {
  const metric = document.createElement("div");
  const label = document.createElement("span");

  metric.className = "topic-metric";
  label.className = "metric-label";
  label.textContent = "Next practice";
  metric.append(label);

  if (!nextAssignedPractice) {
    const empty = document.createElement("span");

    empty.className = "metric-empty";
    empty.textContent = "None assigned";
    metric.append(empty);
    return metric;
  }

  const link = document.createElement("a");

  link.className = "topic-practice-link";
  link.href = `${COMMENCE_PRACTICE_URL}?practiceId=${encodeURIComponent(
    nextAssignedPractice.practiceId
  )}`;
  link.textContent = "Start practice";
  metric.append(link);

  return metric;
}

function createTopicRow(topic) {
  const row = document.createElement("div");
  const topicName = document.createElement("div");
  const assessmentMetric = document.createElement("div");
  const assessmentLabel = document.createElement("span");
  const assessmentBadge = document.createElement("span");
  const assessmentPresentation = getPreAssessmentPresentation(
    topic.preAssessmentState
  );
  const progressMetric = document.createElement("div");
  const progressLabel = document.createElement("span");
  const progressCopy = document.createElement("div");
  const progressValue = document.createElement("span");
  const progressDestination = document.createElement("span");
  const progressTrack = document.createElement("div");
  const progressFill = document.createElement("div");

  row.className = "topic-row";
  topicName.className = "topic-name";
  topicName.textContent = topic.topicName;

  assessmentMetric.className = "topic-metric";
  assessmentLabel.className = "metric-label";
  assessmentLabel.textContent = "Pre-assessment";
  assessmentBadge.className = [
    "assessment-badge",
    assessmentPresentation.className
  ].filter(Boolean).join(" ");
  assessmentBadge.textContent = assessmentPresentation.label;
  assessmentMetric.append(assessmentLabel, assessmentBadge);

  progressMetric.className = "topic-progress";
  progressLabel.className = "metric-label";
  progressLabel.textContent = "Progress to final level";
  progressCopy.className = "progress-copy";
  progressValue.textContent = `${topic.progressPercentage}%`;
  progressDestination.textContent =
    `${topic.totalLevelCount} levels / ${topic.finalLevelName}`;
  progressCopy.append(progressValue, progressDestination);
  progressTrack.className = "progress-track";
  progressTrack.setAttribute("role", "progressbar");
  progressTrack.setAttribute("aria-valuemin", "0");
  progressTrack.setAttribute("aria-valuemax", "100");
  progressTrack.setAttribute(
    "aria-valuenow",
    String(topic.progressPercentage)
  );
  progressTrack.setAttribute(
    "aria-label",
    `${topic.topicName} progress to ${topic.finalLevelName}`
  );
  progressFill.className = "progress-fill";
  progressFill.style.width = `${topic.progressPercentage}%`;
  progressTrack.append(progressFill);
  progressMetric.append(progressLabel, progressCopy, progressTrack);

  row.append(
    topicName,
    assessmentMetric,
    createMetric("Current level", topic.currentLevelName),
    createMetric("Next level", topic.nextLevelName),
    createPracticeMetric(topic.nextAssignedPractice),
    progressMetric
  );

  return row;
}

function createSyllabusPanel(syllabus) {
  const panel = document.createElement("article");
  const heading = document.createElement("header");
  const title = document.createElement("h3");
  const language = document.createElement("span");

  panel.className = "syllabus-panel";
  heading.className = "syllabus-heading";
  title.textContent = syllabus.subject;
  language.className = "language-pill";
  language.textContent = syllabus.language;
  heading.append(title, language);
  panel.append(heading);

  if (syllabus.error) {
    const warning = document.createElement("p");

    warning.className = "panel-warning";
    warning.textContent = syllabus.error;
    panel.append(warning);
  }

  if (syllabus.topics.length === 0) {
    const empty = document.createElement("p");

    empty.className = "empty-state";
    empty.textContent = "No topics are configured for this syllabus.";
    panel.append(empty);
    return panel;
  }

  const topicList = document.createElement("div");

  topicList.className = "topic-list";
  syllabus.topics.forEach((topic) => {
    topicList.append(createTopicRow(topic));
  });
  panel.append(topicList);

  return panel;
}

function renderDashboard(dashboard) {
  const { student, stream, syllabuses } = dashboard;

  welcomeEl.textContent = `Welcome back, ${student.name}.`;
  studentNameEl.textContent = student.name;
  studentCountryEl.textContent = student.country || "Not specified";
  studentGradeEl.textContent =
    `${titleCase(student.level)} / Year ${student.currentGrade}`;
  studentStreamEl.textContent = stream?.name || "Not assigned";
  studentSummarySection.hidden = false;
  syllabusProgressSection.hidden = false;
  syllabusProgressList.replaceChildren();

  if (syllabuses.length === 0) {
    const empty = document.createElement("p");

    empty.className = "empty-state syllabus-panel";
    empty.textContent = "No active syllabus subscriptions were found.";
    syllabusProgressList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  syllabuses.forEach((syllabus) => {
    fragment.append(createSyllabusPanel(syllabus));
  });
  syllabusProgressList.append(fragment);
}

async function handleAuthState(authUser) {
  if (!authUser) {
    window.location.replace(INDEX_URL);
    return;
  }

  if (authenticatedStudentId === authUser.uid) {
    return;
  }

  authenticatedStudentId = authUser.uid;
  setStatus("Loading your dashboard...");

  try {
    const dashboard = await getStudentDashboard(authUser.uid);

    if (!dashboard) {
      await signOutStudent();
      clearCurrentStudent();
      return;
    }

    renderDashboard(dashboard);
    setStatus("Dashboard loaded.", false, true);
  } catch (error) {
    console.error(error);
    welcomeEl.textContent = "Welcome.";
    setStatus(error.message || "Could not load your dashboard.", true);
  }
}

onStudentAuthStateChanged((authUser) => {
  void handleAuthState(authUser);
});

logOffButton.addEventListener("click", async () => {
  logOffButton.disabled = true;
  setStatus("Signing out...");

  try {
    await signOutStudent();
    clearCurrentStudent();
    window.location.replace(INDEX_URL);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not sign out.", true);
    logOffButton.disabled = false;
  }
});
