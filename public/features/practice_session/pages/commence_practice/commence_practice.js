import {
  answerPracticeQuestion,
  startPracticeSession,
  submitPracticeSession
} from "../../practice_session_module.js?v=20260810-completed-practice";
import {
  onStudentAuthStateChanged
} from "../../../student/student_module.js?v=20260716-no-eager-auth";

const SIGN_IN_URL = "/features/student/pages/sign_in/sign_in.html";
const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

const practiceId = new URLSearchParams(window.location.search)
  .get("practiceId")?.trim() || "";
const summaryEl = document.querySelector("#practice-summary");
const statusEl = document.querySelector("#commence-practice-status");
const questionsEl = document.querySelector("#commence-practice-questions");
const actionsEl = document.querySelector("#commence-practice-actions");
const submitButton = document.querySelector("#submit-practice");
const resultEl = document.querySelector("#practice-result");
const resultScoreEl = document.querySelector("#result-score");
const resultCorrectEl = document.querySelector("#result-correct");
const resultTimeEl = document.querySelector("#result-time");

let loadedStudentId = null;
let activeSession = null;
let submissionInProgress = false;
let diagramObjectUrls = [];

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

function formatTimeTaken(secondsValue) {
  const seconds = Number(secondsValue);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  return `${minutes} min ${remainingSeconds} sec`;
}

function clearDiagramObjectUrls() {
  diagramObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  diagramObjectUrls = [];
}

function updateSubmitButton() {
  submitButton.disabled = submissionInProgress
    || !activeSession
    || !activeSession.isComplete();
}

function selectAnswer(questionId, selectedOption, input) {
  try {
    activeSession = answerPracticeQuestion({
      questionId,
      selectedOption
    });
    statusEl.hidden = true;
    updateSubmitButton();
  } catch (error) {
    console.error(error);
    input.checked = false;
    setStatus(error.message || "Could not record the answer.", true);
  }
}

function createOptions(question) {
  const options = document.createElement("ul");

  options.className = "question-options";

  QUESTION_OPTION_KEYS.forEach((optionKey) => {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const optionText = document.createElement("span");
    const optionLabel = document.createElement("strong");

    input.type = "radio";
    input.name = `question-${question.id}`;
    input.value = optionKey;
    optionLabel.textContent = `${optionKey.toUpperCase()}. `;
    optionText.append(optionLabel, question.options[optionKey]);
    label.append(input, optionText);
    item.append(label);
    options.append(item);

    input.addEventListener("change", () => {
      if (input.checked) {
        selectAnswer(question.id, optionKey, input);
      }
    });
  });

  return options;
}

function createDiagram(question, questionNumber) {
  if (!question.hasDiagram || !question.svg) {
    return null;
  }

  const figure = document.createElement("figure");
  const image = document.createElement("img");
  const objectUrl = URL.createObjectURL(
    new Blob([question.svg], { type: "image/svg+xml" })
  );

  diagramObjectUrls.push(objectUrl);
  figure.className = "question-diagram";
  image.src = objectUrl;
  image.alt = `Diagram for question ${questionNumber}`;
  figure.append(image);

  return figure;
}

function renderSession(session) {
  activeSession = session;
  submissionInProgress = false;
  clearDiagramObjectUrls();
  questionsEl.replaceChildren();

  session.questions.forEach((question, index) => {
    const questionNumber = index + 1;
    const item = document.createElement("li");
    const heading = document.createElement("h2");
    const questionText = document.createElement("p");
    const diagram = createDiagram(question, questionNumber);

    item.className = "question-item";
    heading.textContent = `Question ${questionNumber}`;
    questionText.className = "question-text";
    questionText.textContent = question.questionText;
    item.append(heading);

    if (diagram) {
      item.append(diagram);
    }

    item.append(questionText, createOptions(question));
    questionsEl.append(item);
  });

  summaryEl.textContent = [
    formatPracticeType(session.practiceType),
    `${session.questions.length} questions`,
    `Practice ID: ${session.practiceId}`
  ].join(" / ");
  submitButton.textContent = "Submit Practice";
  statusEl.hidden = true;
  questionsEl.hidden = false;
  actionsEl.hidden = false;
  resultEl.hidden = true;
  updateSubmitButton();
}

function renderResult(result) {
  resultScoreEl.textContent = `${result.score}%`;
  resultCorrectEl.textContent =
    `${result.questionsCorrect} of ${result.totalQuestions}`;
  resultTimeEl.textContent = formatTimeTaken(result.timeTakenSeconds);
  resultEl.hidden = false;
}

function disableAnswerControls() {
  questionsEl.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.disabled = true;
  });
}

async function submitPractice() {
  if (!activeSession || submissionInProgress) {
    return;
  }

  submissionInProgress = true;
  submitButton.textContent = "Submitting...";
  updateSubmitButton();
  setStatus("Submitting practice...");

  try {
    const result = await submitPracticeSession();

    disableAnswerControls();
    submitButton.textContent = "Submitted";
    submitButton.disabled = true;
    setStatus("Practice submitted successfully.");
    renderResult(result);
    resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    submissionInProgress = false;
    submitButton.textContent = "Submit Practice";
    setStatus(error.message || "Could not submit the practice.", true);
    updateSubmitButton();
  }
}

async function loadPractice(authUser) {
  if (loadedStudentId === authUser.uid) {
    return;
  }

  loadedStudentId = authUser.uid;

  if (!practiceId) {
    summaryEl.textContent = "Practice unavailable";
    setStatus("A practice ID is required.", true);
    return;
  }

  setStatus("Loading questions...");

  try {
    renderSession(await startPracticeSession({ practiceId }));
  } catch (error) {
    console.error(error);
    summaryEl.textContent = "Practice unavailable";
    setStatus(error.message || "Could not load the practice.", true);
  }
}

onStudentAuthStateChanged((authUser) => {
  if (!authUser) {
    window.location.replace(SIGN_IN_URL);
    return;
  }

  void loadPractice(authUser);
});

submitButton.addEventListener("click", submitPractice);
window.addEventListener("beforeunload", clearDiagramObjectUrls);
