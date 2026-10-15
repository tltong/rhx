import {
  DEFAULT_TUTOR_MINI_QUESTION_COUNT, getTutorConfig, saveTutorConfig,
} from "../../tutor_module.js?v=20261014-tutor-config-v1";
import {
  listSyllabusScopeLanguages,
} from "../../../syllabusscope/syllabusscope_module.js?v=20261014-scope-languages-v1";

export function mountTutorAdmin({
  root = document, getConfig = getTutorConfig, saveConfig = saveTutorConfig,
  listLanguages = listSyllabusScopeLanguages,
} = {}) {
  const byId = id => root.getElementById(id);
  const form = byId("tutor-form");
  const status = byId("tutor-status");
  const updatedAt = byId("tutor-updated-at");
  const countField = {input: byId("mini-question-count"), error: byId("mini-question-count-error")};
  const instructions = byId("prompt-instructions");
  const languageContainer = byId("tutor-language-fields");
  const languageStatus = byId("tutor-language-status");
  const saveButton = byId("save-tutor-config");
  const retryButton = byId("retry-tutor-load");
  const reloadButton = byId("reload-tutor-languages");
  let messageFields = [];
  let busy = false;
  let loaded = false;
  let languagesLoaded = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }

  function updateControls() {
    countField.input.disabled = busy || !loaded;
    instructions.disabled = busy || !loaded;
    for (const field of messageFields) field.input.disabled = busy || !loaded;
    saveButton.disabled = busy || !loaded || !languagesLoaded || !messageFields.length;
    retryButton.disabled = busy;
    reloadButton.disabled = busy || !loaded;
    form.setAttribute("aria-busy", String(busy));
  }

  function showError(field, message = "") {
    field.input.setCustomValidity(message);
    field.input.setAttribute("aria-invalid", String(Boolean(message)));
    field.error.textContent = message;
    field.error.hidden = !message;
  }

  function validateCount() {
    const value = countField.input.valueAsNumber;
    const valid = Number.isSafeInteger(value) && value > 0;
    showError(countField, valid ? "" : "Enter a whole number of mini questions greater than zero.");
    return valid;
  }

  function markEdited() {
    if (!busy && loaded && languagesLoaded) setStatus("You have unsaved changes.");
  }

  function feedbackValues() {
    return Object.fromEntries(["correctAnswerMessage", "incorrectAnswerMessage"].map(key => [
      key, Object.fromEntries(messageFields.filter(field => field.key === key)
        .map(field => [field.language, field.input.value])),
    ]));
  }

  function renderLanguages(availableLanguages, values) {
    if (!Array.isArray(availableLanguages)
        || availableLanguages.some(language => typeof language !== "string" || !language.trim())) {
      throw new Error("Could not load valid languages from Syllabus Scope.");
    }
    const available = new Set(availableLanguages);
    // Keep saved translations and unsaved edits even when a language is removed from a scope.
    const languages = [...new Set([
      ...availableLanguages, ...Object.keys(values.correctAnswerMessage || {}),
      ...Object.keys(values.incorrectAnswerMessage || {}),
    ])].sort((a, b) => a.localeCompare(b));
    const cards = [];
    const nextFields = [];
    for (const [index, language] of languages.entries()) {
      const card = root.createElement("fieldset");
      card.className = "language-card";
      const legend = root.createElement("legend");
      legend.textContent = language;
      card.append(legend);
      if (!available.has(language)) {
        const note = root.createElement("p");
        note.className = "language-note";
        note.textContent = "Previously configured language; currently absent from Syllabus Scope.";
        card.append(note);
      }
      const grid = root.createElement("div");
      grid.className = "message-grid";
      for (const [key, labelText] of [
        ["correctAnswerMessage", "Correct answer feedback"],
        ["incorrectAnswerMessage", "Incorrect answer feedback"],
      ]) {
        const control = root.createElement("div");
        control.className = "message-control";
        const label = root.createElement("label");
        const input = root.createElement("textarea");
        input.id = "tutor-message-" + index + "-" + key;
        input.name = key + "." + language;
        input.rows = 3;
        input.required = true;
        input.disabled = true;
        input.dir = "auto";
        input.value = Object.hasOwn(values[key] || {}, language) ? values[key][language] : "";
        const error = root.createElement("span");
        error.id = input.id + "-error";
        error.className = "field-error";
        error.hidden = true;
        input.setAttribute("aria-describedby", error.id);
        label.htmlFor = input.id;
        label.textContent = labelText;
        const field = {key, language, input, error};
        input.addEventListener("input", () => {
          showError(field);
          markEdited();
        });
        nextFields.push(field);
        control.append(label, input, error);
        grid.append(control);
      }
      card.append(grid);
      cards.push(card);
    }
    languageContainer.replaceChildren(...cards);
    messageFields = nextFields;
    languageStatus.textContent = languages.length
      ? "Enter correct-answer and incorrect-answer feedback for each language."
      : "No languages are configured. Add languages in Syllabus Scope, then reload them here.";
  }

  function renderConfig(config) {
    countField.input.value = String(config?.miniQuestionCount ?? DEFAULT_TUTOR_MINI_QUESTION_COUNT);
    instructions.value = config?.promptInstructions ?? "";
    showError(countField);
    updatedAt.textContent = config ? "Last saved: " + config.updatedAt.toLocaleString() : "Never saved";
    for (const field of messageFields) {
      field.input.value = config?.[field.key]?.[field.language] ?? "";
      showError(field);
    }
  }

  async function loadPage() {
    if (busy) return;
    busy = true;
    loaded = false;
    languagesLoaded = false;
    retryButton.hidden = true;
    updateControls();
    setStatus("Loading tutor configuration and available languages...");
    try {
      const results = await Promise.allSettled([getConfig(), listLanguages()]);
      const failures = results.filter(result => result.status === "rejected");
      if (failures.length) throw new Error(failures.map(result => result.reason?.message
        || "Could not load tutor configuration or languages.").join(" "));
      const config = results[0].value;
      renderLanguages(results[1].value, config || {});
      renderConfig(config);
      loaded = true;
      languagesLoaded = true;
      setStatus(config ? "Tutor configuration loaded."
        : "The default count is 3. Enter feedback messages and save to configure the tutor.");
    } catch (error) {
      retryButton.hidden = false;
      setStatus(error.message || "Could not load tutor configuration.", true);
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function reloadLanguages() {
    if (busy || !loaded) return;
    busy = true;
    languagesLoaded = false;
    updateControls();
    setStatus("Loading available languages...");
    try {
      renderLanguages(await listLanguages(), feedbackValues());
      languagesLoaded = true;
      setStatus("Languages refreshed. Your edits have been preserved.");
    } catch (error) {
      setStatus(error.message || "Could not reload languages. Try Reload Languages again.", true);
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function saveConfiguration(event) {
    event.preventDefault();
    if (busy || !loaded || !languagesLoaded || !messageFields.length) return;
    let firstInvalid = validateCount() ? null : countField.input;
    for (const field of messageFields) {
      const valid = Boolean(field.input.value.trim());
      showError(field, valid ? "" : "Enter a feedback message in " + field.language + ".");
      if (!valid) firstInvalid ||= field.input;
    }
    if (firstInvalid) {
      setStatus("Complete the highlighted settings before saving.", true);
      firstInvalid.focus();
      form.reportValidity();
      return;
    }
    const input = {
      miniQuestionCount: countField.input.valueAsNumber,
      promptInstructions: instructions.value.trim(),
      ...feedbackValues(),
    };
    busy = true;
    updateControls();
    saveButton.textContent = "Saving...";
    setStatus("Saving tutor configuration...");
    try {
      renderConfig(await saveConfig(input));
      setStatus("Tutor configuration saved.");
    } catch (error) {
      setStatus(error.message || "Could not save tutor configuration. Try saving again.", true);
    } finally {
      busy = false;
      saveButton.textContent = "Save Configuration";
      updateControls();
    }
  }

  countField.input.value = String(DEFAULT_TUTOR_MINI_QUESTION_COUNT);
  countField.input.addEventListener("input", () => {validateCount(); markEdited();});
  instructions.addEventListener("input", markEdited);
  form.addEventListener("submit", saveConfiguration);
  retryButton.addEventListener("click", loadPage);
  reloadButton.addEventListener("click", reloadLanguages);
  return {ready: loadPage()};
}

if (typeof document !== "undefined" && document.getElementById("tutor-form")) {
  mountTutorAdmin();
}

