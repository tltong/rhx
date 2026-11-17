import {demo} from "../demo_module.js?v=20261115-demo-v1";
import {mountFillInTheBlanksPassage} from "../../fill_in_the_blanks_question_generator/components/passage_view.js?v=20261105-chinese-count-v1";
import {mountNewsQuestions} from "../../student_news/pages/common/news_questions.js?v=20261115-news-student-v1";
import {mountNewsVocabulary} from "../../student_news/pages/common/news_vocabulary.js?v=20261115-news-lookup-progress-v1";
import {mountNewsProgress} from "../../student_news/components/news_progress.js?v=20261115-news-lookup-progress-v1";
import {getEssayWordCount} from "../../essay_practice_session/domain/essay_word_count.js";

const TYPES = {normal: "MCQ", essay: "Essay", fillInTheBlanks: "Fill in the blanks"};
const emptySummary = () => ({startingCoins: 0, practiceCoins: 0, newsCoins: 0, totalCoins: 0, practicesCompleted: 0, newsCompleted: 0});
export function mountDemo({root = document, api = demo, pollMs = 2000} = {}) {
  const el = id => root.getElementById(id), listeners = [];
  let revision = 0, disposed = false, active = false, currentPane = "setup", catalog = null, subjects = [], selected = null, scope = null;
  let summary = emptySummary(), practice = null, preparation = null, pendingSubmission = null, renderedAttempt = null, fillView = null;
  let fillingAnswers = false;
  let practiceTimer, newsTimer, newsOperation = 0, newsResult = null, newsPage = 0, newsPending = null, questionsUi, vocabularyUi, progressUi;
  const listen = (element, event, callback) => {element.addEventListener(event, callback); listeners.push(() => element.removeEventListener(event, callback));};
  function node(tag, text, className) {
    const element = root.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function button(text, callback, secondary = true) {
    const element = node("button", text, secondary ? "secondary" : "");
    element.type = "button"; element.addEventListener("click", callback); return element;
  }
  function status(message = "", error = false) {el("demo-status").textContent = message; el("demo-status").classList.toggle("is-error", error);}
  function show(pane) {
    for (const name of ["setup", "subjects", "practice", "news", "summary"]) {
      el("pane-" + name).hidden = name !== pane;
      const step = root.querySelector('[data-step="' + name + '"]');
      if (name === pane) step.setAttribute("aria-current", "step"); else step.removeAttribute("aria-current");
    }
    if (currentPane !== pane) {
      const heading = el("pane-" + pane).querySelector("h1"); heading.tabIndex = -1; heading.focus({preventScroll: true});
      root.defaultView?.scrollTo({top: 0, behavior: "instant"});
    }
    currentPane = pane;
  }
  function setSummary(next) {
    if (!next) return;
    for (const key of ["startingCoins", "practiceCoins", "newsCoins", "practicesCompleted", "newsCompleted"]) {
      summary[key] = Math.max(summary[key] || 0, next[key] || 0);
    }
    summary.totalCoins = summary.startingCoins + summary.practiceCoins + summary.newsCoins;
    el("demo-balance").textContent = summary.totalCoins + (summary.totalCoins === 1 ? " coin" : " coins");
  }
  function options(select, items, placeholder, selectedValue = "") {
    select.replaceChildren();
    if (placeholder) {const option = node("option", placeholder); option.value = ""; select.append(option);}
    for (const item of items) {
      const option = node("option", item.label ?? item); option.value = item.value ?? item; select.append(option);
    }
    select.value = selectedValue || (items.length === 1 ? items[0].value ?? items[0] : "");
  }
  function countryChanged() {
    const country = catalog?.countries.find(item => item.country === el("demo-country").value);
    options(el("demo-level"), (country?.levels || []).map(item => ({value: item.level, label: item.level[0].toUpperCase() + item.level.slice(1)})), "Choose level");
    el("demo-level").disabled = !country; levelChanged();
  }
  function levelChanged() {
    const country = catalog?.countries.find(item => item.country === el("demo-country").value);
    const level = country?.levels.find(item => item.level === el("demo-level").value);
    options(el("demo-grade"), (level?.grades || []).map(grade => ({value: String(grade), label: String(grade)})), "Choose grade");
    el("demo-grade").disabled = !level; setupControls();
  }
  function setupControls() {
    el("demo-setup-continue").disabled = !active || !el("demo-country").value || !el("demo-level").value || !el("demo-grade").value;
  }
  function stopNews() {
    newsOperation++; clearTimeout(newsTimer); questionsUi?.dispose(); vocabularyUi?.dispose(); progressUi?.dispose();
    questionsUi = vocabularyUi = progressUi = null; newsResult = newsPending = null;
    el("demo-news-article").hidden = true; el("demo-news-rewards").hidden = true; el("demo-news-finish").hidden = true;
    el("demo-news-page").replaceChildren(); el("demo-news-sources").replaceChildren();
    el("demo-news-title").textContent = ""; el("demo-news-meta").textContent = "";
  }
  function clearPractice() {
    clearTimeout(practiceTimer); fillView?.dispose(); fillView = null; practice = preparation = pendingSubmission = renderedAttempt = null;
    fillingAnswers = false; el("demo-fill-correct-answers").hidden = true; el("demo-fill-correct-answers").disabled = false;
    el("demo-fill-correct-answers").textContent = "Fill correct answers";
    el("demo-practice-questions").replaceChildren(); el("demo-practice-result").replaceChildren();
    el("demo-tutor").replaceChildren(); el("demo-tutor").hidden = true; el("demo-answer-form").hidden = true;
    el("demo-practice-result").hidden = true; el("demo-practice-preparation").hidden = true;
    el("demo-practice-retry").hidden = true; el("demo-continue-news").hidden = true;
    el("demo-practice-context").textContent = "";
  }
  async function start(newRun = false) {
    const current = ++revision; active = false; if (newRun) api.abandon();
    stopNews(); clearPractice(); subjects = []; selected = scope = null; summary = emptySummary();
    renderSummary();
    el("demo-setup-form").reset(); el("demo-practice-setup").reset(); el("demo-news-form").reset();
    el("demo-subject-list").replaceChildren(); el("demo-end").hidden = false; el("demo-end").disabled = true;
    el("demo-welcome-coin").hidden = true; el("demo-retry-start").hidden = true; el("demo-balance").textContent = "Starting…";
    el("demo-setup-continue").disabled = true; show("setup"); status("Starting your demo…");
    try {
      const started = await api.start(); if (disposed || current !== revision) return;
      active = true; setSummary(started.summary); el("demo-end").disabled = false; el("demo-welcome-coin").hidden = false;
      catalog = await api.request("getCatalog"); if (disposed || current !== revision) return;
      options(el("demo-country"), catalog.countries.map(item => item.country), "Choose country");
      el("demo-country").disabled = false; countryChanged();
      status(catalog.countries.length ? "" : "There are no demo countries configured yet.");
    } catch (error) {
      if (disposed || current !== revision) return;
      status(error.message || "The demo could not start. Retry to continue.", true); el("demo-retry-start").hidden = false;
    }
  }
  function renderSubjects() {
    const host = el("demo-subject-list"); host.replaceChildren();
    for (const subject of subjects) {
      const card = button("", () => chooseSubject(subject)); card.className = "subject-card";
      card.append(node("strong", subject.name));
      const types = [...new Set(subject.topics.flatMap(topic => topic.configurations.map(item => TYPES[item.practiceType])))];
      card.append(node("span", types.join(" · ") || "Practice is not configured yet"));
      card.disabled = !subject.languages.length; host.append(card);
    }
    if (!subjects.length) host.append(node("p", "There are no active subjects for this country, level, and grade. Try another setup."));
    el("demo-scope").textContent = scope.country + " · " + scope.level + " · Grade " + scope.grade;
  }
  async function saveSetup(event) {
    event.preventDefault(); if (!active || !el("demo-setup-form").reportValidity()) return;
    const current = revision; el("demo-setup-continue").disabled = true; status("Finding your subjects…");
    try {
      const result = await api.request("saveSetup", {country: el("demo-country").value, level: el("demo-level").value, grade: Number(el("demo-grade").value)});
      if (disposed || current !== revision) return;
      scope = result.scope; subjects = result.subjects; renderSubjects(); status(); show("subjects");
    } catch (error) {if (current === revision && !disposed) status(error.message, true);}
    finally {if (current === revision && !disposed) setupControls();}
  }
  function practiceChoices(resetType = false) {
    if (!selected) return;
    const language = el("demo-practice-language").value, currentType = resetType ? "" : el("demo-practice-type").value;
    const types = [...new Set(selected.topics.flatMap(topic => topic.configurations.filter(item => item.language === language).map(item => item.practiceType)))];
    options(el("demo-practice-type"), types.map(type => ({value: type, label: TYPES[type]})), null, types.includes(currentType) ? currentType : types[0]);
    const type = el("demo-practice-type").value, topics = selected.topics.filter(topic => topic.configurations.some(item => item.language === language && item.practiceType === type));
    options(el("demo-practice-topic"), topics.map(topic => ({value: topic.id, label: topic.name})), "Choose topic");
    el("demo-mcq-options").hidden = type !== "normal"; el("demo-question-count").required = type === "normal";
    el("demo-start-practice").disabled = !language || !type;
  }
  function chooseSubject(subject) {
    revision++; clearPractice(); stopNews(); selected = subject;
    el("practice-heading").textContent = "Make this practice yours"; el("demo-practice-context").textContent = subject.name;
    el("demo-practice-setup").hidden = false;
    options(el("demo-practice-language"), subject.languages, "Choose language");
    practiceChoices(true); status(); show("practice");
  }
  async function backToSubjects() {
    if (!active) return;
    const current = ++revision; clearTimeout(practiceTimer); stopNews();
    try {
      if (practice && !practice.submitted) await api.request("cancelPractice", {attemptId: practice.attemptId});
      else if (!practice && preparation) await api.request("cancelPractice", {requestId: preparation.requestId});
      if (disposed || current !== revision) return;
      clearPractice(); selected = null; renderSubjects(); status(); show("subjects");
    } catch (error) {if (!disposed && current === revision) status(error.message, true);}
  }
  function math(host) {
    if (globalThis.renderMathInElement) globalThis.renderMathInElement(host, {throwOnError: false, delimiters: [
      {left: "$$", right: "$$", display: true}, {left: "\\(", right: "\\)", display: false}, {left: "\\[", right: "\\]", display: true},
    ]});
  }
  function diagram(host, svg) {
    if (!svg) return;
    const image = node("img"); image.className = "question-diagram"; image.alt = "Question diagram";
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); host.append(image);
  }
  function renderQuestions() {
    const host = el("demo-practice-questions"); host.replaceChildren(); fillView?.dispose(); fillView = null;
    if (practice.practiceType === "normal") {
      const list = node("ol", null, "question-list");
      for (const [index, question] of practice.questions.entries()) {
        const item = node("li", null, "question"), field = node("fieldset"), legend = node("legend", (index + 1) + ". " + question.questionText);
        field.append(legend); diagram(field, question.svg);
        const choices = node("div", null, "question-options");
        for (const [value, text] of Object.entries(question.options)) {
          const label = node("label"), input = node("input"); input.type = "radio"; input.name = "demo-q-" + index; input.value = value; input.required = true;
          label.append(input, node("span", text)); choices.append(label);
        }
        field.append(choices); item.append(field); list.append(item);
      }
      host.append(list);
    } else if (practice.practiceType === "essay") {
      const question = practice.question, panel = node("div", null, "panel");
      panel.append(node("h2", question.questionText));
      if (question.support?.picture?.url?.startsWith("https://")) {
        const image = node("img"); image.src = question.support.picture.url; image.alt = "Picture for the writing task"; image.className = "essay-picture"; panel.append(image);
      }
      if (question.storyFrames?.length) {
        const frames = node("ol"); for (const frame of question.storyFrames) frames.append(node("li", frame)); panel.append(frames);
      }
      if (question.support?.helpingWords?.length) panel.append(node("p", "Helping suggestions: " + question.support.helpingWords.join(" · ")));
      const label = node("label", "Your writing"), answer = node("textarea"); answer.id = "demo-essay-answer"; answer.required = true; answer.maxLength = 100000; answer.dir = "auto";
      const count = node("p", "Words: 0", "help-text"), min = question.wordCountRequirement?.minWords ?? null;
      if (min) panel.append(node("p", "Write at least " + min + " words.", "help-text"));
      answer.addEventListener("input", () => {count.textContent = "Words: " + getEssayWordCount(answer.value, min).wordCount;});
      label.append(answer); panel.append(label, count); host.append(panel);
    } else fillView = mountFillInTheBlanksPassage({root: host, passage: practice.passage, idPrefix: "demo-"});
    el("demo-fill-correct-answers").hidden = practice.practiceType !== "fillInTheBlanks";
    renderedAttempt = practice.attemptId; el("demo-answer-form").hidden = false; el("demo-submit-practice").disabled = false;
    el("demo-submit-practice").textContent = "Complete practice"; math(host);
  }
  function renderResults() {
    const host = el("demo-practice-result"); host.replaceChildren(); host.hidden = false;
    host.append(node("h2", "Practice complete"), node("p", "+" + practice.coinsEarned + " coins earned", "reward-notice"));
    el("demo-continue-news").hidden = false;
    if (!practice.result) {host.append(node("p", "Your answers are being marked. Your completion coins have already been awarded.")); return;}
    const result = practice.result;
    if (practice.practiceType === "normal") {
      host.append(node("p", result.questionsCorrect + " / " + result.totalQuestions + " correct — " + Math.round(result.score) + "%"));
      for (const [index, item] of result.review.entries()) {
        const review = node("div", null, "answer-review"); review.append(node("h3", (index + 1) + ". " + item.questionText));
        diagram(review, item.svg);
        review.append(node("p", "Your answer: " + item.options[item.selectedOption], item.isCorrect ? "answer-correct" : "answer-incorrect"),
          node("p", "Correct answer: " + item.options[item.correctAnswer]), node("p", item.explanation));
        if (!item.isCorrect && item.tutorEnabled) review.append(button("Review this question", () => openTutor(index)));
        host.append(review);
      }
    } else if (practice.practiceType === "essay") {
      host.append(node("p", "Score: " + result.score + "%"), node("p", result.reviewComment));
      for (const correction of result.corrections || []) {
        const review = node("div", null, "answer-review"); review.append(node("p", correction.originalText, "answer-incorrect"),
          node("p", correction.correctedText, "answer-correct"), node("p", correction.explanation)); host.append(review);
      }
      host.append(node("h3", "Your writing"), node("p", practice.submission.essayText));
    } else {
      host.append(node("p", result.questionsCorrect + " / " + result.totalQuestions + " correct — " + Math.round(result.score) + "%"));
      const passage = node("div"); host.append(passage); fillView?.dispose();
      fillView = mountFillInTheBlanksPassage({root: passage, passage: practice.passage, result, readOnly: true, idPrefix: "demo-review-"});
    }
    math(host);
  }
  function acceptPractice(result) {
    practice = result.practice; setSummary(result.summary); el("demo-practice-setup").hidden = true;
    el("demo-practice-retry").hidden = true; el("demo-tutor").hidden = true;
    el("demo-practice-context").textContent = selected.name + " · " + TYPES[practice.practiceType] + " · " + practice.topic;
    if (practice.submitted) {
      el("demo-answer-form").hidden = true; el("demo-practice-preparation").hidden = true;
      pendingSubmission = null; renderResults(); el("practice-heading").textContent = "Review your practice";
    } else if (practice.status === "ready") {
      el("demo-practice-preparation").hidden = true; el("practice-heading").textContent = "Your practice";
      if (renderedAttempt !== practice.attemptId) renderQuestions();
    } else {
      el("demo-answer-form").hidden = true; el("demo-practice-preparation").hidden = false;
      el("demo-practice-progress").textContent = practice.progress ? practice.progress.prepared + " of " + practice.progress.total + " questions ready" : "Getting your questions ready…";
    }
    if (practice.status === "failed") {
      status(practice.errorMessage, true); el("demo-practice-retry").hidden = false;
      el("demo-practice-retry").textContent = practice.submitted ? "Retry marking" : "Retry preparation";
    } else status();
    if (["queued", "running", "waiting"].includes(practice.status)) {
      const current = revision; clearTimeout(practiceTimer); practiceTimer = setTimeout(() => {if (current === revision) void checkPractice();}, pollMs);
    }
  }
  async function checkPractice(retry = false) {
    const current = revision;
    try {
      const result = practice ? await api.request("getPractice", {attemptId: practice.attemptId, ...(retry ? {retry: true} : {})})
        : await api.request("preparePractice", preparation);
      if (!disposed && current === revision) acceptPractice(result);
    } catch (error) {
      if (disposed || current !== revision) return;
      status(error.message, true); el("demo-practice-retry").hidden = false; el("demo-practice-retry").textContent = "Check practice status";
    }
  }
  async function startPractice(event) {
    event.preventDefault(); if (!active || !el("demo-practice-setup").reportValidity()) return;
    preparation = {requestId: crypto.randomUUID(), syllabusId: selected.id, language: el("demo-practice-language").value,
      topicId: el("demo-practice-topic").value, practiceType: el("demo-practice-type").value};
    if (preparation.practiceType === "normal") Object.assign(preparation, {difficulty: el("demo-difficulty").value, questionCount: Number(el("demo-question-count").value)});
    el("demo-practice-setup").hidden = true; el("demo-practice-preparation").hidden = false; status("Preparing your practice…");
    await checkPractice();
  }
  async function fillCorrectAnswers() {
    if (!active || practice?.practiceType !== "fillInTheBlanks" || practice.submitted || pendingSubmission || fillingAnswers) return;
    const current = revision, attemptId = practice.attemptId, control = el("demo-fill-correct-answers");
    fillingAnswers = true; control.disabled = true; control.textContent = "Filling answers…";
    el("demo-submit-practice").disabled = true; status("Filling the correct answers…");
    try {
      const result = await api.request("getFillInTheBlanksAnswers", {attemptId});
      if (disposed || current !== revision || practice?.attemptId !== attemptId || practice.submitted) return;
      for (const question of practice.passage.questions) {
        const input = el("demo-blank-" + question.questionId);
        input.value = result.answers[question.questionId];
        input.dispatchEvent(new root.defaultView.Event("input", {bubbles: true}));
      }
      fillView.validate(); status("Correct answers filled. You can edit them or complete the practice.");
    } catch (error) {
      if (!disposed && current === revision) status(error.message, true);
    } finally {
      if (!disposed && current === revision && practice?.attemptId === attemptId && !practice.submitted) {
        fillingAnswers = false; control.disabled = false; control.textContent = "Fill correct answers";
        el("demo-submit-practice").disabled = false;
      }
    }
  }
  async function submitPractice(event) {
    event?.preventDefault(); if (!practice || !active || practice.submitted || fillingAnswers) return;
    if (!pendingSubmission) {
      if (!el("demo-answer-form").reportValidity()) return;
      pendingSubmission = {attemptId: practice.attemptId};
      if (practice.practiceType === "normal") pendingSubmission.answers = practice.questions.map((question, index) => ({
        questionId: question.id, selectedOption: el("demo-answer-form").querySelector('input[name="demo-q-' + index + '"]:checked').value,
      }));
      else if (practice.practiceType === "essay") {
        const text = el("demo-essay-answer").value, count = getEssayWordCount(text, practice.question.wordCountRequirement?.minWords ?? null);
        if (!count.meetsMinimum) {pendingSubmission = null; status("Write at least " + (count.minWords || 1) + " words before submitting.", true); return;}
        pendingSubmission.essayText = text;
      } else {
        if (!fillView.validate()) {pendingSubmission = null; status("Check the answer lengths before submitting.", true); return;}
        pendingSubmission.answers = fillView.getAnswers();
      }
    }
    const current = revision; el("demo-submit-practice").disabled = true;
    el("demo-fill-correct-answers").disabled = true;
    for (const input of el("demo-answer-form").querySelectorAll("input, textarea")) input.disabled = true;
    status("Submitting your practice…");
    try {
      const result = await api.request("submitPractice", pendingSubmission);
      if (!disposed && current === revision) acceptPractice(result);
    } catch (error) {
      if (disposed || current !== revision) return;
      status(error.message + " Use Check submission to retry your original answers.", true);
      el("demo-submit-practice").textContent = "Check submission"; el("demo-submit-practice").disabled = false;
    }
  }
  async function openTutor(index) {
    const current = revision, host = el("demo-tutor"); host.hidden = false; host.replaceChildren(node("h2", "Preparing your tutor review…"));
    try {
      const guide = await api.request("getTutor", {attemptId: practice.attemptId, questionIndex: index});
      if (disposed || current !== revision) return;
      let step = 0;
      function render() {
        host.replaceChildren(node("h2", "Let’s work it out together"), node("p", practice.result.review[index].questionText));
        const mini = guide.miniQuestions[step], form = node("form", null, "tutor-step");
        form.append(node("p", "Step " + (step + 1) + " of " + guide.miniQuestions.length, "eyebrow"), node("h3", mini.questionText));
        const label = node("label", "Your answer"), answer = node("input"); answer.type = "text"; answer.required = true; answer.maxLength = 10000; label.append(answer);
        const feedback = node("p"); feedback.setAttribute("role", "status"); const check = node("button", "Check answer"); check.type = "submit";
        const isCurrentStep = () => !disposed && current === revision && form.isConnected && !host.hidden;
        const fill = button("Fill correct answer", async () => {
          if (!isCurrentStep() || fill.disabled || check.disabled || answer.disabled) return;
          fill.disabled = check.disabled = true; fill.textContent = "Filling answer…"; feedback.textContent = "";
          try {
            const result = await api.request("getTutorAnswer", {attemptId: practice.attemptId, questionIndex: index, sequence: mini.sequence});
            if (!isCurrentStep()) return;
            answer.value = result.answer; answer.dispatchEvent(new root.defaultView.Event("input", {bubbles: true}));
            feedback.className = "help-text"; feedback.textContent = "Correct answer filled. You can edit it, then check your answer.";
            answer.focus();
          } catch (error) {
            if (isCurrentStep()) {feedback.className = "answer-incorrect"; feedback.textContent = error.message;}
          } finally {
            if (isCurrentStep() && !answer.disabled) {fill.disabled = check.disabled = false; fill.textContent = "Fill correct answer";}
          }
        });
        fill.id = "demo-tutor-fill-answer";
        const actions = node("div", null, "actions"); actions.append(fill, check);
        form.append(label, feedback, actions); host.append(form, button("Back to answer review", () => {host.hidden = true;}));
        form.addEventListener("submit", async event => {
          event.preventDefault(); if (check.disabled || !form.reportValidity()) return; check.disabled = fill.disabled = true;
          try {
            const result = await api.request("checkTutor", {attemptId: practice.attemptId, questionIndex: index, sequence: mini.sequence, answer: answer.value});
            if (!isCurrentStep()) return;
            feedback.textContent = result.message; feedback.className = result.isCorrect ? "answer-correct" : "answer-incorrect";
            if (result.isCorrect) {
              check.hidden = fill.hidden = true; answer.disabled = true;
              form.append(button(step + 1 === guide.miniQuestions.length ? "Finish tutor review" : "Next step", () => {
                if (++step === guide.miniQuestions.length) host.hidden = true; else render();
              }, false));
            } else check.disabled = fill.disabled = false;
          } catch (error) {if (isCurrentStep()) {feedback.textContent = error.message; check.disabled = fill.disabled = false;}}
        });
        math(host);
      }
      render(); host.scrollIntoView({block: "start"});
    } catch (error) {if (!disposed && current === revision) host.replaceChildren(node("p", error.message), button("Back to answer review", () => {host.hidden = true;}));}
  }
  function renderNewsPage() {
    if (!newsResult?.article || !vocabularyUi) return;
    const article = newsResult.article, page = article.pages[newsPage], host = el("demo-news-page"); host.replaceChildren();
    const text = node("div"); vocabularyUi.renderText(text, page); text.dir = "auto"; host.append(text);
    for (const image of page.images) {
      if (!image.url?.startsWith("https://")) continue;
      const figure = node("figure"), img = node("img"); img.src = image.url; img.alt = image.altText; img.loading = "lazy";
      figure.append(img, node("figcaption", image.credit)); host.append(figure);
    }
    el("demo-news-page-count").textContent = "Page " + (newsPage + 1) + " of " + article.pages.length;
    el("demo-news-previous").disabled = newsPage === 0; el("demo-news-next").disabled = newsPage + 1 === article.pages.length;
  }
  function showNewsRewards(result) {
    const rewards = result.completion?.rewards || result.rewards;
    if (!rewards) return;
    setSummary(result.summary);
    el("demo-news-rewards").hidden = false;
    el("demo-news-rewards").textContent = "+" + rewards.completionCoins + " completion coins" +
      (rewards.allCorrectCoins ? " + " + rewards.allCorrectCoins + " all-correct bonus" : "") + " — " + rewards.totalCoins + " coins earned";
    el("demo-news-finish").hidden = false;
  }
  async function continueNews() {
    if (!active || !summary.practicesCompleted) return;
    revision++; clearTimeout(practiceTimer); el("demo-tutor").hidden = true; stopNews(); show("news"); status("Loading news options…");
    const current = revision;
    const apis = Object.fromEntries(["getNewsVocabulary", "requestNewsMeaning", "getNewsMeaning", "getNewsQuestions", "submitNewsQuestions"].map(action => [action, input => api.request(action, input)]));
    progressUi = mountNewsProgress({root, host: el("demo-news-progress")});
    vocabularyUi = mountNewsVocabulary({root, host: el("demo-news-vocabulary"), apis, pollMs, onReady: renderNewsPage});
    questionsUi = mountNewsQuestions({root, host: el("demo-news-questions"), apis, pollMs, onResult: result => {
      if (!disposed && current === revision && currentPane === "news") showNewsRewards(result);
    }});
    try {
      const result = await api.request("getNewsOptions"); if (disposed || current !== revision) return;
      options(el("demo-news-language"), result.languages, "Choose language"); status();
      el("demo-news-type").options[1].textContent = "Local news — " + result.country;
    } catch (error) {if (!disposed && current === revision) status(error.message, true);}
  }
  async function loadNews(retry = false) {
    if (!active || !newsPending) return;
    const current = revision, operation = ++newsOperation; clearTimeout(newsTimer);
    el("demo-news-retry").hidden = true; progressUi.resume();
    try {
      const result = await api.request("prepareNews", {...newsPending, ...(retry ? {retry: true} : {})});
      if (disposed || current !== revision || operation !== newsOperation) return;
      progressUi.update(result);
      if (result.status === "ready") {
        const changed = newsResult?.article?.editionId !== result.article.editionId;
        newsResult = result; if (changed) newsPage = 0;
        el("demo-news-article").hidden = false; el("demo-news-title").textContent = result.article.title;
        el("demo-news-meta").textContent = result.article.language + " · " + result.article.actualWordCount + " words · Published " + new Date(result.article.publishedAt).toLocaleDateString();
        const sources = el("demo-news-sources"); sources.replaceChildren();
        for (const source of result.article.sources) {
          if (!source.url?.startsWith("https://")) continue;
          const link = node("a", source.publisher + ": " + source.title); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
          const paragraph = node("p"); paragraph.append(link); sources.append(paragraph);
        }
        const reference = {newsType: newsPending.newsType, articleLanguage: result.article.language};
        vocabularyUi.setArticle(reference, result.article); questionsUi.setArticle(reference, result.article);
        renderNewsPage(); showNewsRewards(result); status("Read the article, then submit all three answers."); return;
      }
      if (result.status === "failed") {
        status(result.errorMessage || "The article could not be prepared. Retry to continue.", true); el("demo-news-retry").hidden = false; return;
      }
      status("Preparing your news article…"); newsTimer = setTimeout(() => loadNews(), pollMs);
    } catch (error) {
      if (disposed || current !== revision || operation !== newsOperation) return;
      progressUi.connectionLost(); status(error.message, true); el("demo-news-retry").hidden = false;
    }
  }
  function renderSummary() {
    el("summary-start").textContent = summary.startingCoins; el("summary-practice").textContent = summary.practiceCoins;
    el("summary-news").textContent = summary.newsCoins; el("summary-total").textContent = summary.totalCoins;
  }
  async function finish() {
    if (!active) return;
    active = false; const current = ++revision; stopNews(); clearPractice(); subjects = []; selected = scope = null;
    el("demo-subject-list").replaceChildren(); el("demo-setup-form").reset(); el("demo-practice-setup").reset(); el("demo-news-form").reset();
    el("demo-end").hidden = true; status(); renderSummary(); show("summary");
    try {
      const result = await api.finish();
      if (!disposed && current === revision) {setSummary(result.summary); renderSummary();}
    } catch {if (!disposed && current === revision) status("Your demo is finished. You can start again for a fresh experience.");}
  }
  listen(el("demo-country"), "change", countryChanged); listen(el("demo-level"), "change", levelChanged); listen(el("demo-grade"), "change", setupControls);
  listen(el("demo-setup-form"), "submit", saveSetup); listen(el("demo-practice-language"), "change", () => practiceChoices(true));
  listen(el("demo-practice-type"), "change", () => practiceChoices()); listen(el("demo-practice-setup"), "submit", startPractice);
  listen(el("demo-answer-form"), "submit", submitPractice); listen(el("demo-back-subjects"), "click", backToSubjects);
  listen(el("demo-fill-correct-answers"), "click", fillCorrectAnswers);
  listen(el("demo-news-subjects"), "click", backToSubjects); listen(el("demo-change-setup"), "click", () => {show("setup"); status();});
  listen(el("demo-practice-retry"), "click", () => {void checkPractice(true);}); listen(el("demo-continue-news"), "click", continueNews);
  listen(el("demo-news-form"), "submit", event => {
    event.preventDefault(); if (!el("demo-news-form").reportValidity()) return;
    newsPending = {newsType: el("demo-news-type").value, language: el("demo-news-language").value};
    el("demo-news-rewards").hidden = true; el("demo-news-finish").hidden = true; progressUi.start(); void loadNews();
  });
  listen(el("demo-news-retry"), "click", () => loadNews(true));
  listen(el("demo-news-previous"), "click", () => {if (newsPage > 0) {newsPage--; renderNewsPage();}});
  listen(el("demo-news-next"), "click", () => {if (newsResult && newsPage + 1 < newsResult.article.pages.length) {newsPage++; renderNewsPage();}});
  listen(el("demo-end"), "click", finish); listen(el("demo-news-finish"), "click", finish);
  listen(el("demo-start-again"), "click", () => start(true)); listen(el("demo-retry-start"), "click", () => start());
  void start();
  return {finish, dispose() {disposed = true; revision++; active = false; stopNews(); clearPractice(); api.abandon(); listeners.forEach(stop => stop());}};
}
if (typeof document !== "undefined" && document.getElementById("demo-root")) {
  let mounted = mountDemo();
  window.addEventListener("pagehide", () => {mounted?.dispose(); mounted = null;});
  window.addEventListener("pageshow", event => {if (event.persisted && !mounted) mounted = mountDemo();});
}
