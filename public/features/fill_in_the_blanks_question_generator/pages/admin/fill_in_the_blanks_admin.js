import * as questions from "../../fill_in_the_blanks_question_generator_module.js?v=20261105-chinese-count-v1";
import * as scoring from "../../../fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module.js?v=20261104-fill-preassessment-v3";
import {mountFillInTheBlanksPassage} from "../../components/passage_view.js?v=20261105-chinese-count-v1";
import {normaliseConfig, LEVELS, DIFFICULTIES, requiredAnswerLength, answerLengthUnit} from "../../domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";
import {onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";
import {isCurrentUserSiteAdmin} from "../../../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
export function mountFillInTheBlanksAdmin({root = document, api = questions, marks = scoring} = {}) {
  const byId = id => root.getElementById(id), status = byId("fill-status"), grades = new Map(), difficulties = new Map();
  let syllabuses = [], busy = false, dirty = false, loaded = false, view = null;
  function message(value, error = false) {status.textContent = value; status.classList.toggle("is-error", error);}
  function controls() {
    for (const element of root.querySelectorAll("#fill-admin-content button, #fill-admin-content input, #fill-admin-content select, #fill-admin-content textarea")) element.disabled = busy || !loaded;
    byId("fill-generate").disabled ||= dirty;
    byId("fill-history-count").disabled ||= byId("fill-history-mode").value === "all";
    byId("fill-demo-note").textContent = dirty ? "Save generation settings before generating a passage." : "Generation uses saved settings. No seed is required.";
  }
  function field(parent, labelText, kind = "textarea") {
    const label = root.createElement("label"), input = root.createElement(kind);
    input.id = "fill-setting-" + (grades.size * 3 + difficulties.size) + "-" + labelText.replace(/[^a-z0-9]/gi, "");
    label.htmlFor = input.id; label.textContent = labelText;
    if (kind === "textarea") input.rows = 3;
    parent.append(label, input); return input;
  }
  for (const level of LEVELS) for (let grade = 1; grade <= 6; grade++) {
    const detail = root.createElement("details"), title = root.createElement("summary"); title.textContent = level + " — Grade " + grade; detail.append(title);
    const count = field(detail, "Questions per passage", "input"); count.type = "number"; count.min = "1"; count.max = "100"; count.required = true;
    const picture = field(detail, "Include a supporting image", "input"); picture.type = "checkbox";
    const instructions = field(detail, "Grade instructions and passage length"); grades.set(level + ":" + grade, {count, picture, instructions});
    byId("fill-grade-settings").append(detail);
  }
  for (const difficulty of DIFFICULTIES) difficulties.set(difficulty, field(byId("fill-difficulty-settings"), difficulty));
  function clearPreview() {view?.dispose(); view = null; byId("fill-preview").hidden = true; controls();}
  function options(select, values, placeholder) {
    select.replaceChildren(); const empty = root.createElement("option"); empty.value = ""; empty.textContent = placeholder; select.append(empty);
    for (const [value, label] of values) {const option = root.createElement("option"); option.value = value; option.textContent = label; select.append(option);}
  }
  function selectedScope() {return {syllabusId: byId("fill-syllabus").value, topicId: byId("fill-topic").value,
    language: byId("fill-language").value, difficulty: byId("fill-difficulty").value};}
  byId("fill-syllabus").addEventListener("change", () => {
    const selected = syllabuses.find(item => item.id === byId("fill-syllabus").value);
    options(byId("fill-topic"), (selected?.topics ?? []).map(topic => [topic.id, topic.topicName]), "Choose a topic");
    options(byId("fill-language"), (selected?.languages ?? []).map(language => [language, language]), "Choose a language"); clearPreview();
  });
  for (const id of ["fill-topic", "fill-language", "fill-difficulty"]) byId(id).addEventListener("change", clearPreview);
  byId("fill-config-form").addEventListener("input", () => {dirty = true; controls();});
  async function operation(label, action) {
    if (busy) return; busy = true; controls(); message(label);
    try {await action();} catch (error) {message(error.message + (error.requestId ? "\nReference: " + error.requestId : ""), true);}
    finally {busy = false; controls();}
  }
  function preview(passage) {
    clearPreview();
    byId("fill-preview").hidden = false; byId("fill-summary").textContent = "Scenario summary: " + passage.summary;
    view = mountFillInTheBlanksPassage({root: byId("fill-passage-preview"), passage, readOnly: true, previewImage: passage.previewImage});
    const list = byId("fill-model-answers"); list.replaceChildren();
    for (const q of passage.questions) {
      const item = root.createElement("li"), count = requiredAnswerLength(q, passage.language), unit = answerLengthUnit(passage.language, q);
      const length = count === null ? "Character count unavailable" : count + " " + (count === 1 ? unit.slice(0, -1) : unit);
      item.textContent = (q.correctAnswer ?? "Model answer unavailable") + " (" + length + ")"; list.append(item);
    }
    byId("fill-image-prompt").value = passage.imagePrompt || (passage.settings?.imageEnabled ? "Image prompt unavailable; use the written passage." : "Images are disabled for this grade.");
    byId("fill-preview-image-status").textContent = passage.imageStatus === "generated" ? "Generated image preview"
      : passage.settings?.imageEnabled ? "The image could not be generated. The written question is available below." : "Images are disabled for this grade.";
    byId("fill-preview").scrollIntoView?.({behavior: "smooth", block: "start"});
  }
  byId("fill-config-form").addEventListener("submit", event => {event.preventDefault(); void operation("Saving generation settings…", async () => {
    const config = normaliseConfig({additionalLlmInstructions: byId("fill-common").value,
      gradeSettings: Object.fromEntries(LEVELS.map(level => [level, Object.fromEntries(Array.from({length: 6}, (_, index) => {
        const grade = index + 1, fields = grades.get(level + ":" + grade);
        return [grade, {questionsPerPassage: Number(fields.count.value), imageEnabled: fields.picture.checked, additionalLlmInstructions: fields.instructions.value}];
      }))])), difficultyInstructions: Object.fromEntries([...difficulties].map(([key, input]) => [key, input.value])),
      summaryHistory: {mode: byId("fill-history-mode").value, count: Number(byId("fill-history-count").value)}});
    await api.saveFillInTheBlanksQuestionGeneratorConfig(config); dirty = false; clearPreview(); message("Generation settings saved.");
  });});
  byId("fill-scoring-form").addEventListener("submit", event => {event.preventDefault(); void operation("Saving marking settings…", async () => {
    await marks.saveFillInTheBlanksScoringConfig({markingInstructions: byId("fill-marking").value}); message("Marking settings saved.");
  });});
  byId("fill-demo-form").addEventListener("submit", event => {event.preventDefault(); void operation("Generating passage and optional picture…", async () => {
    clearPreview(); preview(await api.generateFillInTheBlanksQuestion({...selectedScope(), save: false, previewOnly: true}));
    message("Preview ready. The question and image have not been saved.");
  });});
  async function load() {await operation("Loading settings…", async () => {
    loaded = false; const [configuration, marking, choices] = await Promise.all([api.getFillInTheBlanksQuestionGeneratorConfig(), marks.getFillInTheBlanksScoringConfig(), api.loadFillInTheBlanksGeneratorOptions()]);
    const config = normaliseConfig(configuration); byId("fill-common").value = config.additionalLlmInstructions;
    for (const [key, fields] of grades) {const [level, grade] = key.split(":"), value = config.gradeSettings[level][grade]; fields.count.value = value.questionsPerPassage; fields.picture.checked = value.imageEnabled; fields.instructions.value = value.additionalLlmInstructions;}
    for (const [key, input] of difficulties) input.value = config.difficultyInstructions[key];
    byId("fill-history-mode").value = config.summaryHistory.mode; byId("fill-history-count").value = config.summaryHistory.count;
    byId("fill-marking").value = marking.markingInstructions; syllabuses = choices.syllabuses;
    options(byId("fill-syllabus"), syllabuses.map(item => [item.id, item.subject + " — " + item.level + " grade " + item.year]), "Choose a syllabus");
    loaded = true; dirty = false; clearPreview(); message("Settings loaded.");
  });}
  byId("fill-reload").addEventListener("click", () => {void load();}); controls();
  return {load, clearPreview};
}
if (typeof document !== "undefined" && document.getElementById("fill-admin-content")) {
  let mounted = null;
  onFirebaseAuthStateChanged(async user => {
    mounted?.clearPreview();
    const status = document.getElementById("fill-status");
    try {
      if (!user) {document.getElementById("fill-admin-content").hidden = true; status.textContent = "Sign in with a verified administrator account."; return;}
      const access = await isCurrentUserSiteAdmin();
      if (!access.isAdmin) throw new Error("A verified site administrator account is required.");
      document.getElementById("fill-admin-content").hidden = false;
      mounted ??= mountFillInTheBlanksAdmin(); await mounted.load();
    } catch (error) {document.getElementById("fill-admin-content").hidden = true; status.textContent = error.message; status.classList.add("is-error");}
  });
}
