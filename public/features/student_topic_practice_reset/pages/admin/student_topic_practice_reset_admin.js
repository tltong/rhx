import {listStudents} from "../../../student/student_module.js?v=20260823-student-country-v1";
import {listSyllabuses} from "../../../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";
import {previewStudentTopicPracticeReset, requestStudentTopicPracticeReset, getStudentTopicPracticeResetStatus}
  from "../../student_topic_practice_reset_module.js?v=20261018-topic-reset-v1";
import {onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";

const labels = {assignedPractices: "Assigned practices", completedPractices: "Completed practices and answers", practiceResults: "Practice results and answers", completionProcessing: "Practice processing records",
  assessmentRecords: "Assessment records", assignedEssays: "Assigned essays", completedEssays: "Essay submissions",
  essayQuestionUsage: "Essay question assignment records",
  essayResults: "Essay scores, reviews and corrections", essayGeneration: "Essay generation records", topicProgression: "Topic progression",
  topicReadiness: "Topic readiness and history", topicReliability: "Topic reliability", subjectReadinessHistory: "Related subject readiness history", missionRecords: "Topic mission records"};
export function mountTopicResetAdmin({root = document, loadStudents = listStudents, loadSyllabuses = listSyllabuses,
  preview = previewStudentTopicPracticeReset, request = requestStudentTopicPracticeReset, status = getStudentTopicPracticeResetStatus,
  subscribeAuth = onFirebaseAuthStateChanged, schedule = (fn, ms) => setTimeout(fn, ms), cancel = clearTimeout,
  newId = () => crypto.randomUUID()} = {}) {
  const get = id => root.getElementById(id), student = get("reset-student"), syllabus = get("reset-syllabus"), topic = get("reset-topic");
  let syllabuses = [], busy = false, previewData = null, job = null, timer = null, revision = 0, disposed = false;
  let initialAccount, accountInvalid = false;
  let requestPending = false;
  const selection = () => ({studentId: student.value, syllabusId: syllabus.value, topicId: topic.value});
  function message(text, error = false) {get("reset-status").textContent = text; get("reset-status").classList.toggle("error", error);}
  function stop() {if (timer !== null) cancel(timer); timer = null;}
  function controls() {
    for (const field of [student, syllabus, topic]) field.disabled = accountInvalid || busy || field === topic && !syllabus.value;
    get("preview-reset").disabled = accountInvalid || busy || !student.value || !syllabus.value || !topic.value;
    get("execute-reset").disabled = accountInvalid || busy || !previewData
      || Boolean(previewData.activeReset) || Boolean(job && job.status !== "completed");
    get("resume-reset").disabled = accountInvalid || busy; get("refresh-reset").disabled = accountInvalid;
  }
  function options(select, values, placeholder) {
    select.replaceChildren(); const first = root.createElement("option"); first.value = ""; first.textContent = placeholder; select.append(first);
    for (const item of values) {const option = root.createElement("option"); option.value = item.id; option.textContent = item.label; select.append(option);}
    select.value = "";
  }
  function clearPreview() {revision++; previewData = null; job = null; stop(); get("reset-preview").hidden = true; get("reset-job").hidden = true; controls();}
  function renderJob(value) {
    job = value; get("reset-job").hidden = !value;
    if (!value) return;
    const count = Object.values(value.deletedCounts ?? {}).reduce((sum, n) => sum + n, 0);
    const total = Object.values(value.plannedCounts ?? {}).reduce((sum, n) => sum + n, 0);
    get("reset-progress").max = Math.max(total, 1); get("reset-progress").value = value.status === "completed" ? Math.max(total, 1) : count;
    get("reset-job-summary").textContent = `Reset ${value.resetId}\n${value.status} / ${value.stage}\n${count} of ${total} records processed${value.error ? "\n" + value.error : ""}`;
    const leaseExpired = !value.leaseUntil || new Date(value.leaseUntil).getTime() <= Date.now();
    get("resume-reset").hidden = requestPending || value.status !== "failed" && !(value.status === "running" && leaseExpired);
    if (value.status === "completed") {
      stop(); previewData = null; get("reset-preview").hidden = true;
      message("Topic reset completed. Student work and progression were removed, and subject scores were recalculated.");
    } else if (value.status === "failed") {stop(); message("Reset stopped: " + value.error + " Resume the reset to finish. Student practice maintenance remains active.", true);}
    else {stop(); timer = schedule(() => {timer = null; void refresh();}, 3000);}
    controls();
  }
  async function refresh() {
    if (!job || disposed || accountInvalid) return;
    const token = revision;
    try {const value = await status({studentId: job.studentId, resetId: job.resetId}); if (token === revision && !disposed) {
      if (value) renderJob(value);
      else if (requestPending) renderJob(job);
      else renderJob({...job, status: "failed", error: "The request has not been found yet. Resume to retry the same reset ID."});
    }}
    catch (error) {if (token === revision) {stop(); message(error.message, true);}}
  }
  async function showPreview() {
    if (busy || accountInvalid) return;
    const token = ++revision; busy = true; controls(); message("Preparing the topic reset preview…");
    try {
      const value = await preview(selection()); if (token !== revision || disposed) return;
      previewData = value; get("reset-preview").hidden = false;
      get("reset-summary").textContent = `${value.student.name} (${value.student.id})\n${value.syllabus.subject} / ${value.topic.name}\n${value.totalRecords} student records will be removed.`;
      get("reset-counts").replaceChildren();
      for (const [key, count] of Object.entries(value.counts)) {
        const row = root.createElement("tr"), name = root.createElement("td"), amount = root.createElement("td");
        name.textContent = labels[key] ?? key; amount.textContent = String(count); row.append(name, amount); get("reset-counts").append(row);
      }
      get("reset-warnings").textContent = [...value.warnings, ...(value.protectedEssayResults ? [`${value.protectedEssayResults} essay result(s) are retained because another topic references the question.`] : [])].join("\n");
      if (value.activeReset) {renderJob(value.activeReset); message("An existing reset must finish before starting another reset for this student.");}
      else message("Review the selected student and topic before removing their work.");
    } catch (error) {if (token === revision) message(error.message, true);}
    finally {if (token === revision) {busy = false; controls();}}
  }
  async function execute(resume = false) {
    if (busy || accountInvalid || resume && !job || !resume && (!previewData || previewData.activeReset
        || job && job.status !== "completed")) return;
    const input = resume ? {studentId: job.studentId, syllabusId: job.syllabusId, topicId: job.topicId, resetId: job.resetId}
      : {...selection(), resetId: newId()};
    const token = ++revision; busy = true; requestPending = true; controls();
    renderJob({...input, status: "running", stage: "planning", deletedCounts: {}, plannedCounts: {}});
    message("Removing student work for the selected topic…");
    try {const value = await request(input); if (token === revision && !disposed) renderJob(value);}
    catch (error) {requestPending = false; if (token === revision && !disposed) {message(error.message + " Refresh status or resume using the same reset ID.", true); await refresh();}}
    finally {requestPending = false; if (token === revision) {busy = false; controls();}}
  }
  student.addEventListener("change", clearPreview);
  syllabus.addEventListener("change", () => {clearPreview(); const selected = syllabuses.find(item => item.id === syllabus.value);
    options(topic, (selected?.topics ?? []).map(item => ({id: item.id, label: item.topicName})), "Select topic"); controls();});
  topic.addEventListener("change", clearPreview);
  get("preview-reset").addEventListener("click", () => {void showPreview();});
  get("execute-reset").addEventListener("click", () => {void execute();});
  get("resume-reset").addEventListener("click", () => {void execute(true);});
  get("refresh-reset").addEventListener("click", () => {void refresh();});
  const unsubscribe = subscribeAuth(user => {
    const identity = user ? JSON.stringify([user.uid, user.email, user.emailVerified]) : null;
    if (initialAccount === undefined && identity) {initialAccount = identity; return;}
    if (identity === initialAccount) return;
    accountInvalid = true; revision++; stop(); previewData = null; job = null;
    student.replaceChildren(); syllabus.replaceChildren(); topic.replaceChildren();
    get("reset-preview").hidden = true; get("reset-job").hidden = true;
    message("The signed-in account changed. Reload this admin page to continue.", true); controls();
  });
  const ready = (async () => {
    try {
      const [students, values] = await Promise.all([loadStudents(), loadSyllabuses()]); if (disposed || accountInvalid) return;
      syllabuses = values;
      options(student, students.map(item => ({id: item.id, label: `${item.name || item.username || item.id} (${item.id})`})), "Select student");
      options(syllabus, values.map(item => ({id: item.id, label: `${item.subject} / ${item.level} / ${item.year}`})), "Select syllabus");
      message("Select a student, syllabus and topic to preview their records."); controls();
    } catch (error) {message(error.message, true);}
  })();
  return {ready, showPreview, refresh, execute, dispose() {disposed = true; revision++; stop(); unsubscribe?.();}};
}
if (typeof document !== "undefined") mountTopicResetAdmin();
