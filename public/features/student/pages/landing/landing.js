import {watchStudentEssayPracticeUpdates} from "../../../student_essay_practice/student_essay_practice_module.js?v=20261018-essay-reuse-v1";
import {EssayPracticeRefreshController} from "./essay_practice_refresh_controller.js?v=20261018-additional-essay-v1";
import {
  clearCurrentStudent,
  onStudentAuthStateChanged,
  signOutStudent
} from "../../student_module.js?v=20260823-student-country-v1";
import {
  getStudentDashboard
} from "../../../student_dashboard/student_dashboard_module.js?v=20261019-essay-level-display-v1";
import {
  recordStudentLogin
} from "../../../student_login/student_login_module.js?v=20261010-login-rewards-v1";
import {
  DEFAULT_REWARD_CONFIG,
  getRewardConfig,
  listRecentStudentRewardActivities,
  watchStudentRewardTotal
} from "../../../reward/reward_module.js?v=20261018-essay-progression-v1";
import {
  completionProcessingStages,
  completionProcessingStatuses,
  watchPracticeCompletionProcessing
} from "../../../student_practice/student_practice_module.js?v=20261018-topic-reset-v1";
import {
  acceptAdditionalDailyMission,
  acceptCoreDailyMission,
  getNextCoreDailyMission,
  isTopicPaused,
  listAdditionalMissions,
  getAdditionalMissionAvailability,
  pauseCoreDailyMission,
  unpauseTopic
} from "../../../daily_mission/daily_mission_module.js?v=20261018-essay-reuse-v1";
import {
  isTopicPausable
} from "../../../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";
import {
  getPracticeById
} from "../../../practice/practice_module.js?v=20260824-completed-practices";
import {
  DailyMissionSection
} from "../../../daily_mission/components/daily_mission_section/daily_mission_section.js?v=20261018-essay-session-v1";
import {
  AdditionalMissionSection
} from "../../../daily_mission/components/additional_mission_section/additional_mission_section.js?v=20261018-additional-essay-v1";
import {
  CompletionProcessingRefreshController
} from "./completion_processing_refresh_controller.js?v=20261009-reliability-landing-v1";
import {
  StudentCoinBalanceController
} from "./student_coin_balance_controller.js?v=20261013-recent-reward-activities-v1";

const INDEX_URL = "/index.html";
const COMPLETED_PRACTICE_QUERY_PARAMETER = "completedPracticeId";
const PRACTICE_RESULT_URL =
  "/features/practice_result/pages/result/practice_result.html";
const completedDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric"
});
const readinessScoreFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2
});

const welcomeEl = document.querySelector("#student-welcome");
const statusEl = document.querySelector("#student-landing-status");
const logOffButton = document.querySelector("#student-log-off");
const studentSummarySection = document.querySelector(
  "#student-summary-section"
);
const dailyMissionSectionEl = document.querySelector(
  "#student-daily-mission-section"
);
const dailyMissionRoot = document.querySelector(
  "#student-daily-mission-root"
);
const additionalMissionSectionEl = document.querySelector(
  "#student-additional-mission-section"
);
const additionalMissionRoot = document.querySelector(
  "#student-additional-mission-root"
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
const studentCoinBalanceController = new StudentCoinBalanceController({
  watchStudentRewardTotal,
  getRewardConfig,
  listRecentStudentRewardActivities,
  defaultRecentActivitiesLimit: DEFAULT_REWARD_CONFIG.recentActivitiesLimit,
  section: document.querySelector("#student-coins-section"),
  balance: document.querySelector("#student-coins-total"),
  status: document.querySelector("#student-coins-status"),
  activityList: document.querySelector("#student-coin-activity-list"),
  activityStatus: document.querySelector("#student-coin-activity-status")
});

let authenticatedStudentId = null;
let dailyMissionController = null;
let additionalMissionController = null;
const topicPauseControls = new Map();
const topicProcessingIndicators = new Map();
let activeProcessingTopicKey = "";

function setStatus(message, isError = false, hidden = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = hidden;
}

function setProcessingStatus(
  message,
  {isError = false, hidden = false} = {}
) {
  setStatus(message, isError, hidden);
}

function topicKey(syllabusId, topicId) {
  return JSON.stringify([syllabusId, topicId]);
}

function setTopicProcessingActive(
  active,
  context = null
) {
  if (active !== true) {
    const activeIndicator = topicProcessingIndicators.get(
      activeProcessingTopicKey
    );

    if (activeIndicator) {
      activeIndicator.hidden = true;
    }

    activeProcessingTopicKey = "";
    return;
  }

  const {syllabusId = "", topicId = ""} = context ?? {};
  const nextTopicKey = topicKey(syllabusId, topicId);
  const previousIndicator = topicProcessingIndicators.get(
    activeProcessingTopicKey
  );

  if (previousIndicator) {
    previousIndicator.hidden = true;
  }

  activeProcessingTopicKey = nextTopicKey;
  const nextIndicator = topicProcessingIndicators.get(nextTopicKey);

  if (nextIndicator) {
    nextIndicator.hidden = false;
  }
}

function completedPracticeIdFromUrl() {
  return new URLSearchParams(window.location.search)
    .get(COMPLETED_PRACTICE_QUERY_PARAMETER)?.trim() || "";
}

function clearCompletedPracticeContext() {
  const url = new URL(window.location.href);

  url.searchParams.delete(COMPLETED_PRACTICE_QUERY_PARAMETER);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
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

function getPreAssessmentPresentation(state) {
  if (state === "completed") {
    return { label: "Completed", className: "completed" };
  }

  if (state === "not-configured") {
    return { label: "Not configured", className: "not-configured" };
  }

  return { label: "Not completed", className: "" };
}

function formatReadinessScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? readinessScoreFormatter.format(value)
    : "No score yet";
}

function formatReliabilityScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? `${readinessScoreFormatter.format(value)}%`
    : "No score yet";
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

function createTopicProcessingIndicator(topicName) {
  const indicator = document.createElement("div");
  const message = document.createElement("span");
  const track = document.createElement("div");
  const bar = document.createElement("span");

  indicator.className = "topic-processing";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.hidden = true;
  message.textContent = "Updating progress and preparing the next practice...";
  track.className = "topic-processing-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", `Updating ${topicName} progress`);
  bar.className = "topic-processing-bar";
  track.append(bar);
  indicator.append(message, track);

  return indicator;
}

function createHistoryField(label, value) {
  const field = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("span");

  field.className = "history-field";
  labelEl.className = "history-label";
  labelEl.textContent = label;
  valueEl.className = "history-value";
  valueEl.textContent = value;
  field.append(labelEl, valueEl);

  return field;
}

function getPracticeHistoryType(practice) {
  if (practice.practiceType === "essay") return "Essay assessment";
  if (practice.practiceType === "pre assessment") {
    return "First assessment";
  }

  return practice.difficulty
    ? titleCase(practice.difficulty)
    : "Difficulty unavailable";
}

function createPracticeResultUrl(studentId, practiceId) {
  return `${PRACTICE_RESULT_URL}?studentId=${encodeURIComponent(
    studentId
  )}&practiceId=${encodeURIComponent(practiceId)}`;
}

function createCompletedPracticeHistory(
  completedPractices = [],
  studentId
) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const count = completedPractices.length;

  details.className = "topic-history";
  summary.className = "history-toggle";
  summary.textContent = `Past completed practices (${count})`;
  details.append(summary);

  if (count === 0) {
    const empty = document.createElement("p");

    empty.className = "history-empty";
    empty.textContent = "No completed practices yet.";
    details.append(empty);
    return details;
  }

  const list = document.createElement("div");

  list.className = "practice-history-list";
  completedPractices.forEach((practice) => {
    const item = document.createElement("div");
    const action = document.createElement("a");

    item.className = "practice-history-item";
    action.className = "history-result-link";
    action.href = practice.practiceType === "essay"
      ? "/features/essay_practice_session/pages/essay_practice/essay_practice.html?essayPracticeId=" + encodeURIComponent(practice.practiceId)
      : createPracticeResultUrl(studentId, practice.practiceId);
    action.textContent = "View result";
    item.append(
      createHistoryField("Date", formatCompletedDate(
        practice.dateCompleted
      )),
      createHistoryField("Type / difficulty", getPracticeHistoryType(practice)),
      createHistoryField("Score", practice.score === null ? "Scoring pending" : `${practice.score}%`),
      action
    );
    list.append(item);
  });
  details.append(list);

  return details;
}

async function handleTopicUnpause({
  studentId,
  syllabusId,
  topicId,
  row,
  pauseBadge,
  unpauseButton
}) {
  unpauseButton.disabled = true;
  unpauseButton.textContent = "Unpausing...";

  try {
    await unpauseTopic({studentId, syllabusId, topicId});
    row.classList.remove("is-paused");
    pauseBadge.hidden = true;
    unpauseButton.hidden = true;
    unpauseButton.textContent = "Unpause";
    await Promise.all([
      dailyMissionController?.refreshAvailability(),
      additionalMissionController?.refreshAvailability()
    ]);
  } catch (error) {
    console.error(`Could not unpause topic ${topicId}.`, error);
    unpauseButton.disabled = false;
    unpauseButton.textContent = "Retry unpause";
  }
}

function topicPauseControlKey(studentId, syllabusId, topicId) {
  return JSON.stringify([studentId, syllabusId, topicId]);
}

async function refreshTopicPauseStatus({
  studentId,
  syllabusId,
  topicId
}) {
  const controls = topicPauseControls.get(
    topicPauseControlKey(studentId, syllabusId, topicId)
  );

  if (!controls) {
    return;
  }

  await updateTopicPauseStatus({
    studentId,
    syllabusId,
    topicId,
    ...controls
  });
}

async function updateTopicPauseStatus({
  studentId,
  syllabusId,
  topicId,
  row,
  pauseBadge,
  unpauseButton
}) {
  try {
    const paused = await isTopicPaused({
      studentId,
      syllabusId,
      topicId
    });

    row.classList.toggle("is-paused", paused);
    pauseBadge.hidden = !paused;
    unpauseButton.hidden = !paused;
    unpauseButton.disabled = false;
    unpauseButton.textContent = "Unpause";
  } catch (error) {
    console.error(
      `Could not load paused status for topic ${topicId}.`,
      error
    );
  }
}

function createTopicRow(topic, studentId, syllabusId) {
  const row = document.createElement("div");
  const topicName = document.createElement("div");
  const topicNameText = document.createElement("span");
  const pauseBadge = document.createElement("span");
  const unpauseButton = document.createElement("button");
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
  const processingIndicator = createTopicProcessingIndicator(
    topic.topicName
  );

  row.className = "topic-row";
  topicName.className = "topic-name";
  topicNameText.textContent = topic.topicName;
  pauseBadge.className = "topic-pause-badge";
  pauseBadge.textContent = "Paused";
  pauseBadge.hidden = true;
  unpauseButton.type = "button";
  unpauseButton.className = "topic-unpause-button";
  unpauseButton.textContent = "Unpause";
  unpauseButton.hidden = true;
  unpauseButton.setAttribute("aria-label", `Unpause ${topic.topicName}`);
  unpauseButton.addEventListener("click", () => {
    void handleTopicUnpause({
      studentId,
      syllabusId,
      topicId: topic.topicId,
      row,
      pauseBadge,
      unpauseButton
    });
  });
  topicName.append(topicNameText, pauseBadge, unpauseButton);

  assessmentMetric.className = "topic-metric";
  assessmentLabel.className = "metric-label";
  assessmentLabel.textContent = "First assessment";
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
  progressValue.textContent = topic.progressPercentage === null ? "Not applicable" : `${topic.progressPercentage}%`;
  progressDestination.textContent =
    topic.progressPercentage === null ? "" : `${topic.totalLevelCount} levels / ${topic.finalLevelName}`;
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
  progressFill.style.width = `${topic.progressPercentage ?? 0}%`;
  progressTrack.hidden = topic.progressPercentage === null;
  progressTrack.append(progressFill);
  progressMetric.append(progressLabel, progressCopy, progressTrack);

  row.append(
    topicName,
    assessmentMetric,
    createMetric("Current level", topic.currentLevelName),
    createMetric("Next level", topic.nextLevelName),
    createMetric(
      "Readiness score",
      topic.readinessUnavailable ? "Unavailable" : formatReadinessScore(topic.readinessScore)
    ),
    createMetric(
      "Reliability score",
      topic.reliabilityUnavailable ? "Unavailable" : formatReliabilityScore(topic.reliabilityScore)
    ),
    progressMetric,
    createCompletedPracticeHistory(topic.completedPractices, studentId),
    processingIndicator
  );

  const processingTopicKey = topicKey(syllabusId, topic.topicId);

  processingIndicator.hidden = processingTopicKey !== activeProcessingTopicKey;
  topicProcessingIndicators.set(processingTopicKey, processingIndicator);

  topicPauseControls.set(
    topicPauseControlKey(studentId, syllabusId, topic.topicId),
    {
      row,
      pauseBadge,
      unpauseButton
    }
  );
  void updateTopicPauseStatus({
    studentId,
    syllabusId,
    topicId: topic.topicId,
    row,
    pauseBadge,
    unpauseButton
  });

  return row;
}

function createSyllabusPanel(syllabus, studentId) {
  const panel = document.createElement("article");
  const heading = document.createElement("header");
  const title = document.createElement("h3");
  const language = document.createElement("span");
  const summary = document.createElement("div");
  const readinessMetric = createMetric(
    "Subject readiness score",
    syllabus.readinessUnavailable ? "Unavailable" : formatReadinessScore(syllabus.readinessScore)
  );
  const reliabilityMetric = createMetric(
    "Subject reliability score",
    syllabus.reliabilityUnavailable ? "Unavailable" : formatReliabilityScore(syllabus.reliabilityScore)
  );

  panel.className = "syllabus-panel";
  heading.className = "syllabus-heading";
  title.textContent = syllabus.subject;
  language.className = "language-pill";
  language.textContent = syllabus.language;
  summary.className = "syllabus-summary";
  readinessMetric.className = "subject-readiness";
  reliabilityMetric.className = "subject-reliability";
  summary.append(readinessMetric, reliabilityMetric, language);
  heading.append(title, summary);
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
    topicList.append(createTopicRow(
      topic,
      studentId,
      syllabus.syllabusId
    ));
  });
  panel.append(topicList);

  return panel;
}

function renderDashboard(dashboard) {
  topicPauseControls.clear();
  topicProcessingIndicators.clear();

  const { student, stream, syllabuses } = dashboard;

  welcomeEl.textContent = `Welcome back, ${student.name}.`;
  studentNameEl.textContent = student.name;
  studentCountryEl.textContent = student.country || "Not specified";
  studentGradeEl.textContent =
    `${titleCase(student.level)} / Year ${student.currentGrade}`;
  studentStreamEl.textContent = stream?.name || "Not assigned";
  studentSummarySection.hidden = false;
  dailyMissionController = new DailyMissionSection({
    studentId: student.id,
    syllabuses,
    getNextCoreDailyMission,
    acceptCoreDailyMission,
    pauseCoreDailyMission,
    isTopicPausable,
    onTopicPaused: refreshTopicPauseStatus
  });
  dailyMissionController.mount(dailyMissionRoot);
  dailyMissionSectionEl.hidden = false;
  additionalMissionController = new AdditionalMissionSection({
    studentId: student.id,
    syllabuses,
    getNextCoreDailyMission,
    listAdditionalMissions,
    getAdditionalMissionAvailability,
    acceptAdditionalDailyMission,
    pauseCoreDailyMission,
    isTopicPausable,
    getPracticeById,
    onTopicPaused: refreshTopicPauseStatus
  });
  additionalMissionController.mount(additionalMissionRoot);
  additionalMissionSectionEl.hidden = false;
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
    fragment.append(createSyllabusPanel(syllabus, student.id));
  });
  syllabusProgressList.append(fragment);
}

async function loadAndRenderDashboard(studentId) {
  const dashboard = await getStudentDashboard(studentId);
  if (authenticatedStudentId !== studentId) return false;

  if (!dashboard) {
    await signOutStudent();
    clearCurrentStudent();
    return false;
  }

  renderDashboard(dashboard);
  return true;
}

const completionProcessingRefreshController =
  new CompletionProcessingRefreshController({
    watchPracticeCompletionProcessing,
    refreshDashboard: async ({studentId}) => {
      const refreshed = await loadAndRenderDashboard(studentId);

      if (!refreshed) {
        throw new Error("The student dashboard is no longer available.");
      }
    },
    clearCompletionContext: clearCompletedPracticeContext,
    setStatus: setProcessingStatus,
    setProcessingActive: setTopicProcessingActive,
    statuses: completionProcessingStatuses,
    stages: completionProcessingStages
  });

const essayPracticeRefreshController = new EssayPracticeRefreshController({
  watchUpdates: watchStudentEssayPracticeUpdates,
  refreshDashboard: loadAndRenderDashboard,
  onError: error => console.error("Could not refresh essay mission availability.", error),
});

async function handleAuthState(authUser) {
  if (!authUser) {
    authenticatedStudentId = null;
    studentCoinBalanceController.stop();
    essayPracticeRefreshController.stop();
    completionProcessingRefreshController.stop();
    window.location.replace(INDEX_URL);
    return;
  }

  if (authenticatedStudentId === authUser.uid) {
    return;
  }

  studentCoinBalanceController.stop();

  essayPracticeRefreshController.stop();
  completionProcessingRefreshController.stop();
  authenticatedStudentId = authUser.uid;
  setStatus("Loading your dashboard...");

  try {
    if (!await loadAndRenderDashboard(authUser.uid)) {
      return;
    }

    if (authenticatedStudentId !== authUser.uid) {
      return;
    }
    studentCoinBalanceController.start({studentId: authUser.uid});
    essayPracticeRefreshController.start(authUser.uid);

    void recordStudentLogin({studentId: authUser.uid}).catch((error) => {
      console.error("Could not record the student login.", error);
    });

    setStatus("Dashboard loaded.", false, true);
    const completedPracticeId = completedPracticeIdFromUrl();

    if (completedPracticeId) {
      const completedPractice = await getPracticeById(completedPracticeId);
      const completedTopic = completedPractice?.questions?.[0];

      if (!completedTopic?.syllabusId || !completedTopic?.topicId) {
        throw new Error(
          "Could not determine which topic is being updated."
        );
      }

      completionProcessingRefreshController.start({
        studentId: authUser.uid,
        practiceId: completedPracticeId,
        syllabusId: completedTopic.syllabusId,
        topicId: completedTopic.topicId
      });
    }
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
    completionProcessingRefreshController.stop();
    await signOutStudent();
    studentCoinBalanceController.stop();
    essayPracticeRefreshController.stop();
    clearCurrentStudent();
    window.location.replace(INDEX_URL);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not sign out.", true);
    logOffButton.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  studentCoinBalanceController.stop();
  essayPracticeRefreshController.stop();
  completionProcessingRefreshController.stop();
});
