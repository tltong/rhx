import {listSyllabuses} from "../../../syllabus/syllabus_module.js?v=20261105-topic-framework-v1";
import {getSubjectAssessmentConfigOptions, saveSubjectAssessmentConfig, getSubjectAssessmentSettings, saveSubjectAssessmentSettings} from "../../subject_assessment_config_module.js?v=20261109-assessment-repeat-policy-v1";
import {requireTopicAllocation, requireSettingsInput} from "../../domain/subject_assessment_config.js?v=20261109-assessment-repeat-policy-v1";
import {mountSubjectAssessmentDemo} from "../../../subject_assessment_generator/pages/admin/subject_assessment_demo.js?v=20261108-subject-assessment-theme-seed-v1";

const FORMAT_LABELS = {normal: "MCQ", essay: "Essay", fillInTheBlanks: "Fill in the blanks"};
const FIELDS = ["totalCount", "easy", "medium", "hard"];

export function mountSubjectAssessmentSettingsAdmin({root = document, get = getSubjectAssessmentSettings, save = saveSubjectAssessmentSettings} = {}) {
  const form = root.querySelector("#subject-assessment-settings-form");
  if (!form) return {ready: Promise.resolve()};
  const mode = root.querySelector("#assessment-repeat-mode"), input = root.querySelector("#assessment-interval-days"), status = root.querySelector("#global-settings-status");
  const intervalField = root.querySelector("#assessment-interval-field"), noRepeatHelp = root.querySelector("#global-no-repeat-help");
  const updated = root.querySelector("#global-settings-updated-at"), saveButton = root.querySelector("#save-global-settings"), reload = root.querySelector("#reload-global-settings");
  let busy = false, loaded = false, dirty = false, expectedVersion = 0;
  function message(value, error = false) {status.textContent = value; status.classList.toggle("is-error", error);}
  function controls() {
    mode.disabled = busy || !loaded;
    input.disabled = busy || !loaded || mode.value !== "interval"; input.required = mode.value === "interval";
    intervalField.hidden = mode.value !== "interval"; noRepeatHelp.hidden = mode.value !== "none";
    saveButton.disabled = busy || !loaded; reload.disabled = busy;
    saveButton.textContent = busy ? "Please wait…" : "Save Global Repeat Policy"; form.setAttribute("aria-busy", String(busy));
  }
  function showSaved(settings) {
    expectedVersion = settings?.version || 0; mode.value = settings ? settings.repeatMode ?? "interval" : "";
    input.value = settings?.intervalDays === null || settings?.intervalDays === undefined ? "" : String(settings.intervalDays);
    mode.setAttribute("aria-invalid", "false"); input.setAttribute("aria-invalid", "false");
    const date = settings?.updatedAt ? new Date(settings.updatedAt) : null;
    updated.textContent = settings ? `Version ${settings.version}${date && Number.isFinite(+date) ? " · Last saved " + date.toLocaleString() : ""}` : "Not configured";
    dirty = false;
  }
  async function load() {
    if (busy) return;
    busy = true; loaded = false; controls(); message("Loading global assessment policy…");
    try {const settings = await get(); showSaved(settings); loaded = true; message(settings ? "Global assessment policy loaded." : "Choose a repeat policy for all subjects.");}
    catch (error) {message(error.message || "Could not load the global policy. Use Reload Global Repeat Policy to retry.", true);}
    finally {busy = false; controls();}
  }
  input.addEventListener("input", () => {dirty = true; input.setAttribute("aria-invalid", "false"); message("You have unsaved global interval changes.");});
  mode.addEventListener("change", () => {dirty = true; mode.setAttribute("aria-invalid", "false"); controls(); message("You have unsaved global repeat policy changes.");});
  reload.addEventListener("click", () => {void load();});
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !loaded) return;
    let settings;
    try {settings = requireSettingsInput({repeatMode: mode.value, intervalDays: mode.value === "none" ? null : input.valueAsNumber, expectedVersion});}
    catch (error) {const invalid = ["interval", "none"].includes(mode.value) ? input : mode; invalid.setAttribute("aria-invalid", "true"); message(error.message, true); invalid.focus(); return;}
    busy = true; controls(); message("Saving global assessment policy…");
    try {showSaved(await save(settings)); message("Global assessment policy saved.");}
    catch (error) {message(error.message || "Could not save the global policy. Your changes are retained.", true);}
    finally {busy = false; controls();}
  });
  (root.ownerDocument || root).defaultView?.addEventListener("beforeunload", event => {if (dirty) {event.preventDefault(); event.returnValue = "";}});
  return {ready: load()};
}

export function mountSubjectAssessmentConfigAdmin({root = document, list = listSyllabuses,
  getOptions = getSubjectAssessmentConfigOptions, save = saveSubjectAssessmentConfig,
  getSettings = getSubjectAssessmentSettings, saveSettings = saveSubjectAssessmentSettings} = {}) {
  const globalSettings = mountSubjectAssessmentSettingsAdmin({root, get: getSettings, save: saveSettings});
  const form = root.querySelector("#subject-assessment-config-form");
  const syllabusSelect = root.querySelector("#syllabus-select");
  const languageSelect = root.querySelector("#language-select");
  const status = root.querySelector("#config-status");
  const panel = root.querySelector("#topics-panel");
  const container = root.querySelector("#topic-allocations");
  const summary = root.querySelector("#allocation-summary");
  const updated = root.querySelector("#updated-at");
  const notice = root.querySelector("#configuration-notice");
  const saveButton = root.querySelector("#save-config");
  const reloadButton = root.querySelector("#reload-config");
  const retryButton = root.querySelector("#retry-syllabuses");
  const doc = root.ownerDocument || root;
  const drafts = new Map();
  let syllabuses = [], rows = [], currentOptions = [], busy = false, loaded = false, dirty = false;
  let currentScope = null, expectedVersion = 0, loadVersion = 0, demo = null;

  function element(tag, text, className) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", error);
  }

  function scopeKey(scope) {return JSON.stringify([scope.syllabusId, scope.language.toLowerCase()]);}

  function allocation(row) {
    return {topicId: row.option.topicId, questionType: row.option.questionType,
      totalCount: row.inputs.totalCount.valueAsNumber,
      difficultyCounts: Object.fromEntries(["easy", "medium", "hard"].map(key => [key, row.inputs[key].valueAsNumber]))};
  }

  function rememberDraft() {
    if (dirty && currentScope && loaded) {
      drafts.set(scopeKey(currentScope), {version: expectedVersion, topics: rows.filter(row => row.checkbox.checked).map(allocation)});
    }
  }

  function setBusy(value) {
    busy = value;
    syllabusSelect.disabled = busy || !syllabuses.length;
    languageSelect.disabled = busy || !syllabusSelect.value;
    saveButton.disabled = busy || !loaded;
    reloadButton.disabled = busy || !syllabusSelect.value || !languageSelect.value;
    retryButton.disabled = busy;
    for (const row of rows) {
      row.checkbox.disabled = busy;
      for (const input of Object.values(row.inputs)) input.disabled = busy || !row.checkbox.checked || !row.option.questionType;
    }
    form.setAttribute("aria-busy", String(busy));
    demo?.setContext({loaded, busy, dirty, scope: currentScope, configurationVersion: expectedVersion});
  }

  function validateRow(row) {
    let message = "";
    if (row.checkbox.checked) {
      try {
        if (row.option.error || !row.option.questionType) throw new Error(row.option.error || "The topic format is unavailable.");
        requireTopicAllocation(allocation(row));
      } catch (error) {message = error.message;}
    }
    row.error.textContent = message || row.option.error || "";
    row.error.hidden = !row.error.textContent;
    for (const input of Object.values(row.inputs)) input.setAttribute("aria-invalid", String(Boolean(message)));
    row.checkbox.setAttribute("aria-invalid", String(Boolean(message && !row.option.questionType)));
    return !message;
  }

  function updateSummary() {
    const selected = rows.filter(row => row.checkbox.checked);
    let questions = 0, passages = 0;
    for (const row of selected) {
      const count = row.inputs.totalCount.valueAsNumber;
      if (!Number.isSafeInteger(count) || count < 1) continue;
      if (row.option.questionType === "fillInTheBlanks") passages += count;
      else if (row.option.questionType) questions += count;
    }
    summary.textContent = `${selected.length} topic${selected.length === 1 ? "" : "s"} selected · ${questions} questions · ${passages} passages`;
  }

  function renderTopics(options, configuration) {
    container.replaceChildren();
    const saved = new Map((configuration?.topics || []).map(topic => [topic.topicId, topic]));
    const allOptions = [...options];
    const ids = new Set(options.map(topic => topic.topicId));
    for (const topic of saved.values()) {
      if (!ids.has(topic.topicId)) allOptions.push({topicId: topic.topicId, topicName: topic.topicId, questionType: null,
        error: "This topic no longer belongs to the syllabus. Deselect it before saving."});
    }
    let formatChanged = false;
    rows = allOptions.map((option, index) => {
      const previous = saved.get(option.topicId);
      if (previous && previous.questionType !== option.questionType) formatChanged = true;
      const card = element("section", undefined, "topic-card");
      card.dataset.topicId = option.topicId;
      const heading = element("div", undefined, "topic-heading");
      const choice = element("label", undefined, "topic-choice");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(previous);
      checkbox.dataset.selectTopic = option.topicId;
      choice.append(checkbox, element("span", option.topicName));
      heading.append(choice, element("span", FORMAT_LABELS[option.questionType] || "Format unavailable", "format-label"));
      const fields = element("div", undefined, "count-fields");
      const inputs = {};
      const unit = option.questionType === "fillInTheBlanks" ? "passages" : "questions";
      for (const key of FIELDS) {
        const label = element("label", key === "totalCount" ? `Total ${unit}` : `${key[0].toUpperCase() + key.slice(1)} ${unit}`);
        const input = element("input");
        input.type = "number";
        input.min = key === "totalCount" ? "1" : "0";
        input.step = "1";
        input.required = true;
        input.inputMode = "numeric";
        input.id = `topic-${index}-${key}`;
        input.dataset.count = key;
        input.value = String((key === "totalCount" ? previous?.totalCount : previous?.difficultyCounts?.[key]) ?? 0);
        input.setAttribute("aria-describedby", `topic-${index}-error`);
        label.htmlFor = input.id;
        label.append(input);
        fields.append(label);
        inputs[key] = input;
      }
      const error = element("p", "", "topic-error");
      error.id = `topic-${index}-error`;
      error.hidden = true;
      checkbox.setAttribute("aria-describedby", error.id);
      card.append(heading, fields, error);
      container.append(card);
      const row = {option, checkbox, inputs, error};
      validateRow(row);
      return row;
    });
    if (!allOptions.length) container.append(element("p", "This syllabus has no topics. Add topics in Syllabus Admin first.", "help-text"));
    notice.textContent = formatChanged ? "A saved topic's format changed or is unavailable. Review its counts, or deselect it, before saving." : "";
    notice.hidden = !notice.textContent;
    updateSummary();
  }

  function renderSavedAt(configuration) {
    const date = configuration?.updatedAt?.toDate?.() ?? configuration?.updatedAt;
    updated.textContent = configuration ? `Version ${configuration.version} · Last saved ${new Date(date).toLocaleString()}` : "Never saved";
  }

  async function loadConfiguration({discardDraft = false} = {}) {
    rememberDraft();
    const requestVersion = ++loadVersion;
    const scope = {syllabusId: syllabusSelect.value, language: languageSelect.value};
    loaded = false;
    dirty = false;
    currentScope = null;
    panel.hidden = true;
    if (!scope.syllabusId || !scope.language) {setBusy(false); setStatus("Select a subject and language."); return;}
    if (discardDraft) drafts.delete(scopeKey(scope));
    setBusy(true);
    setStatus("Loading subject assessment configuration…");
    try {
      const options = await getOptions(scope);
      if (requestVersion !== loadVersion) return;
      const draft = drafts.get(scopeKey(scope));
      currentScope = {syllabusId: options.syllabusId, language: options.language};
      currentOptions = options.topics;
      expectedVersion = draft?.version ?? options.configuration?.version ?? 0;
      renderTopics(options.topics, draft || options.configuration);
      renderSavedAt(options.configuration);
      loaded = true;
      dirty = Boolean(draft);
      panel.hidden = false;
      setStatus(draft ? "Your unsaved changes for this subject and language have been restored."
        : options.configuration ? "Subject assessment configuration loaded." : "No configuration saved yet. Select topics and enter their counts.");
    } catch (error) {
      if (requestVersion === loadVersion) setStatus(error.message || "Could not load the configuration. Use Reload Saved to retry.", true);
    } finally {
      if (requestVersion === loadVersion) setBusy(false);
    }
  }

  function setLanguages() {
    languageSelect.replaceChildren(new Option("Select language", ""));
    const selected = syllabuses.find(syllabus => syllabus.id === syllabusSelect.value);
    for (const language of selected?.languages || []) languageSelect.append(new Option(language, language));
    if (selected?.languages?.length === 1) languageSelect.value = selected.languages[0];
  }

  async function loadSyllabuses() {
    setBusy(true);
    retryButton.hidden = true;
    setStatus("Loading syllabuses…");
    try {
      syllabuses = await list();
      syllabusSelect.replaceChildren(new Option(syllabuses.length ? "Select subject / syllabus" : "No syllabuses available", ""));
      for (const syllabus of syllabuses) {
        const label = [syllabus.country, syllabus.level, `Year ${syllabus.year}`, syllabus.subject, syllabus.active ? "Active" : "Inactive"].join(" / ");
        syllabusSelect.append(new Option(label, syllabus.id));
      }
      setStatus(syllabuses.length ? "Select a subject and language to configure its assessment." : "Create a syllabus in Syllabus Admin first.");
    } catch (error) {
      retryButton.hidden = false;
      setStatus(error.message || "Could not load syllabuses.", true);
    } finally {setBusy(false);}
  }

  container.addEventListener("input", () => {
    if (busy || !loaded) return;
    for (const row of rows) validateRow(row);
    dirty = true;
    setBusy(false);
    updateSummary();
    setStatus("You have unsaved changes.");
  });
  syllabusSelect.addEventListener("change", () => {setLanguages(); void loadConfiguration();});
  languageSelect.addEventListener("change", () => {void loadConfiguration();});
  reloadButton.addEventListener("click", () => {void loadConfiguration({discardDraft: true});});
  retryButton.addEventListener("click", () => {void loadSyllabuses();});
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !loaded) return;
    const valid = rows.map(validateRow).every(Boolean);
    const selected = rows.filter(row => row.checkbox.checked);
    if (!valid || !selected.length) {
      setStatus(!selected.length ? "Select at least one topic." : "Correct the highlighted topic counts before saving.", true);
      container.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const input = {...currentScope, expectedVersion, topics: selected.map(allocation)};
    setBusy(true);
    saveButton.textContent = "Saving…";
    setStatus("Saving subject assessment configuration…");
    try {
      const saved = await save(input);
      expectedVersion = saved.version;
      dirty = false;
      drafts.delete(scopeKey(currentScope));
      renderTopics(currentOptions, saved);
      renderSavedAt(saved);
      notice.hidden = true;
      setStatus("Subject assessment configuration saved.");
    } catch (error) {setStatus(error.message || "Could not save the configuration. Your edits are retained.", true);}
    finally {saveButton.textContent = "Save Configuration"; setBusy(false);}
  });
  doc.defaultView?.addEventListener("beforeunload", event => {
    if (dirty || drafts.size) {event.preventDefault(); event.returnValue = "";}
  });
  if (root.querySelector("#subject-assessment-demo")) demo = mountSubjectAssessmentDemo({root, onBusyChange: value => setBusy(value)});
  return {ready: Promise.all([globalSettings.ready, loadSyllabuses()])};
}

if (typeof document !== "undefined" && document.querySelector("#subject-assessment-config-form")) mountSubjectAssessmentConfigAdmin();
