import {getEssayWordCount} from "../../domain/essay_word_count.js?v=20261018-essay-min-word-count-v1";

const SIGN_IN_URL = "/features/student/pages/sign_in/sign_in.html";

export function mountEssayPractice({
  root = document, params = new URLSearchParams(window.location.search),
  loadSession, submitSession, onAuthChanged, navigate = url => window.location.replace(url),
  now = () => Date.now(), schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = timer => clearTimeout(timer),
} = {}) {
  const get = id => root.getElementById(id);
  const form = get("essay-form"), answer = get("essay-answer"), submit = get("essay-submit");
  const status = get("essay-status"), refresh = get("essay-refresh");
  const essayPracticeId = params.get("essayPracticeId")?.trim();
  const requestedStudentId = params.get("studentId")?.trim();
  let studentId = null, session = null, busy = false, revision = 0, timer = null, disposed = false;
  let wordCountError = false;
  let startedAt = now(), pollUntil = 0;
  function stopPolling() {if (timer !== null) cancel(timer); timer = null;}
  function showStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }
  function updateWordCount() {
    const count = getEssayWordCount(answer.value, session?.question.wordCountRequirement?.minWords ?? null);
    const message = count.minWords === null ? `${count.wordCount} words`
      : `${count.wordCount} / ${count.minWords} words minimum${count.meetsMinimum ? " — minimum reached" : ` — ${count.minWords - count.wordCount} more needed`}`;
    if (get("essay-word-count").textContent !== message) get("essay-word-count").textContent = message;
    submit.disabled = busy || session?.status !== "assigned" || !count.meetsMinimum;
    return count;
  }
  function reset() {
    stopPolling();
    session = null;
    busy = false;
    wordCountError = false;
    answer.value = "";
    submit.disabled = true;
    for (const id of ["essay-form", "essay-question-section", "essay-submission", "essay-result", "essay-review"]) get(id).hidden = true;
    get("essay-submitted-text").textContent = "";
    get("essay-score").textContent = "";
    get("essay-review-comment").textContent = "";
    get("essay-corrections").replaceChildren();
    updateWordCount();
  }
  function render(data) {
    session = data;
    const {question, practice, result} = data;
    get("essay-summary").textContent = `${question.level} / Grade ${question.standard} / ${question.language} / ${question.difficulty}`;
    get("essay-question").textContent = question.questionText;
    get("essay-requirement").textContent = question.wordCountRequirement?.minWords
      ? `Write at least ${question.wordCountRequirement.minWords} words.` : "";
    get("essay-question-section").hidden = false;
    form.hidden = data.status !== "assigned";
    get("essay-submission").hidden = data.status !== "completed";
    get("essay-result").hidden = !result;
    get("essay-review").hidden = !result?.reviewComment;
    get("essay-review-comment").textContent = result?.reviewComment || "";
    updateWordCount();
    if (data.status === "assigned") {showStatus(""); return;}
    get("essay-submitted-text").textContent = practice.essayText;
    refresh.hidden = Boolean(result);
    if (result) {
      stopPolling();
      showStatus("Your essay has been scored.");
      get("essay-score").textContent = `${result.score} / 100`;
      const corrections = get("essay-corrections");
      corrections.replaceChildren();
      for (const correction of result.corrections) {
        const item = root.createElement("article");
        item.className = "correction";
        for (const [label, text] of [["Original", correction.originalText], ["Correction", correction.correctedText || "Remove this text."], ["Explanation", correction.explanation]]) {
          const line = root.createElement("p");
          line.className = "copy";
          line.textContent = `${label}: ${text}`;
          item.append(line);
        }
        corrections.append(item);
      }
      if (!result.corrections.length) {
        const message = root.createElement("p");
        message.textContent = "No corrections were suggested.";
        corrections.append(message);
      }
    } else {
      if (practice.scoring?.status === "superseded") {
        showStatus("Your essay is saved. A newer submission for this question has replaced its result.");
        refresh.hidden = true;
        return;
      }
      const failed = practice.scoring?.status === "failed";
      showStatus(failed ? "Your essay is saved. Scoring could not finish and will be retried. You can return to the dashboard and check later."
        : now() >= pollUntil ? "Your essay is saved. Scoring is still pending. Refresh the result or check again later."
          : "Your essay is saved. Scoring is in progress… You can return to the dashboard while you wait.", failed);
      if (!failed && now() < pollUntil) timer = schedule(() => {timer = null; void reload();}, 5000);
    }
  }
  async function reload() {
    if (!studentId || disposed || busy) return;
    stopPolling();
    const token = revision;
    busy = true;
    refresh.disabled = true;
    try {
      const data = await loadSession({studentId, essayPracticeId});
      if (token !== revision || disposed) return;
      busy = false;
      render(data);
    } catch (error) {
      if (token === revision && !disposed) showStatus(error.message || "Could not load this essay practice. Please refresh to try again.", true);
    } finally {
      if (token === revision && !disposed) {busy = false; refresh.disabled = false;}
    }
  }
  async function submitEssay(event) {
    event.preventDefault();
    if (busy || !studentId || session?.status !== "assigned" || !answer.value.trim()) return;
    const count = updateWordCount();
    if (!count.meetsMinimum) {
      wordCountError = true;
      showStatus(count.minWords === null ? "Write your essay before submitting."
        : `Your essay has ${count.wordCount} words. Write at least ${count.minWords} words before submitting.`, true);
      return;
    }
    const token = revision;
    busy = true;
    submit.disabled = true;
    answer.disabled = true;
    showStatus("Saving your essay…");
    try {
      const completion = await submitSession({studentId, essayPracticeId, essayText: answer.value,
        timeTakenSeconds: Math.max(0, Math.round((now() - startedAt) / 1000))});
      if (token !== revision || disposed) return;
      busy = false;
      pollUntil = now() + 120000;
      render({...session, status: "completed", practice: completion, result: null});
    } catch (error) {
      if (token !== revision || disposed) return;
      busy = false;
      answer.disabled = false;
      updateWordCount();
      showStatus(error.message || "Could not save your essay. Your text is still here; try submitting again.", true);
    }
  }
  const onInput = () => {
    updateWordCount();
    if (wordCountError) {showStatus(""); wordCountError = false;}
  };
  const onRefresh = () => {pollUntil = now() + 120000; return reload();};
  form.addEventListener("submit", submitEssay);
  answer.addEventListener("input", onInput);
  refresh.addEventListener("click", onRefresh);
  const unsubscribe = onAuthChanged(async user => {
    revision += 1;
    reset();
    studentId = user?.uid || null;
    if (!user) {navigate(SIGN_IN_URL); return;}
    if (requestedStudentId && requestedStudentId !== studentId) {
      showStatus("This essay practice belongs to another student.", true);
      return;
    }
    answer.disabled = false;
    startedAt = now();
    pollUntil = now() + 120000;
    if (!essayPracticeId || essayPracticeId.includes("/")) {showStatus("An essay practice ID is required.", true); return;}
    showStatus("Loading your essay practice…");
    await reload();
  });
  return {
    hasUnsavedAnswer: () => !form.hidden && Boolean(answer.value.trim()),
    dispose() {
      disposed = true; revision += 1; stopPolling(); unsubscribe?.();
      form.removeEventListener("submit", submitEssay); answer.removeEventListener("input", onInput);
      refresh.removeEventListener("click", onRefresh);
    },
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const [{loadEssayPracticeSession, submitEssayPracticeSession}, {onStudentAuthStateChanged}] = await Promise.all([
    import("../../essay_practice_session_module.js?v=20261018-essay-reuse-v1"),
    import("../../../student/student_module.js?v=20260823-student-country-v1"),
  ]);
  const page = mountEssayPractice({loadSession: loadEssayPracticeSession, submitSession: submitEssayPracticeSession, onAuthChanged: onStudentAuthStateChanged});
  window.addEventListener("beforeunload", event => {if (page.hasUnsavedAnswer()) {event.preventDefault(); event.returnValue = "";}});
  window.addEventListener("pagehide", event => {if (!event.persisted) page.dispose();});
}
