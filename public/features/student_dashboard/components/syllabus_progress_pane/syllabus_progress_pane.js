const DEFAULT_PRACTICE_RESULT_URL =
  "/features/practice_result/pages/result/practice_result.html";
const completedDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric"
});

function requireDocument(documentRef) {
  if (typeof documentRef?.createElement !== "function") {
    throw new Error("A browser document is required.");
  }

  return documentRef;
}

function requireStudentId(value) {
  const studentId = String(value || "").trim();

  if (!studentId) {
    throw new Error("studentId is required.");
  }

  return studentId;
}

function requireSyllabuses(value) {
  if (!Array.isArray(value)) {
    throw new Error("syllabuses must be an array.");
  }

  return value;
}

function titleCase(value) {
  const text = String(value || "").trim();

  return text
    ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    : "Not specified";
}

function formatCompletedDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : completedDateFormatter.format(date);
}

function formatScore(value) {
  const score = Number(value);

  return Number.isFinite(score) ? `${score}%` : "Score unavailable";
}

function getPreAssessmentPresentation(state) {
  if (state === "completed") {
    return {label: "Completed", modifier: "is-completed"};
  }

  if (state === "not-configured") {
    return {label: "Not configured", modifier: "is-not-configured"};
  }

  return {label: "Not completed", modifier: ""};
}

function getPracticeHistoryType(practice) {
  if (practice.practiceType === "pre assessment") {
    return "Pre-assessment";
  }

  return practice.difficulty
    ? titleCase(practice.difficulty)
    : "Difficulty unavailable";
}

function createMetric(documentRef, label, value) {
  const metric = documentRef.createElement("div");
  const labelEl = documentRef.createElement("span");
  const valueEl = documentRef.createElement("span");

  metric.className = "student-dashboard-progress-metric";
  labelEl.className = "student-dashboard-progress-label";
  labelEl.textContent = label;
  valueEl.className = "student-dashboard-progress-value";
  valueEl.textContent = value;
  metric.append(labelEl, valueEl);

  return metric;
}

function createHistoryField(documentRef, label, value) {
  const field = documentRef.createElement("div");
  const labelEl = documentRef.createElement("span");
  const valueEl = documentRef.createElement("span");

  field.className = "student-dashboard-history-field";
  labelEl.className = "student-dashboard-history-label";
  labelEl.textContent = label;
  valueEl.className = "student-dashboard-history-value";
  valueEl.textContent = value;
  field.append(labelEl, valueEl);

  return field;
}

function createPracticeResultUrl(
  studentId,
  practiceId,
  practiceResultUrl
) {
  const separator = practiceResultUrl.includes("?") ? "&" : "?";

  return `${practiceResultUrl}${separator}studentId=${encodeURIComponent(
    studentId
  )}&practiceId=${encodeURIComponent(practiceId)}`;
}

function createCompletedPracticeHistory({
  documentRef,
  completedPractices,
  studentId,
  practiceResultUrl
}) {
  const details = documentRef.createElement("details");
  const summary = documentRef.createElement("summary");
  const practices = Array.isArray(completedPractices)
    ? completedPractices
    : [];

  details.className = "student-dashboard-topic-history";
  summary.className = "student-dashboard-history-toggle";
  summary.textContent = `Past completed practices (${practices.length})`;
  details.append(summary);

  if (practices.length === 0) {
    const empty = documentRef.createElement("p");

    empty.className = "student-dashboard-history-empty";
    empty.textContent = "No completed practices yet.";
    details.append(empty);
    return details;
  }

  const list = documentRef.createElement("div");

  list.className = "student-dashboard-practice-history-list";
  practices.forEach((practice) => {
    const item = documentRef.createElement("div");
    const action = documentRef.createElement("a");

    item.className = "student-dashboard-practice-history-item";
    action.className = "student-dashboard-history-result-link";
    action.href = createPracticeResultUrl(
      studentId,
      practice.practiceId,
      practiceResultUrl
    );
    action.textContent = "View result";
    item.append(
      createHistoryField(
        documentRef,
        "Date",
        formatCompletedDate(practice.dateCompleted)
      ),
      createHistoryField(
        documentRef,
        "Type / difficulty",
        getPracticeHistoryType(practice)
      ),
      createHistoryField(documentRef, "Score", formatScore(practice.score)),
      action
    );
    list.append(item);
  });
  details.append(list);

  return details;
}

function createProgressMetric(documentRef, topic) {
  const progress = Math.min(
    100,
    Math.max(0, Number(topic.progressPercentage) || 0)
  );
  const metric = documentRef.createElement("div");
  const label = documentRef.createElement("span");
  const copy = documentRef.createElement("div");
  const value = documentRef.createElement("span");
  const destination = documentRef.createElement("span");
  const track = documentRef.createElement("div");
  const fill = documentRef.createElement("div");

  metric.className = "student-dashboard-topic-progress";
  label.className = "student-dashboard-progress-label";
  label.textContent = "Progress to final level";
  copy.className = "student-dashboard-progress-copy";
  value.textContent = `${progress}%`;
  destination.textContent =
    `${topic.totalLevelCount} levels / ${topic.finalLevelName}`;
  copy.append(value, destination);
  track.className = "student-dashboard-progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(progress));
  track.setAttribute(
    "aria-label",
    `${topic.topicName} progress to ${topic.finalLevelName}`
  );
  fill.className = "student-dashboard-progress-fill";
  fill.style.width = `${progress}%`;
  track.append(fill);
  metric.append(label, copy, track);

  return metric;
}

function createTopicRow({
  documentRef,
  topic,
  studentId,
  practiceResultUrl
}) {
  const row = documentRef.createElement("div");
  const topicName = documentRef.createElement("div");
  const assessmentMetric = documentRef.createElement("div");
  const assessmentLabel = documentRef.createElement("span");
  const assessmentBadge = documentRef.createElement("span");
  const assessment = getPreAssessmentPresentation(topic.preAssessmentState);

  row.className = "student-dashboard-topic-row";
  topicName.className = "student-dashboard-topic-name";
  topicName.textContent = topic.topicName;
  assessmentMetric.className = "student-dashboard-progress-metric";
  assessmentLabel.className = "student-dashboard-progress-label";
  assessmentLabel.textContent = "Pre-assessment";
  assessmentBadge.className = [
    "student-dashboard-assessment-badge",
    assessment.modifier
  ].filter(Boolean).join(" ");
  assessmentBadge.textContent = assessment.label;
  assessmentMetric.append(assessmentLabel, assessmentBadge);

  row.append(
    topicName,
    assessmentMetric,
    createMetric(
      documentRef,
      "Current level",
      topic.currentLevelName || "Not determined"
    ),
    createMetric(
      documentRef,
      "Next level",
      topic.nextLevelName || "Not determined"
    ),
    createProgressMetric(documentRef, topic),
    createCompletedPracticeHistory({
      documentRef,
      completedPractices: topic.completedPractices,
      studentId,
      practiceResultUrl
    })
  );

  return row;
}

function createSyllabusPanel({
  documentRef,
  syllabus,
  studentId,
  practiceResultUrl
}) {
  const panel = documentRef.createElement("article");
  const heading = documentRef.createElement("header");
  const title = documentRef.createElement("h3");
  const language = documentRef.createElement("span");

  panel.className = "student-dashboard-syllabus-panel";
  heading.className = "student-dashboard-syllabus-heading";
  title.textContent = syllabus.subject || "Subject unavailable";
  language.className = "student-dashboard-language-pill";
  language.textContent = syllabus.language || "Language not specified";
  heading.append(title, language);
  panel.append(heading);

  if (syllabus.error) {
    const warning = documentRef.createElement("p");

    warning.className = "student-dashboard-panel-warning";
    warning.textContent = syllabus.error;
    panel.append(warning);
  }

  const topics = Array.isArray(syllabus.topics) ? syllabus.topics : [];

  if (topics.length === 0) {
    const empty = documentRef.createElement("p");

    empty.className = "student-dashboard-progress-empty";
    empty.textContent = "No topics are configured for this syllabus.";
    panel.append(empty);
    return panel;
  }

  const topicList = documentRef.createElement("div");

  topicList.className = "student-dashboard-topic-list";
  topics.forEach((topic) => {
    topicList.append(createTopicRow({
      documentRef,
      topic,
      studentId,
      practiceResultUrl
    }));
  });
  panel.append(topicList);

  return panel;
}

function createSyllabusProgressPane({
  studentId: inputStudentId,
  syllabuses: inputSyllabuses,
  title = "Syllabus Progress",
  description = "Topic levels and progress towards each framework's final level.",
  practiceResultUrl = DEFAULT_PRACTICE_RESULT_URL,
  documentRef = globalThis.document
} = {}) {
  const browserDocument = requireDocument(documentRef);
  const studentId = requireStudentId(inputStudentId);
  const syllabuses = requireSyllabuses(inputSyllabuses);
  const section = browserDocument.createElement("section");
  const header = browserDocument.createElement("header");
  const heading = browserDocument.createElement("h2");
  const supportingCopy = browserDocument.createElement("p");
  const list = browserDocument.createElement("div");

  section.className = "student-dashboard-progress-pane";
  section.setAttribute("aria-label", String(title || "Syllabus Progress"));
  header.className = "student-dashboard-progress-header";
  heading.textContent = String(title || "Syllabus Progress");
  supportingCopy.textContent = String(description || "");
  header.append(heading, supportingCopy);
  list.className = "student-dashboard-syllabus-list";
  section.append(header, list);

  if (syllabuses.length === 0) {
    const empty = browserDocument.createElement("p");

    empty.className =
      "student-dashboard-progress-empty student-dashboard-syllabus-panel";
    empty.textContent = "No active syllabus subscriptions were found.";
    list.append(empty);
    return section;
  }

  syllabuses.forEach((syllabus) => {
    list.append(createSyllabusPanel({
      documentRef: browserDocument,
      syllabus,
      studentId,
      practiceResultUrl
    }));
  });

  return section;
}

function renderSyllabusProgressPane({container, ...input} = {}) {
  if (typeof container?.replaceChildren !== "function") {
    throw new Error("A component container is required.");
  }

  const pane = createSyllabusProgressPane(input);

  container.replaceChildren(pane);
  return pane;
}

export {
  createSyllabusProgressPane,
  renderSyllabusProgressPane
};
