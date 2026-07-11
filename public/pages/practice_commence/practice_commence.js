import {
  completeStudentPractice,
  onStudentAuthStateChanged,
  readStudentAssignedPractice
} from "/handler/student_handler.js?v=20260711-practice-commence";

const STUDENT_SIGN_IN_PAGE_URL = "/pages/student_sign_in/student_sign_in.html";
const STUDENT_LANDING_PAGE_URL = "/pages/student_landing_page/student_landing_page.html";
const OPTION_KEYS = ["a", "b", "c", "d"];

const params = new URLSearchParams(window.location.search);
const practiceId = params.get("practiceId") || "";

const titleEl = document.querySelector("#practice-title");
const subtitleEl = document.querySelector("#practice-subtitle");
const metaEl = document.querySelector("#practice-meta");
const formEl = document.querySelector("#practice-form");
const questionListEl = document.querySelector("#question-list");
const submitButton = document.querySelector("#submit-practice");
const resultEl = document.querySelector("#practice-result");
const statusEl = document.querySelector("#practice-status");

let currentPractice = null;
let currentQuestions = [];
let selectedAnswers = {};
let startTimeMs = null;
let isSubmitting = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function setHidden(element, isHidden) {
  if (element) {
    element.hidden = isHidden;
  }
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
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

function formatPracticeMeta(practice = {}) {
  const questionCount = Array.isArray(practice.questions) ? practice.questions.length : 0;

  return [
    practice.difficulty,
    practice.language,
    `${questionCount} question${questionCount === 1 ? "" : "s"}`
  ]
    .filter(Boolean)
    .join(" | ");
}

function getQuestionInputName(questionId) {
  return `question-${questionId}`;
}

function getAnsweredQuestionCount() {
  return currentQuestions.filter((question) => selectedAnswers[question.id]).length;
}

function refreshSubmitButtonState() {
  submitButton.disabled = isSubmitting ||
    currentQuestions.length === 0 ||
    getAnsweredQuestionCount() !== currentQuestions.length;
}

function createOption(question, optionKey) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const text = document.createElement("span");

  label.className = "option-label";
  input.type = "radio";
  input.name = getQuestionInputName(question.id);
  input.value = optionKey;
  input.addEventListener("change", () => {
    selectedAnswers[question.id] = optionKey;
    refreshSubmitButtonState();
  });
  text.textContent = `${optionKey.toUpperCase()}. ${question.options?.[optionKey] || ""}`;

  label.append(input, text);

  return label;
}

function createQuestionCard(question, index) {
  const card = document.createElement("div");
  const title = document.createElement("p");

  card.className = "question-card";
  title.className = "question-title";
  title.textContent = `${index + 1}. ${question.questionText || ""}`;
  card.append(title);

  OPTION_KEYS.forEach((optionKey) => {
    card.append(createOption(question, optionKey));
  });

  return card;
}

function renderPractice(practice, questions) {
  currentPractice = practice;
  currentQuestions = questions;
  selectedAnswers = {};
  questionListEl.innerHTML = "";

  setText(titleEl, formatPracticeTitle(practice) || "Practice");
  setText(subtitleEl, "Answer every question, then submit your practice.");
  setText(metaEl, formatPracticeMeta(practice));

  questions.forEach((question, index) => {
    questionListEl.append(createQuestionCard(question, index));
  });

  setHidden(formEl, false);
  setHidden(resultEl, true);
  startTimeMs = Date.now();
  refreshSubmitButtonState();
}

function getStudentAnswers() {
  const answers = {};

  currentQuestions.forEach((question) => {
    if (!selectedAnswers[question.id]) {
      throw new Error("Answer every question before submitting.");
    }

    answers[question.id] = selectedAnswers[question.id];
  });

  return answers;
}

function getTimeTakenSeconds() {
  if (!startTimeMs) {
    return 0;
  }

  return Math.max(0, Math.round((Date.now() - startTimeMs) / 1000));
}

function renderCompletionResult(result) {
  const completedPractice = result.completedPractice || {};
  const score = `${completedPractice.questionsCorrect || 0}/${completedPractice.totalQuestions || 0}`;
  const summary = document.createElement("p");
  const link = document.createElement("a");

  resultEl.innerHTML = "";
  summary.textContent = `Practice completed. Score: ${score}. Time taken: ${completedPractice.timeTakenSeconds || 0} seconds.`;
  link.className = "button-link";
  link.href = STUDENT_LANDING_PAGE_URL;
  link.textContent = "Back To Dashboard";

  resultEl.append(summary, link);
  setHidden(resultEl, false);
  setHidden(formEl, true);
}

async function loadPractice() {
  if (!practiceId) {
    throw new Error("Missing practiceId in the page URL.");
  }

  setStatus("Loading practice...");

  const result = await readStudentAssignedPractice(null, practiceId);

  renderPractice(result.practice, result.questions);
  setStatus("Practice loaded.");
}

async function submitPractice(event) {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  isSubmitting = true;
  refreshSubmitButtonState();
  setStatus("Submitting practice...");

  try {
    const result = await completeStudentPractice(
      null,
      practiceId,
      getStudentAnswers(),
      { timeTakenSeconds: getTimeTakenSeconds() }
    );

    renderCompletionResult(result);
    setStatus("Practice completed.");
  } catch (error) {
    console.error(error);
    isSubmitting = false;
    refreshSubmitButtonState();
    setStatus(error.message || "Could not submit practice.", true);
  }
}

formEl.addEventListener("submit", submitPractice);

onStudentAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = STUDENT_SIGN_IN_PAGE_URL;
    return;
  }

  try {
    await loadPractice();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load practice.", true);
  }
});
