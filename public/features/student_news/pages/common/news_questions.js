import * as news from "../../student_news_module.js?v=20261115-news-student-v1";

export function mountNewsQuestions({root = document, host, apis = news, pollMs = 2500, onBusyChange = () => {}, onResult = () => {}} = {}) {
  const section = root.createElement("section"), heading = root.createElement("h3"), help = root.createElement("p"), status = root.createElement("p"), retry = root.createElement("button"), form = root.createElement("form"), fields = root.createElement("fieldset"), bank = root.createElement("div"), list = root.createElement("ol"), submit = root.createElement("button"), score = root.createElement("p");
  section.className = "news-questions"; heading.textContent = "Check your understanding"; help.className = "help-text";
  help.textContent = "Answer all three questions and submit once. Your score and the correct answers will appear afterward.";
  status.className = "help-text news-questions-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  retry.type = "button"; retry.className = "secondary news-questions-retry"; retry.textContent = "Retry question preparation"; retry.hidden = true;
  bank.className = "news-question-word-bank"; list.className = "news-question-list"; score.className = "news-question-score"; score.setAttribute("role", "status");
  submit.type = "submit"; submit.className = "news-questions-submit"; submit.textContent = "Submit answers";
  fields.append(bank, list, submit); form.append(fields); section.append(heading, help, status, retry, score, form); host.append(section); section.hidden = true;
  let reference = null, sourceKey = null, disposed = false, version = 0, timer, current = null, activeId = null, submitting = false, pending = null;
  const drafts = new Map(); let answers = {};
  function busy(value) {submitting = value; onBusyChange(value); controls();}
  function controls() {
    fields.disabled = submitting || !!current?.attempt; submit.disabled = !current || submitting || !!current.attempt || current.questions.some(question => !answers[question.id]?.trim());
    submit.hidden = !!current?.attempt; form.setAttribute("aria-busy", String(submitting));
  }
  function draftKey() {return current.attemptId + (current.answerMode === "typed" ? ":" + current.language : "");}
  function remember() {drafts.set(draftKey(), {...answers}); controls();}
  function render() {
    bank.replaceChildren(); list.replaceChildren(); form.hidden = false; score.textContent = current.attempt ? "Score: " + current.attempt.score + " / " + current.attempt.total : "";
    help.textContent = current.attempt ? "Submitted. You can review your answers below. This attempt is complete in every article language." : "Answer all three questions and submit once. Your score and the correct answers will appear afterward.";
    if (current.answerMode === "word_bank" && !current.attempt) {
      const title = root.createElement("h4"), instructions = root.createElement("p"), choices = root.createElement("div");
      title.textContent = "Word bank"; instructions.className = "help-text"; instructions.textContent = "Select a blank, then choose a word or phrase. Two choices will not be needed."; choices.className = "news-question-choices";
      for (const choice of current.wordBank) {
        const button = root.createElement("button"); button.type = "button"; button.className = "secondary news-question-choice"; button.textContent = choice.text; button.dataset.choiceId = choice.id;
        button.addEventListener("click", () => {
          if (submitting || current.attempt) return;
          answers[activeId || current.questions[0].id] = choice.id; remember(); activeId = current.questions.find(question => !answers[question.id])?.id || activeId; render();
          list.querySelector('[data-question-id="' + activeId + '"]')?.focus({preventScroll: true});
        }); choices.append(button);
      }
      bank.append(title, instructions, choices);
    }
    for (const [index, question] of current.questions.entries()) {
      const item = root.createElement("li"), sentence = root.createElement("p"), parts = question.prompt.split("____"); sentence.className = "news-question-sentence";
      sentence.append(root.createTextNode(parts[0]));
      if (current.attempt) {
        const blank = root.createElement("strong"), result = current.attempt.review.find(item => item.questionId === question.id), review = root.createElement("div"), response = root.createElement("p"), correct = root.createElement("p");
        blank.textContent = result.correctAnswer; sentence.append(blank); review.className = "news-question-review " + (result.correct ? "is-correct" : "is-incorrect");
        response.textContent = (result.correct ? "Correct. " : "Incorrect. ") + "Your answer: " + result.response;
        correct.textContent = "Correct answer: " + result.correctAnswer; review.append(response, correct); item.append(sentence, review);
      } else if (current.answerMode === "typed") {
        const input = root.createElement("input"); input.type = "text"; input.required = true; input.maxLength = 120; input.autocomplete = "off"; input.spellcheck = false; input.className = "news-question-input"; input.dataset.questionId = question.id;
        input.setAttribute("aria-label", "Answer to question " + (index + 1)); input.value = answers[question.id] || "";
        input.addEventListener("input", () => {answers[question.id] = input.value; remember();}); sentence.append(input); item.append(sentence);
      } else {
        const blank = root.createElement("button"); blank.type = "button"; blank.className = "secondary news-question-blank"; blank.dataset.questionId = question.id;
        blank.textContent = current.wordBank.find(choice => choice.id === answers[question.id])?.text || "Choose an answer";
        blank.setAttribute("aria-label", "Answer to question " + (index + 1) + ": " + blank.textContent); blank.setAttribute("aria-pressed", String(activeId === question.id));
        blank.addEventListener("click", () => {activeId = question.id; render(); bank.querySelector("button")?.focus({preventScroll: true});}); sentence.append(blank); item.append(sentence);
      }
      sentence.append(root.createTextNode(parts[1])); list.append(item);
    }
    controls();
  }
  async function load(retryFailed = false) {
    if (disposed || !reference || submitting) return;
    const revision = version; clearTimeout(timer); retry.hidden = true;
    try {
      const result = await apis.getNewsQuestions({...reference, ...(retryFailed ? {retry: true} : {})});
      if (disposed || revision !== version) return;
      if (result.status === "ready") {
        current = result; answers = {...(drafts.get(draftKey()) || {})}; activeId = current.questions.find(question => !answers[question.id])?.id || current.questions[0].id;
        status.textContent = ""; render(); onResult(result); return;
      }
      if (result.status === "failed") {status.textContent = result.errorMessage || "Questions could not be prepared."; retry.hidden = false; return;}
      status.textContent = "Preparing comprehension questions..."; timer = setTimeout(() => load(), pollMs);
    } catch (error) {if (!disposed && revision === version) {status.textContent = error.message || "Could not load questions."; retry.hidden = false;}}
  }
  async function send() {
    if (disposed || submitting || !pending) return;
    const revision = version; busy(true); retry.hidden = true; status.textContent = "Submitting answers...";
    try {
      const result = await apis.submitNewsQuestions(pending);
      if (disposed || revision !== version) return;
      current = result; pending = null; status.textContent = "Answers submitted."; render(); busy(false); onResult(result);
    } catch (error) {
      if (disposed || revision !== version) return;
      // Retain the exact submission after an uncertain response. Re-sending it
      // checks the saved result; it never creates a second attempt.
      status.textContent = error.message || "Could not confirm submission.";
      if (["invalid-argument", "failed-precondition"].some(code => error.code?.endsWith(code))) {pending = null; busy(false);}
      else {submitting = false; fields.disabled = true; retry.textContent = "Check submission"; retry.hidden = false;}
    }
  }
  function submitAnswers(event) {
    event.preventDefault(); if (submitting || pending || !current || current.attempt || current.questions.some(question => !answers[question.id]?.trim())) return;
    pending = {...reference, setId: current.setId, answers: current.questions.map(question => ({questionId: question.id, value: answers[question.id]}))}; send();
  }
  const retryRequest = () => {if (pending) send(); else {retry.textContent = "Retry question preparation"; load(true);}};
  form.addEventListener("submit", submitAnswers); retry.addEventListener("click", retryRequest);
  function clear() {version++; clearTimeout(timer); reference = null; sourceKey = null; current = null; pending = null; answers = {}; section.hidden = true; form.hidden = true; busy(false);}
  return {
    setArticle(articleReference, article) {
      const next = JSON.stringify([articleReference, article.editionId]); if (next === sourceKey) return;
      clear(); sourceKey = next; reference = {...articleReference}; section.hidden = false; status.textContent = "Preparing comprehension questions..."; retry.hidden = true; score.textContent = ""; load();
    },
    clear, dispose() {disposed = true; clear(); form.removeEventListener("submit", submitAnswers); retry.removeEventListener("click", retryRequest); host.replaceChildren();},
  };
}
