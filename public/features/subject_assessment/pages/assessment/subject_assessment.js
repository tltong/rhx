import * as api from "../../subject_assessment_module.js?v=20261109-assessment-tutor-v1";
import {getFirebaseAuth} from "../../../../utils/firebase/firebase_auth.js";
import {mountFillInTheBlanksPassage} from "../../../fill_in_the_blanks_question_generator/components/passage_view.js?v=20261108-assessment-results-v1";

const $ = id => document.getElementById(id), params = new URLSearchParams(location.search), assessmentId = params.get("assessmentId");
const node = (tag, text, className) => {const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value;};
const percentage = value => Number(value).toLocaleString(undefined, {maximumFractionDigits: 1}) + "%";
const format = value => ({normal: "MCQ", essay: "Essay", fillInTheBlanks: "Fill in the blanks"})[value] || value;
let user, session, generation = 0, views = [], disposers = [], revision = 0, dirty = false, conflict = false, busy = false, submitting = false;
let editVersion = 0, saveTimer, pollTimer, savePromise = null, listCursor, resultsCursor, pollAttempts = 0;
let awaitingSubmissionConfirmation = false;
function status(message, error = false) {$("assessment-status").textContent = message; $("assessment-status").classList.toggle("error", error);}
function url(id) {const query = new URLSearchParams(); for (const key of ["studentId", "syllabusId"]) if (params.get(key)) query.set(key, params.get(key)); if (id) query.set("assessmentId", id); return "./subject_assessment.html" + (query.size ? "?" + query : "");}
function controls() {
  const locked = !session?.canSubmit || session?.submission?.status === "submitted";
  $("save-answers").hidden = locked; $("submit-assessment").hidden = locked;
  $("save-answers").disabled = busy || submitting || conflict; $("submit-assessment").disabled = busy || submitting || conflict;
  $("retry-marking").hidden = locked && !session?.canSubmit || session?.submission?.markingStatus !== "failed";
  $("retry-marking").disabled = busy;
  for (const view of views) view.disable(locked || submitting);
}
function disposeViews() {for (const dispose of disposers) dispose(); disposers = []; views = [];}
function image(content, root) {
  const picture = content.support?.picture?.url;
  if (picture && /^https:\/\//.test(picture)) {const img = node("img", undefined, "question-image"); img.src = picture; img.alt = "Supporting illustration"; root.append(img);}
  if (content.svg) {
    const address = URL.createObjectURL(new Blob([content.svg], {type: "image/svg+xml"})), img = node("img", undefined, "question-image");
    img.src = address; img.alt = "Question diagram"; root.append(img); disposers.push(() => URL.revokeObjectURL(address));
  }
}
function renderItems() {
  disposeViews(); const root = $("assessment-items"); root.replaceChildren();
  const answers = new Map((session.submission?.items || []).map(item => [item.position, item]));
  const results = new Map((session.result?.items || []).map(item => [item.position, item]));
  for (const item of session.assessment.items) {
    const content = item.contentSnapshot, answer = answers.get(item.position) || {}, marked = results.get(item.position);
    const card = node("section", undefined, "assessment-card"); card.dataset.position = item.position;
    card.append(node("h2", `${item.position}. ${item.topicName}`), node("p", `${format(item.questionType)} · ${item.difficulty}`, "help"));
    if (item.questionType === "fillInTheBlanks") {
      const passageRoot = node("div"); card.append(passageRoot);
      const view = mountFillInTheBlanksPassage({root: passageRoot, passage: {...content, language: content.language || session.assessment.language},
        answers: answer.answers, result: marked?.answer, readOnly: session.submission?.status === "submitted" || !session.canSubmit, idPrefix: "assessment-" + item.position + "-"});
      views.push({get: () => ({position: item.position, answers: view.getAnswers()}), validate: view.validate, disable: view.setDisabled});
      disposers.push(view.dispose);
    } else {
      image(content, card); card.append(node("p", content.questionText, "question-text"));
      if (content.specialInstruction) card.append(node("p", content.specialInstruction, "help"));
      if (item.questionType === "normal") {
        const inputs = [];
        for (const key of ["a", "b", "c", "d"]) {
          const label = node("label", undefined, "option"), input = node("input"); input.type = "radio"; input.name = "item-" + item.position; input.value = key; input.checked = answer.selectedOption === key;
          label.append(input, node("span", key.toUpperCase() + ". " + content.options[key])); card.append(label); inputs.push(input);
        }
        const unanswered = node("label", undefined, "option"), empty = node("input"); empty.type = "radio"; empty.name = "item-" + item.position; empty.value = ""; empty.checked = !answer.selectedOption;
        unanswered.append(empty, node("span", "Leave unanswered")); card.append(unanswered); inputs.push(empty);
        views.push({get: () => ({position: item.position, selectedOption: inputs.find(input => input.checked)?.value || null}), validate: () => true,
          disable: value => inputs.forEach(input => {input.disabled = value;})});
      } else {
        if (content.wordCountRequirement?.minWords) card.append(node("p", `Minimum ${content.wordCountRequirement.minWords} words.`, "help"));
        if (content.support?.helpingWords?.length) card.append(node("p", "Helping suggestions: " + content.support.helpingWords.join(", "), "help"));
        const label = node("label", "Your essay"), input = node("textarea"); input.id = "essay-" + item.position; input.maxLength = 100000; input.dir = "auto"; input.value = answer.answer || ""; label.htmlFor = input.id;
        card.append(label, input); views.push({get: () => ({position: item.position, answer: input.value}), validate: () => true, disable: value => {input.disabled = value;}});
      }
    }
    if (marked) {
      const feedback = node("div", undefined, "feedback"); feedback.append(node("strong", "Score: " + percentage(marked.score)));
      if (item.questionType === "normal") feedback.append(node("p", (marked.answer.isCorrect ? "Correct. " : "Correct option: " + marked.answer.correctAnswer.toUpperCase() + ". ") + (marked.answer.explanation || "")));
      if (item.questionType === "essay") {
        feedback.append(node("p", marked.answer.reviewComment, "essay-feedback"));
        for (const correction of marked.answer.corrections || []) {
          const entry = node("div", undefined, "correction"); entry.append(node("p", correction.originalText + " → " + correction.correctedText), node("p", correction.explanation)); feedback.append(entry);
        }
      }
      card.append(feedback);
      if (item.questionType === "normal" && marked.answer?.isCorrect === false && item.tutorEnabled === true && item.tutorQuestionId) {
        const review = node("a", "Review this question", "question-review-link");
        review.href = "/features/tutor/pages/question_review/question_review.html?" + new URLSearchParams({assessmentId,
          position: String(item.position), questionId: item.tutorQuestionId, language: session.assessment.language,
          syllabusId: session.assessment.syllabusId, studentId: session.assessment.studentId});
        review.setAttribute("aria-label", "Review question " + item.position); card.append(review);
      }
    }
    root.append(card);
  }
  controls();
}
function renderResult() {
  const result = session.result; $("assessment-result").hidden = !result; if (!result) return;
  $("assessment-score").textContent = percentage(result.score);
  $("assessment-score-policy").textContent = result.scoringPolicy.aggregation === "topic" ? "Each topic has equal weight in the overall score, regardless of its question count." : "Each MCQ, essay and individual blank has equal weight. Essay percentages are normalized to one mark.";
  const root = $("assessment-breakdowns"); root.replaceChildren();
  for (const [title, key, label] of [["By topic", "topicBreakdown", item => item.topicName], ["By format", "formatBreakdown", item => format(item.questionType)], ["By difficulty", "difficultyBreakdown", item => item.difficulty]]) {
    root.append(node("h3", title)); const table = node("table"), head = node("tr"); head.append(node("th", "Category"), node("th", "Questions"), node("th", "Score")); table.append(head);
    for (const item of result[key]) {const row = node("tr"); row.append(node("td", label(item)), node("td", item.questionCount), node("td", percentage(item.score))); table.append(row);} root.append(table);
  }
}
function describeSession() {
  const submission = session.submission;
  $("assessment-instructions").textContent = submission?.status === "submitted" ? "Your submitted answers and marking feedback are shown below." : "You can save and return to your answers. Submitting locks them. Unanswered questions receive zero marks.";
  if (submission?.status !== "submitted" && session.assessment.studentId === user?.uid) $("assessment-instructions").textContent += " After submission, you will return to your dashboard while marking continues.";
  if (session.result) status("Assessment marked. Your answers and feedback are below.");
  else if (submission?.markingStatus === "failed") status(submission.errorMessage, true);
  else if (submission?.status === "submitted") status(`Answers submitted. Marking ${submission.markedItemCount} of ${submission.itemCount} items…`);
  else status(session.canSubmit ? "Answer the questions below. Your progress saves automatically." : "You are viewing this student's assessment.");
  $("assessment-save-status").textContent = submission?.status === "submitted" ? "Submitted answers are locked." : dirty ? "Unsaved changes." : submission ? "Answers saved." : "";
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (session?.submission?.status === "submitted" && ["pending", "marking"].includes(session.submission.markingStatus) && !session.result && pollAttempts < 60) {
    pollTimer = setTimeout(async () => {pollAttempts++; try {await loadSession(false);} catch (error) {status(error.message, true); schedulePoll();}}, 5000);
  }
}
function acceptSubmission(submission) {
  if (submission?.status !== "submitted") throw new Error("The submission could not be confirmed. Check its status before leaving.");
  session.submission = submission; revision = submission.revision; dirty = false; conflict = false; awaitingSubmissionConfirmation = false;
  clearTimeout(saveTimer); clearTimeout(pollTimer);
  if (session.assessment.studentId === user?.uid) {
    status("Answers submitted. Returning to your dashboard…");
    location.replace($("dashboard-link").href);
    return;
  }
  renderItems(); renderResult(); describeSession(); schedulePoll();
}
async function loadSession(start = false) {
  const token = generation; const loaded = await api.getSubjectAssessmentSession({assessmentId}); if (token !== generation) return;
  session = loaded; revision = loaded.submission?.revision || 0;
  if (start && session.canSubmit && !session.submission) {
    try {session.submission = await api.saveSubjectAssessmentAnswers({assessmentId, expectedRevision: 0, answers: []});}
    catch (error) {if (error.code?.endsWith("aborted")) return loadSession(false); throw error;}
    if (token !== generation) return; revision = session.submission.revision;
  }
  dirty = false; conflict = false; $("assessment-title").textContent = (session.assessment.contextSnapshot?.subject || "Subject") + " assessment";
  $("assessment-list-panel").hidden = true; $("assessment-session-panel").hidden = false;
  renderItems(); renderResult(); describeSession(); schedulePoll();
}
async function persist() {
  clearTimeout(saveTimer);
  if (savePromise) await savePromise;
  if (!dirty || conflict || session?.submission?.status === "submitted" || !session?.canSubmit) return;
  const token = generation, version = editVersion, answers = views.map(view => view.get());
  busy = true; controls();
  savePromise = (async () => {
    for (let offset = 0; offset < answers.length; offset += 350) {
      const saved = await api.saveSubjectAssessmentAnswers({assessmentId, expectedRevision: revision, answers: answers.slice(offset, offset + 350)});
      if (token !== generation) return;
      revision = saved.revision; session.submission = saved;
    }
    if (token !== generation) return;
    dirty = editVersion !== version; $("assessment-save-status").textContent = dirty ? "Unsaved changes." : "Answers saved.";
  })();
  try {await savePromise;}
  catch (error) {if (token === generation) {conflict = error.code?.endsWith("aborted") || error.code?.endsWith("failed-precondition"); status(error.message + (conflict ? " Copy any unsaved text before reloading saved answers." : " Your unsaved answers remain on this page."), true);} throw error;}
  finally {savePromise = null; busy = false; if (token === generation) {controls(); if (dirty && !conflict && !submitting) saveTimer = setTimeout(() => persist().catch(() => {}), 1500);}}
}
$("assessment-form").addEventListener("input", () => {dirty = true; editVersion++; $("assessment-save-status").textContent = "Unsaved changes."; clearTimeout(saveTimer); if (!conflict) saveTimer = setTimeout(() => persist().catch(() => {}), 1500);});
$("save-answers").addEventListener("click", () => persist().catch(() => {}));
$("assessment-form").addEventListener("submit", async event => {
  event.preventDefault(); if (submitting || conflict || !session?.canSubmit || session.submission?.status === "submitted") return;
  const valid = views.map(view => view.validate()).every(Boolean), formValid = $("assessment-form").reportValidity();
  if (!valid || !formValid) return;
  submitting = true; controls();
  const token = generation;
  try {
    await persist(); if (token !== generation) return;
    awaitingSubmissionConfirmation = true;
    const submitted = await api.submitSubjectAssessment({assessmentId, expectedRevision: revision, answers: []});
    if (token !== generation) return;
    acceptSubmission(submitted);
  }
  catch (error) {
    if (token !== generation) return;
    // A lost response may follow a successful commit. Reconcile before permitting edits.
    try {const saved = await api.getSubjectAssessmentSession({assessmentId}); if (token !== generation) return; if (saved.submission?.status === "submitted") {session = saved; acceptSubmission(saved.submission);}
      else {awaitingSubmissionConfirmation = false; status(error.message, true);}} catch {if (token === generation) {conflict = true; status("Submission status could not be confirmed. Check status before editing or submitting again.", true);}}
  } finally {submitting = false; if (token === generation) controls();}
});
$("check-assessment").addEventListener("click", async () => {
  clearTimeout(saveTimer); const token = generation, confirmingSubmission = awaitingSubmissionConfirmation;
  try {
    if (savePromise) await savePromise.catch(() => {});
    if (token !== generation) return;
    pollAttempts = 0; await loadSession(false); if (token !== generation) return;
    if (confirmingSubmission) {
      awaitingSubmissionConfirmation = false;
      if (session.submission?.status === "submitted") acceptSubmission(session.submission);
    }
  } catch (error) {if (token === generation) status(error.message, true);}
});
$("retry-marking").addEventListener("click", async () => {busy = true; controls(); try {await api.retrySubjectAssessmentMarking({assessmentId}); pollAttempts = 0; await loadSession(false);} catch (error) {status(error.message, true);} finally {busy = false; controls();}});
async function list(more = false, resultsOnly = false) {
  const token = generation, studentId = params.get("studentId") || user.uid;
  const filter = params.get("syllabusId") ? {syllabusId: params.get("syllabusId")} : {};
  const response = resultsOnly ? await api.listStudentSubjectAssessmentResults({studentId, ...filter, cursor: more ? resultsCursor : null}) : await api.listStudentSubjectAssessments({studentId, ...filter, cursor: more ? listCursor : null});
  if (token !== generation) return;
  const root = $(resultsOnly ? "assessment-history" : "assessment-list"); if (!more) root.replaceChildren();
  for (const item of response[resultsOnly ? "results" : "assessments"]) {
    const card = node("div", undefined, "panel"), link = node("a", resultsOnly ? `${item.language} · ${percentage(item.score)} · View result` : (item.contextSnapshot?.subject || item.syllabusId) + " · " + item.language);
    link.href = url(item.assessmentId); card.append(link); root.append(card);
  }
  if (!root.children.length) root.append(node("p", resultsOnly ? "No marked assessments yet." : "No subject assessments are available yet."));
  if (resultsOnly) resultsCursor = response.nextCursor; else listCursor = response.nextCursor;
  $(resultsOnly ? "more-results" : "more-assessments").hidden = !response.nextCursor;
}
$("more-assessments").addEventListener("click", () => list(true).catch(error => status(error.message, true)));
$("more-results").addEventListener("click", () => list(true, true).catch(error => status(error.message, true)));
addEventListener("beforeunload", event => {if (dirty) {event.preventDefault(); event.returnValue = "";}});
getFirebaseAuth().onAuthStateChanged(async current => {
  const token = ++generation; user = current; session = null; dirty = false; conflict = false; awaitingSubmissionConfirmation = false; clearTimeout(saveTimer); clearTimeout(pollTimer); disposeViews();
  for (const id of ["assessment-items", "assessment-list", "assessment-history", "assessment-breakdowns"]) $(id).replaceChildren();
  $("assessment-score").textContent = ""; $("assessment-result").hidden = true;
  $("assessment-list-panel").hidden = true; $("assessment-session-panel").hidden = true;
  if (!current) {status("Sign in to access your assessments."); return;}
  $("assessment-list-link").href = url(); $("dashboard-link").hidden = !!params.get("studentId") && params.get("studentId") !== current.uid;
  try {if (assessmentId) await loadSession(true); else {await Promise.all([list(), list(false, true)]); if (token !== generation) return; $("assessment-list-panel").hidden = false; status("Choose an assessment or view a previous result.");}}
  catch (error) {if (token === generation) status(error.message, true);}
});
