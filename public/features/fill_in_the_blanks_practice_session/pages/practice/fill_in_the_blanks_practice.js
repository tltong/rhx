import * as sessions from "../../fill_in_the_blanks_practice_session_module.js?v=20261112-essay-variation-v1";
import * as generations from "../../../student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module.js?v=20261104-fill-preassessment-v3";
import {watchStudentFillInTheBlanksPracticeUpdates} from "../../../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module.js?v=20261105-chinese-count-v1";
import {mountFillInTheBlanksPassage} from "../../../fill_in_the_blanks_question_generator/components/passage_view.js?v=20261105-chinese-count-v1";
import {onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";
import {isCurrentUserSiteAdmin} from "../../../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
export function mountFillInTheBlanksSession({root = document, scope, readOnly = false, api = sessions, next = generations,
  watch = watchStudentFillInTheBlanksPracticeUpdates, now = () => Date.now()} = {}) {
  const byId = id => root.getElementById(id), listeners = [];
  let loaded = null, busy = false, view = null, startedAt = null, stopWatch, timer, deadlineTimer, disposed = false, refreshPending = false, hasSubmitted = false;
  function listen(element, event, callback) {element.addEventListener(event, callback); listeners.push(() => element.removeEventListener(event, callback));}
  function queueRefresh() {
    clearTimeout(timer);
    timer = setTimeout(() => {if (disposed) return; if (busy) {refreshPending = true; return;} refreshPending = false; void load();}, 250);
  }
  const markingActive = value => ["submitted", "marking"].includes(value.submission?.markingStatus) && new Date(value.submission.retryAt).getTime() > now();
  function refreshAt(value) {
    const when = new Date(value).getTime();
    if (Number.isFinite(when) && when > now()) {clearTimeout(deadlineTimer); deadlineTimer = setTimeout(() => {if (!busy) void load();}, when - now() + 100);}
  }
  function status(message, error = false) {byId("fill-session-status").textContent = message; byId("fill-session-status").classList.toggle("is-error", error);}
  async function nextStatus() {
    if (loaded?.status !== "completed") return;
    byId("fill-next-section").hidden = false;
    const state = await next.getFillInTheBlanksGenerationStatus({studentId: scope.studentId, completedPracticeId: scope.practiceId});
    if (disposed) return;
    const staleGeneration = state?.status === "generating" && state.leaseUntil && new Date(state.leaseUntil).getTime() <= now();
    const staleProcessing = loaded.processing?.status === "processing" && loaded.processing.retryAt && new Date(loaded.processing.retryAt).getTime() <= now();
    const failed = state?.status === "failed" || loaded.processing?.status === "failed" || staleGeneration || staleProcessing;
    if (!failed) refreshAt(state?.leaseUntil ?? loaded.processing?.retryAt);
    byId("fill-retry-generation").hidden = readOnly || !failed;
    byId("fill-next-status").textContent = state?.status === "completed"
      ? state.outcome === "framework-completed" ? "You have completed this topic's assessment framework." : "Your next practice is ready on the dashboard."
      : failed ? state?.errorMessage || "Your result is saved, but the next practice could not be prepared. Please retry."
        : "Preparing your next practice… This page updates automatically.";
  }
  async function render(value) {
    if (disposed) return; loaded = value; view?.dispose(); clearTimeout(deadlineTimer);
    byId("fill-session-content").hidden = false;
    const isPreAssessment = value.practice.type === "pre assessment";
    byId("fill-session-meta").textContent = (isPreAssessment ? "Pre-assessment · " : "") + value.passage.questions.length + " questions · " + value.passage.difficulty;
    const placement = byId("fill-placement");
    placement.hidden = !isPreAssessment;
    placement.textContent = !value.result ? "This passage determines your starting level for this topic."
      : value.assessment ? value.assessment.isFrameworkCompleted ? "Pre-assessment complete. You have reached the final framework level."
        : "Pre-assessment complete. Starting level: " + (value.assessment.levelName || value.assessment.levelId) + "."
        : "Your passage has been marked. Determining your starting level…";
    const submittedAnswers = value.submission?.answers ?? {};
    view = mountFillInTheBlanksPassage({root: byId("fill-student-passage"), passage: value.passage, answers: submittedAnswers,
      result: value.result, readOnly: readOnly || Boolean(value.submission)});
    const button = byId("fill-submit"); button.hidden = readOnly || value.status === "completed";
    button.textContent = value.submission ? "Retry submitted passage" : "Submit passage";
    button.disabled = true;
    byId("fill-final-score").hidden = !value.result;
    if (value.result) byId("fill-final-score").textContent = value.result.questionsCorrect + " / " + value.result.totalQuestions + " correct — " + Math.round(value.result.score * 10) / 10 + "%";
    if (value.status === "completed") status("Your passage has been marked. Review your answers below.");
    else if (markingActive(value)) status("Your submitted passage is being marked. The final score appears after every answer has been checked.");
    else if (value.submission) status("Your answers are saved. Retry the submitted passage to finish marking.");
    else status(readOnly ? "Viewing this student's assigned passage." : "Your practice is ready.");
    await view.ready;
    if (disposed) return;
    startedAt ??= now(); button.disabled = busy || markingActive(value);
    if (markingActive(value)) refreshAt(value.submission.retryAt);
    if (!value.submission && !readOnly) view.setDisabled(false);
    await nextStatus();
  }
  async function load() {
    if (busy || disposed) return;
    busy = true; refreshPending = false; byId("fill-check").disabled = true;
    try {await render(await api.loadFillInTheBlanksPracticeSession(scope));}
    catch (error) {if (!disposed) status(error.message + (error.requestId ? " Reference: " + error.requestId : ""), true);}
    finally {busy = false;
      if (!disposed) {
        byId("fill-check").disabled = false;
        if (loaded?.status === "assigned") byId("fill-submit").disabled = markingActive(loaded);
        if (refreshPending) queueRefresh();
      }
    }
  }
  listen(byId("fill-answer-form"), "submit", async event => {
    event.preventDefault(); if (disposed || busy || readOnly || !view || !view.validate()) return;
    busy = true; hasSubmitted = true; byId("fill-submit").disabled = true; view.setDisabled(true);
    status("Checking your answers… Please wait while all answers are marked.");
    try {
      await render(await api.submitFillInTheBlanksPracticeSession({...scope, answers: loaded.submission?.answers ?? view.getAnswers(),
        timeTakenSeconds: loaded.submission?.timeTakenSeconds ?? Math.max(0, (now() - startedAt) / 1000)}));
    } catch (error) {
      if (!disposed) status(error.message + (error.requestId ? " Reference: " + error.requestId : "") + " Your saved submission can be checked or retried.", true);
    } finally {
      busy = false; if (disposed) return; byId("fill-submit").disabled = false;
      // Reload the durable submission so a failed marking request never edits its original answers.
      await load();
    }
  });
  listen(byId("fill-check"), "click", () => {void load();});
  listen(byId("fill-retry-generation"), "click", async () => {
    if (disposed || busy || readOnly) return; busy = true; byId("fill-retry-generation").disabled = true;
    try {await next.generateNextStudentFillInTheBlanksPractice({studentId: scope.studentId, completedPracticeId: scope.practiceId});}
    catch (error) {if (!disposed) byId("fill-next-status").textContent = error.message;}
    finally {busy = false; if (!disposed) {byId("fill-retry-generation").disabled = false; await load();}}
  });
  stopWatch = watch({studentId: scope.studentId}, () => {
    if (disposed || (!hasSubmitted && !loaded?.submission && loaded?.status !== "completed")) return;
    if (busy) {refreshPending = true; return;} queueRefresh();
  }, error => status("Live updates are unavailable. Use Check submission status. " + error.message, true));
  return {load, dispose() {disposed = true; clearTimeout(timer); clearTimeout(deadlineTimer); stopWatch?.(); listeners.forEach(stop => stop()); view?.dispose();}};
}
if (typeof document !== "undefined" && document.getElementById("fill-answer-form")) {
  let mounted;
  onFirebaseAuthStateChanged(async user => {
    mounted?.dispose(); mounted = null;
    document.getElementById("fill-session-content").hidden = true; document.getElementById("fill-next-section").hidden = true;
    if (!user) {document.getElementById("fill-session-status").textContent = "Sign in to view this practice."; return;}
    try {
      const params = new URLSearchParams(location.search), studentId = params.get("studentId") || user.uid, practiceId = params.get("practiceId");
      if (!practiceId) throw new Error("The practice link is missing its reference. Open the assignment from your dashboard.");
      const readOnly = studentId !== user.uid && !(await isCurrentUserSiteAdmin()).isAdmin;
      if (readOnly) document.getElementById("fill-back").href = "/features/guardian/pages/student_dashboard/student_dashboard.html?studentId=" + encodeURIComponent(studentId);
      mounted = mountFillInTheBlanksSession({scope: {studentId, practiceId}, readOnly}); await mounted.load();
    } catch (error) {document.getElementById("fill-session-status").textContent = error.message;}
  });
}
