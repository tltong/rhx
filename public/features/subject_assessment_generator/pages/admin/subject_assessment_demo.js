import {mountFillInTheBlanksPassage} from "../../../fill_in_the_blanks_question_generator/components/passage_view.js?v=20261105-chinese-count-v1";
import {resolveStudentCurrentGrade} from "../../../student/domain/student_summary.js";
import {studentLevels} from "../../../../config/firebase/student_schema.js";

async function defaultPreview(input, options) {
  const {previewSubjectAssessment} = await import("../../subject_assessment_generator_module.js?v=20261108-subject-assessment-theme-seed-v1");
  return previewSubjectAssessment(input, options);
}

async function defaultLoadStudents() {
  const {listStudents} = await import("../../../student/student_module.js?v=20261104-fill-preassessment-v3");
  return listStudents();
}

export function mountSubjectAssessmentDemo({root = document, preview = defaultPreview, loadStudents = defaultLoadStudents,
  now = () => new Date(), onBusyChange = () => {}} = {}) {
  const byId = id => root.querySelector("#" + id), doc = root.ownerDocument || root;
  const level = byId("demo-student-level"), grade = byId("demo-student-grade"), student = byId("demo-student");
  const studentStatus = byId("demo-student-status"), reloadStudents = byId("reload-demo-students");
  const button = byId("generate-demo"), clear = byId("clear-demo");
  const status = byId("demo-status"), help = byId("demo-help"), progress = byId("demo-progress");
  const result = byId("demo-result"), items = byId("demo-items"), summary = byId("demo-summary");
  let context = {loaded: false, busy: false, dirty: false, scope: null, configurationVersion: 0};
  let running = false, requestVersion = 0, signature = "", disposers = [];
  let students = [], loadingStudents = false, studentsLoaded = false;
  function element(tag, text, className) {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; return node;
  }
  function message(text, error = false) {status.textContent = text; status.hidden = !text; status.classList.toggle("is-error", error);}
  function options(select, values, placeholder) {
    const first = element("option", placeholder); first.value = "";
    select.replaceChildren(first);
    for (const [value, label] of values) {const option = element("option", label); option.value = String(value); select.append(option);}
    select.value = "";
  }
  function selectedStudent() {
    return students.find(item => item.id === student.value && item.level === level.value && item.grade === Number(grade.value));
  }
  function renderStudents() {
    const matches = students.filter(item => item.level === level.value && item.grade === Number(grade.value))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}) || a.id.localeCompare(b.id));
    const counts = new Map();
    for (const item of matches) {const key = item.name.normalize("NFKC").toLowerCase(); counts.set(key, (counts.get(key) || 0) + 1);}
    options(student, matches.map(item => [item.id, counts.get(item.name.normalize("NFKC").toLowerCase()) > 1
      ? `${item.name} (${item.username || item.id})` : item.name]),
    !grade.value ? "Select a grade first" : matches.length ? "Select student name" : "No students in this grade");
  }
  function renderGrades() {
    const grades = [...new Set(students.filter(item => item.level === level.value).map(item => item.grade))].sort((a, b) => a - b);
    options(grade, grades.map(value => [value, `Grade ${value}`]), !level.value ? "Select a level first" : grades.length ? "Select grade" : "No grades available");
    renderStudents();
  }
  async function loadStudentChoices() {
    if (running || loadingStudents) return;
    loadingStudents = true; studentsLoaded = false; students = [];
    requestVersion++; clearPreview(); message("");
    options(level, [], "Loading students…"); renderGrades(); controls();
    studentStatus.textContent = "Loading students…"; studentStatus.classList.remove("is-error");
    try {
      const values = await loadStudents();
      if (!Array.isArray(values)) throw new Error("Could not load the student list.");
      const currentDate = now();
      let unavailable = 0;
      students = values.flatMap(item => {
        try {
          const currentGrade = resolveStudentCurrentGrade(item, () => currentDate);
          const currentLevel = String(item.level || "").trim().toLowerCase();
          if (typeof item.id !== "string" || !item.id.trim() || !Object.values(studentLevels).includes(currentLevel)
              || currentGrade < 1 || currentGrade > 6) throw new Error("Invalid student academic details.");
          const name = [item.name, item.username, item.id].find(value => typeof value === "string" && value.trim()).trim();
          return [{id: item.id, name, username: String(item.username || "").trim(), level: currentLevel, grade: currentGrade}];
        } catch {unavailable++; return [];}
      });
      const levels = Object.values(studentLevels).filter(value => students.some(item => item.level === value));
      options(level, levels.map(value => [value, value[0].toUpperCase() + value.slice(1)]), levels.length ? "Select level" : "No students available");
      renderGrades(); studentsLoaded = true;
      studentStatus.textContent = students.length ? `${students.length} students available. Choose a level, current grade, and student name.` : "No students with a valid current level and grade are available.";
      if (unavailable) studentStatus.textContent += " Students with incomplete or out-of-range academic details are unavailable.";
    } catch (error) {
      options(level, [], "Students unavailable"); renderGrades();
      studentStatus.textContent = (error.message || "Could not load students.") + " Use Reload Students to retry.";
      studentStatus.classList.add("is-error");
    } finally {loadingStudents = false; controls();}
  }
  function controls() {
    const unavailable = running || context.busy || loadingStudents || !studentsLoaded;
    level.disabled = unavailable || !students.length;
    grade.disabled = unavailable || !level.value || grade.options.length <= 1;
    student.disabled = unavailable || !grade.value || student.options.length <= 1;
    reloadStudents.disabled = running || context.busy || loadingStudents;
    button.disabled = unavailable || !context.loaded || context.dirty || !context.configurationVersion || !selectedStudent();
    clear.disabled = running || context.busy;
    button.textContent = running ? "Generating Demo…" : "Generate Demo";
    help.textContent = !context.loaded || !context.configurationVersion ? "Select a subject and language with a saved configuration first."
      : context.dirty ? "Save your configuration changes before generating a demo."
        : "Choose the student's level, current grade, and name below. This demo checks their history and uses the saved configuration. Nothing is saved.";
    progress.hidden = !running;
  }
  function clearPreview() {
    disposers.forEach(dispose => dispose()); disposers = [];
    items.replaceChildren(); summary.textContent = ""; result.hidden = true;
  }
  function image(content, container) {
    const picture = content.previewImage;
    const url = picture?.mimeType === "image/png" && typeof picture.base64 === "string"
      ? "data:image/png;base64," + picture.base64 : content.support?.picture?.url;
    if (url) {const img = element("img"); img.src = url; img.alt = "Supporting illustration"; img.className = "demo-image"; container.append(img);}
  }
  function render(assessment) {
    clearPreview();
    summary.textContent = `${assessment.items.length} items · ${assessment.reusedCount} reused · ${assessment.generatedCount} generated · ${assessment.questionCount} questions (including blanks) · ${assessment.passageCount} passages`;
    for (const item of assessment.items) {
      const card = element("section", undefined, "topic-card demo-item"), content = item.contentSnapshot;
      card.append(element("h3", `${item.position}. ${item.topicName}`), element("p", `${item.questionType === "normal" ? "MCQ" : item.questionType === "essay" ? "Essay" : "Fill in the blanks"} · ${item.difficulty} · ${item.source}`, "help-text"));
      if (item.questionType === "fillInTheBlanks") {
        const passageRoot = element("div"); card.append(passageRoot);
        const view = mountFillInTheBlanksPassage({root: passageRoot, passage: content, previewImage: content.previewImage, readOnly: true});
        disposers.push(() => view.dispose());
      } else {
        image(content, card); card.append(element("p", content.questionText, "demo-question"));
        if (content.svg) {
          const url = URL.createObjectURL(new Blob([content.svg], {type: "image/svg+xml"}));
          const diagram = element("img"); diagram.src = url; diagram.alt = "Question diagram"; diagram.className = "demo-image";
          card.append(diagram); disposers.push(() => URL.revokeObjectURL(url));
        }
        if (item.questionType === "normal") {
          const options = element("ol"); options.type = "a";
          for (const key of ["a", "b", "c", "d"]) options.append(element("li", content.options[key]));
          card.append(options);
        } else {
          if (content.wordCountRequirement?.minWords) card.append(element("p", `Minimum ${content.wordCountRequirement.minWords} words.`, "help-text"));
          if (content.support?.helpingWords?.length) card.append(element("p", "Helping suggestions: " + content.support.helpingWords.join(", ")));
        }
      }
      if (item.marking?.correctAnswer || item.marking?.answers) {
        const details = element("details"); details.append(element("summary", "Model answers (admin preview)"));
        if (item.marking.correctAnswer) details.append(element("p", "Answer: " + item.marking.correctAnswer.toUpperCase()), element("p", item.marking.explanation || ""));
        else {
          const list = element("ol");
          for (const question of content.questions) list.append(element("li", item.marking.answers[question.questionId]));
          details.append(list);
        }
        card.append(details);
      }
      items.append(card);
    }
    result.hidden = false;
  }
  button.addEventListener("click", async () => {
    if (button.disabled || running) return;
    const selection = selectedStudent();
    if (!selection) {controls(); message("Choose a level, grade, and student name before generating.", true); return;}
    const current = ++requestVersion;
    const input = {...context.scope, studentId: selection.id, expectedConfigurationVersion: context.configurationVersion};
    running = true; clearPreview(); controls(); onBusyChange(true); message("Checking student history and preparing the demo…");
    try {
      const assessment = await preview(input, {onProgress(value) {
        if (current !== requestVersion) return;
        progress.max = value.total || 1; progress.value = value.prepared;
        message(`Preparing ${value.prepared} of ${value.total} items · ${value.reused} reused · ${value.generated} generated`);
      }});
      if (current !== requestVersion) return;
      if (assessment.studentId !== input.studentId || assessment.syllabusId !== input.syllabusId || assessment.language !== input.language) throw new Error("The demo does not match the selected student and subject.");
      render(assessment); message("Demo ready. No assessment, usage history, or newly generated content has been saved.");
    } catch (error) {if (current === requestVersion) message(error.message || "Could not generate the demo. Try again.", true);}
    finally {running = false; onBusyChange(false); controls();}
  });
  function studentSelectionChanged() {requestVersion++; clearPreview(); message(""); controls();}
  level.addEventListener("change", () => {renderGrades(); studentSelectionChanged();});
  grade.addEventListener("change", () => {renderStudents(); studentSelectionChanged();});
  student.addEventListener("change", studentSelectionChanged);
  reloadStudents.addEventListener("click", () => {void loadStudentChoices();});
  clear.addEventListener("click", () => {requestVersion++; clearPreview(); message("");});
  controls();
  return {ready: loadStudentChoices(), setContext(value) {
    context = {...context, ...value};
    const next = JSON.stringify([context.scope, context.configurationVersion]);
    if (next !== signature || context.dirty) {signature = next; requestVersion++; clearPreview(); if (!running) message("");}
    controls();
  }};
}
