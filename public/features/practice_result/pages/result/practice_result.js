import {
  getPracticeResultReview
} from "../../practice_result_module.js?v=20260824-practice-review";
import {
  onStudentAuthStateChanged
} from "../../../student/student_module.js?v=20260716-no-eager-auth";
import {
  setMathText
} from "../../../../utils/math/render_math.js?v=20260822-katex-math";

const SIGN_IN_URL = "/features/student/pages/sign_in/sign_in.html";
const OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);
const query = new URLSearchParams(window.location.search);
const studentId = query.get("studentId")?.trim() || "";
const practiceId = query.get("practiceId")?.trim() || "";
const completedDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const subtitleEl = document.querySelector("#practice-result-subtitle");
const statusEl = document.querySelector("#practice-result-status");
const summaryEl = document.querySelector("#practice-result-summary");
const scoreEl = document.querySelector("#result-score");
const correctEl = document.querySelector("#result-correct");
const dateEl = document.querySelector("#result-date");
const timeEl = document.querySelector("#result-time");
const questionsEl = document.querySelector("#practice-result-questions");

let loaded = false;
let diagramObjectUrls = [];

function setStatus(message, isError = false, hidden = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = hidden;
}

function formatPracticeType(type) {
  return String(type || "Practice")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTimeTaken(secondsValue) {
  const totalSeconds = Number(secondsValue);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes} min ${seconds} sec`
    : `${seconds} sec`;
}

function clearDiagramObjectUrls() {
  diagramObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  diagramObjectUrls = [];
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

function createOptionTag(text, className = "") {
  const tag = document.createElement("span");

  tag.className = ["option-tag", className].filter(Boolean).join(" ");
  tag.textContent = text;

  return tag;
}

function createQuestionOptions(question) {
  const options = document.createElement("ul");

  options.className = "question-options";
  OPTION_KEYS.forEach((optionKey) => {
    const item = document.createElement("li");
    const copy = document.createElement("div");
    const key = document.createElement("strong");
    const value = document.createElement("span");
    const tags = document.createElement("div");
    const isSelected = optionKey === question.selectedOption;
    const isCorrect = optionKey === question.correctAnswer;

    item.className = "question-option";

    if (isCorrect) {
      item.classList.add("correct-answer");
    } else if (isSelected) {
      item.classList.add("incorrect-answer");
    }

    copy.className = "option-copy";
    key.className = "option-key";
    key.textContent = `${optionKey.toUpperCase()}.`;
    setMathText(value, question.options[optionKey]);
    copy.append(key, value);
    tags.className = "option-tags";

    if (isSelected) {
      tags.append(createOptionTag("Your answer"));
    }

    if (isCorrect) {
      tags.append(createOptionTag("Correct answer", "correct"));
    }

    item.append(copy);

    if (tags.childElementCount > 0) {
      item.append(tags);
    }

    options.append(item);
  });

  return options;
}

function createExplanation(question) {
  const explanation = document.createElement("section");
  const heading = document.createElement("h3");
  const correctAnswer = document.createElement("p");
  const correctLabel = document.createElement("strong");
  const correctValue = document.createElement("span");
  const explanationText = document.createElement("p");

  explanation.className = "explanation";
  heading.textContent = "Answer explanation";
  correctAnswer.className = "correct-answer-copy";
  correctLabel.textContent = `Correct answer ${question.correctAnswer.toUpperCase()}: `;
  setMathText(correctValue, question.options[question.correctAnswer]);
  correctAnswer.append(correctLabel, correctValue);
  explanationText.className = "explanation-text";
  setMathText(
    explanationText,
    question.explanation || "No explanation was provided for this answer."
  );
  explanation.append(heading, correctAnswer, explanationText);

  return explanation;
}

function createQuestion(question, index) {
  const questionNumber = index + 1;
  const item = document.createElement("li");
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  const answerStatus = document.createElement("span");
  const questionText = document.createElement("p");
  const diagram = createDiagram(question, questionNumber);

  item.className = "question-item";
  heading.className = "question-heading";
  title.textContent = `Question ${questionNumber}`;
  answerStatus.className = question.isCorrect
    ? "answer-status"
    : "answer-status incorrect";
  answerStatus.textContent = question.isCorrect ? "Correct" : "Incorrect";
  heading.append(title, answerStatus);
  questionText.className = "question-text";
  setMathText(questionText, question.questionText);
  item.append(heading);

  if (diagram) {
    item.append(diagram);
  }

  item.append(
    questionText,
    createQuestionOptions(question),
    createExplanation(question)
  );

  return item;
}

function renderReview(review) {
  clearDiagramObjectUrls();
  scoreEl.textContent = `${review.score}%`;
  correctEl.textContent =
    `${review.questionsCorrect} of ${review.totalQuestions}`;
  dateEl.textContent = completedDateFormatter.format(review.submittedAt);
  timeEl.textContent = formatTimeTaken(review.timeTakenSeconds);
  subtitleEl.textContent = [
    formatPracticeType(review.practiceType),
    `${review.totalQuestions} questions`
  ].join(" / ");
  questionsEl.replaceChildren(...review.questions.map(createQuestion));
  summaryEl.hidden = false;
  questionsEl.hidden = false;
  setStatus("Result loaded.", false, true);
}

async function loadReview(authUser) {
  if (loaded) {
    return;
  }

  loaded = true;

  if (!studentId || !practiceId) {
    subtitleEl.textContent = "Result unavailable";
    setStatus("Student ID and practice ID are required.", true);
    return;
  }

  if (authUser.uid !== studentId) {
    subtitleEl.textContent = "Result unavailable";
    setStatus("This practice result belongs to another student.", true);
    return;
  }

  setStatus("Loading result...");

  try {
    const review = await getPracticeResultReview({studentId, practiceId});

    if (!review) {
      subtitleEl.textContent = "Result unavailable";
      setStatus("The completed practice result was not found.", true);
      return;
    }

    renderReview(review);
  } catch (error) {
    console.error(error);
    subtitleEl.textContent = "Result unavailable";
    setStatus(error.message || "Could not load the practice result.", true);
  }
}

onStudentAuthStateChanged((authUser) => {
  if (!authUser) {
    window.location.replace(SIGN_IN_URL);
    return;
  }

  void loadReview(authUser);
});

window.addEventListener("beforeunload", clearDiagramObjectUrls);
