import {
  getTutorConfig, getTutorMiniQuestionSet, checkTutorMiniQuestionAnswer,
  getTutorQuestionById,
} from "../../tutor_module.js?v=20261015-tutor-simple-answers-v1";
import {onStudentAuthStateChanged} from "../../../student/student_module.js?v=20260716-no-eager-auth";
import {setMathText} from "../../../../utils/math/render_math.js?v=20260822-katex-math";

const SIGN_IN_URL = "/features/student/pages/sign_in/sign_in.html";
const PRACTICE_RESULT_URL = "/features/practice_result/pages/result/practice_result.html";
const OPTION_KEYS = ["a", "b", "c", "d"];

export function mountQuestionReview({
  root = document,
  params = new URLSearchParams(globalThis.location?.search || ""),
  loadQuestion = getTutorQuestionById,
  loadConfig = getTutorConfig,
  loadSet = getTutorMiniQuestionSet,
  checkAnswer = checkTutorMiniQuestionAnswer,
  onAuthChanged = onStudentAuthStateChanged,
  navigate = url => globalThis.location.replace(url),
  mathText = setMathText,
  createDiagramUrl = svg => URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"})),
  revokeDiagramUrl = url => URL.revokeObjectURL(url),
  reportError = details => console.error("Question review failed", details),
} = {}) {
  const ids = [
    "review-back-to-results", "review-complete-back-to-results",
    "review-original", "review-question-text", "review-diagram", "review-options",
    "review-guidance", "review-step", "review-preparation", "review-preparation-message",
    "review-load-error", "review-error-message", "retry-review", "review-answer-form",
    "review-mini-question", "review-answer", "check-review-answer", "next-review-question",
    "review-feedback", "review-step-explanation", "review-step-answer", "review-step-explanation-text",
    "review-complete", "review-complete-heading", "review-final-answer",
    "review-final-explanation", "restart-review",
  ];
  const elements = Object.fromEntries(ids.map(id => {
    const element = root.getElementById(id);
    if (!element) throw new Error("Question review element is missing: " + id);
    return [id, element];
  }));
  const el = id => elements[id];
  const questionId = params.get("questionId")?.trim() || "";
  const practiceId = params.get("practiceId")?.trim() || "";
  const requestedLanguage = params.get("language")?.trim() || "";
  let uid = null;
  let token = 0;
  let phase = "idle";
  let question = null;
  let configuration = null;
  let set = null;
  let language = "";
  let index = 0;
  let answerChecked = false;
  let diagramUrl = null;
  let destroyed = false;
  let pending = Promise.resolve();

  function getResultUrl() {
    return practiceId && uid
      ? PRACTICE_RESULT_URL + "?" + new URLSearchParams({studentId: uid, practiceId})
      : "";
  }

  function updateResultLinks() {
    const href = getResultUrl();
    for (const id of ["review-back-to-results", "review-complete-back-to-results"]) {
      el(id).href = href;
      el(id).hidden = !href;
    }
  }

  function reportFailure(error, action) {
    reportError({action, code: error.code || null, status: error.status || null,
      requestId: error.requestId || null, message: error.message});
  }

  function clearDiagram() {
    if (diagramUrl) revokeDiagramUrl(diagramUrl);
    diagramUrl = null;
    el("review-diagram").replaceChildren();
    el("review-diagram").hidden = true;
  }

  function setFeedback(message, {error = false, correct = false} = {}) {
    const feedback = el("review-feedback");
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("is-error", error);
    feedback.classList.toggle("is-correct", correct);
  }

  function disableAnswers() {
    el("review-answer").disabled = true;
    el("check-review-answer").disabled = true;
    el("next-review-question").disabled = true;
  }

  function setPreparing(message) {
    phase = "loading";
    el("review-guidance").setAttribute("aria-busy", "true");
    el("review-preparation-message").textContent = message;
    el("review-preparation").hidden = false;
    el("review-load-error").hidden = true;
    el("retry-review").disabled = true;
    el("review-answer-form").hidden = true;
    el("review-complete").hidden = true;
    el("review-step").hidden = true;
    disableAnswers();
  }

  function renderOriginal() {
    mathText(el("review-question-text"), question.questionText);
    el("review-options").replaceChildren(...OPTION_KEYS.map(key => {
      const item = root.createElement("li");
      const label = root.createElement("strong");
      const text = root.createElement("span");
      label.textContent = key.toUpperCase() + ".";
      text.dir = "auto";
      mathText(text, question.options[key]);
      item.append(label, text);
      return item;
    }));
    clearDiagram();
    if (question.hasDiagram && question.svg) {
      const image = root.createElement("img");
      diagramUrl = createDiagramUrl(question.svg);
      image.src = diagramUrl;
      image.alt = "Diagram for the original question";
      image.addEventListener("error", () => {
        el("review-diagram").textContent = "The diagram could not be displayed.";
      });
      el("review-diagram").append(image);
      el("review-diagram").hidden = false;
    }
    el("review-original").hidden = false;
  }

  function renderStep() {
    phase = "answering";
    answerChecked = false;
    const miniQuestion = set.miniQuestions[index];
    el("review-guidance").setAttribute("aria-busy", "false");
    el("review-preparation").hidden = true;
    el("review-load-error").hidden = true;
    el("review-complete").hidden = true;
    el("review-answer-form").hidden = false;
    el("review-step").hidden = false;
    el("review-step").textContent = "Step " + (index + 1) + " of " + set.miniQuestions.length;
    mathText(el("review-mini-question"), miniQuestion.questionText);
    el("review-answer").value = "";
    el("review-answer").disabled = false;
    el("review-answer").setAttribute("aria-invalid", "false");
    el("check-review-answer").disabled = false;
    el("check-review-answer").textContent = "Check answer";
    el("next-review-question").disabled = true;
    el("next-review-question").textContent = index === set.miniQuestions.length - 1 ? "Finish review" : "Next";
    el("review-step-explanation").hidden = true;
    el("review-step-answer").textContent = "";
    el("review-step-explanation-text").textContent = "";
    setFeedback("");
    el("review-answer").focus();
  }

  async function load() {
    if (destroyed || !uid) return;
    const request = ++token;
    setPreparing(question ? "Preparing your guided questions…" : "Loading your question…");
    try {
      if (!questionId) throw new Error("A question ID is required. Open a question review link to get started.");
      if (!question) {
        const loaded = await loadQuestion(questionId);
        if (destroyed || request !== token) return;
        if (!loaded) throw new Error("This question could not be found.");
        question = loaded;
        renderOriginal();
      }
      language = requestedLanguage || question.language;
      configuration = await loadConfig();
      if (destroyed || request !== token) return;
      if (!configuration) throw new Error("Guided review has not been configured yet. Please try again later.");
      if (!configuration.correctAnswerMessage?.[language]
          || !configuration.incorrectAnswerMessage?.[language]) {
        throw new Error("Guided review feedback is not configured for " + language + ".");
      }
      setPreparing("Preparing your guided questions…");
      const loadedSet = await loadSet({questionId, language});
      if (destroyed || request !== token) return;
      if (!loadedSet || loadedSet.questionId !== questionId || loadedSet.language !== language
          || !Array.isArray(loadedSet.miniQuestions) || !loadedSet.miniQuestions.length) {
        throw new Error("The guided questions could not be loaded. Please try again.");
      }
      set = loadedSet;
      index = 0;
      renderStep();
    } catch (error) {
      if (destroyed || request !== token) return;
      reportFailure(error, "prepare-guided-questions");
      phase = "error";
      el("review-guidance").setAttribute("aria-busy", "false");
      el("review-preparation").hidden = true;
      el("review-load-error").hidden = false;
      el("review-error-message").textContent = error.message || "Could not prepare your guided questions.";
      el("retry-review").hidden = !questionId;
      el("retry-review").disabled = false;
    }
  }

  async function submitAnswer(event) {
    event.preventDefault();
    if (phase !== "answering" || answerChecked || !set) return;
    const answer = el("review-answer").value.trim();
    if (!answer) {
      setFeedback("Write an answer before checking it.", {error: true});
      el("review-answer").setAttribute("aria-invalid", "true");
      el("review-answer").focus();
      return;
    }
    const request = token;
    const miniQuestion = set.miniQuestions[index];
    phase = "checking";
    disableAnswers();
    el("check-review-answer").textContent = "Checking…";
    el("review-guidance").setAttribute("aria-busy", "true");
    setFeedback("Checking your answer…");
    try {
      const result = await checkAnswer({questionId, language, sequence: miniQuestion.sequence, answer});
      if (destroyed || request !== token) return;
      if (!result || typeof result.isCorrect !== "boolean") throw new Error("Could not check your answer. Please try again.");
      const isCorrect = result.isCorrect;
      el("review-answer").setAttribute("aria-invalid", isCorrect ? "false" : "true");
      setFeedback(isCorrect ? configuration.correctAnswerMessage[language]
        : configuration.incorrectAnswerMessage[language], {correct: isCorrect, error: !isCorrect});
      mathText(el("review-step-answer"), miniQuestion.expectedAnswer);
      mathText(el("review-step-explanation-text"), miniQuestion.answerExplanation);
      el("review-step-explanation").hidden = false;
      answerChecked = true;
      phase = "answering";
      el("next-review-question").disabled = false;
      el("next-review-question").focus();
    } catch (error) {
      if (destroyed || request !== token) return;
      reportFailure(error, "check-answer");
      phase = "answering";
      setFeedback(error.message || "Could not check your answer. Please try again.", {error: true});
    } finally {
      if (!destroyed && request === token) {
        el("review-guidance").setAttribute("aria-busy", "false");
        el("check-review-answer").textContent = "Check answer";
        el("review-answer").disabled = answerChecked;
        el("check-review-answer").disabled = answerChecked;
        if (!answerChecked) el("review-answer").focus();
      }
    }
  }

  function nextStep() {
    if (phase !== "answering" || !answerChecked) return;
    if (index < set.miniQuestions.length - 1) {
      index++;
      renderStep();
      return;
    }
    const resultUrl = getResultUrl();
    if (resultUrl) {
      phase = "leaving";
      disableAnswers();
      navigate(resultUrl);
      return;
    }
    phase = "complete";
    el("review-answer-form").hidden = true;
    el("review-step").hidden = true;
    el("review-complete").hidden = false;
    mathText(el("review-final-answer"), question.options[question.correctAnswer]);
    mathText(el("review-final-explanation"), question.explanation);
    el("review-complete-heading").focus();
  }

  function restart() {
    if (phase !== "complete") return;
    index = 0;
    renderStep();
  }

  function retry() {
    if (phase !== "error") return pending;
    pending = load();
    return pending;
  }

  function onAuth(user) {
    if (destroyed) return Promise.resolve();
    if (user?.uid === uid && uid) return pending;
    ++token;
    uid = user?.uid || null;
    updateResultLinks();
    question = configuration = set = null;
    clearDiagram();
    el("review-original").hidden = true;
    el("review-answer-form").hidden = true;
    el("review-complete").hidden = true;
    el("review-step").hidden = true;
    setFeedback("");
    disableAnswers();
    if (!uid) {
      phase = "signed-out";
      el("review-preparation").hidden = true;
      el("review-load-error").hidden = true;
      el("review-guidance").setAttribute("aria-busy", "false");
      navigate(SIGN_IN_URL);
      pending = Promise.resolve();
    } else {
      pending = load();
    }
    return pending;
  }

  el("review-answer-form").addEventListener("submit", submitAnswer);
  el("next-review-question").addEventListener("click", nextStep);
  el("restart-review").addEventListener("click", restart);
  el("retry-review").addEventListener("click", retry);
  setPreparing("Loading your question…");
  const unsubscribe = onAuthChanged(onAuth);
  return {
    get ready() {return pending;},
    dispose() {
      if (destroyed) return;
      destroyed = true;
      ++token;
      unsubscribe?.();
      clearDiagram();
      el("review-answer-form").removeEventListener("submit", submitAnswer);
      el("next-review-question").removeEventListener("click", nextStep);
      el("restart-review").removeEventListener("click", restart);
      el("retry-review").removeEventListener("click", retry);
    },
  };
}

if (typeof document !== "undefined" && document.getElementById("question-review-page")) {
  const page = mountQuestionReview();
  globalThis.addEventListener("pagehide", () => page.dispose(), {once: true});
}
