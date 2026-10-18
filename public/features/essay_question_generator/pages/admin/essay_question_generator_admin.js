import {
  ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES,
  createDefaultConfiguration, getEssayQuestionGeneratorConfig, saveEssayQuestionGeneratorConfig,
} from "../../essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {normalizeConfiguration} from "../../domain/essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {mountEssayQuestionDemo} from "./essay_question_demo.js?v=20261017-essay-grade-min-words-v1";

export function mountEssayQuestionGeneratorAdmin({
  root = document, getConfig = getEssayQuestionGeneratorConfig, saveConfig = saveEssayQuestionGeneratorConfig,
  demoOptions = {},
} = {}) {
  const byId = id => root.getElementById(id);
  const form = byId("essay-config-form");
  const common = byId("essay-common-instructions");
  const status = byId("essay-status");
  const updatedAt = byId("essay-updated-at");
  const saveButton = byId("essay-save-config");
  const retryButton = byId("essay-retry-load");
  const grades = new Map(), wordCounts = new Map(), difficulties = new Map(), listeners = [];
  let busy = false, loaded = false, disposed = false, dirty = false, demoBusy = false;
  let demo = null;
  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }
  function addInstruction(container, id, title, extra = null) {
    const field = root.createElement("div");
    const label = root.createElement("label");
    label.setAttribute("for", id); label.textContent = title;
    const input = root.createElement("textarea");
    input.id = id; input.rows = 3; input.disabled = true;
    field.append(label, input);
    if (extra) field.append(extra);
    container.append(field);
    return input;
  }
  function addMinimumWords(level, standard) {
    const element = root.createElement("div"); element.className = "word-count-field";
    const label = root.createElement("label"); label.textContent = "Minimum words";
    const input = root.createElement("input");
    input.id = "essay-" + level + "-grade-" + standard + "-min-words";
    input.type = "number"; input.min = "1"; input.step = "1";
    input.placeholder = "No minimum"; input.disabled = true;
    input.setAttribute("aria-label", (level === "primary" ? "Primary" : "Secondary") + " grade " + standard + " minimum words");
    label.setAttribute("for", input.id);
    const error = root.createElement("p"); error.id = input.id + "-error";
    error.className = "field-error"; error.hidden = true;
    input.setAttribute("aria-describedby", error.id);
    element.append(label, input, error);
    return {element, input, error};
  }
  function validateMinimum(field) {
    const raw = field.input.value.trim();
    const value = raw ? Number(raw) : null;
    const valid = !field.input.validity?.badInput && (value === null || (Number.isSafeInteger(value) && value > 0));
    const message = valid ? "" : "Enter a positive whole number, or leave blank for no minimum.";
    field.input.setCustomValidity(message);
    field.input.setAttribute("aria-invalid", String(!valid));
    field.error.textContent = message; field.error.hidden = valid;
    return valid;
  }
  for (const level of Object.values(ESSAY_QUESTION_LEVELS)) {
    const fields = new Map(), counts = new Map();
    for (const standard of ESSAY_QUESTION_STANDARDS) {
      const minimum = addMinimumWords(level, standard);
      fields.set(standard, addInstruction(byId("essay-" + level + "-instructions"),
        "essay-" + level + "-grade-" + standard, "Grade " + standard, minimum.element));
      counts.set(standard, minimum);
    }
    grades.set(level, fields);
    wordCounts.set(level, counts);
  }
  for (const difficulty of Object.values(ESSAY_QUESTION_DIFFICULTIES)) {
    difficulties.set(difficulty, addInstruction(byId("essay-difficulty-instructions"),
      "essay-difficulty-" + difficulty, difficulty[0].toUpperCase() + difficulty.slice(1)));
  }
  const minimumFields = [...wordCounts.values()].flatMap(fields => [...fields.values()]);
  const inputs = [common, ...[...grades.values()].flatMap(fields => [...fields.values()]), ...difficulties.values(),
    ...minimumFields.map(field => field.input)];
  function updateControls() {
    for (const input of inputs) input.disabled = disposed || busy || demoBusy || !loaded;
    saveButton.disabled = disposed || busy || demoBusy || !loaded;
    retryButton.disabled = disposed || busy || demoBusy;
    form.setAttribute("aria-busy", String(busy));
    demo?.setConfigurationState({loaded: loaded && !disposed, busy: busy || disposed, dirty});
  }
  function render(config) {
    const values = normalizeConfiguration({... (config || createDefaultConfiguration())});
    common.value = values.additionalLlmInstructions;
    for (const [level, fields] of grades) for (const [standard, input] of fields) {
      input.value = values.gradeInstructions[level][standard];
    }
    for (const [difficulty, input] of difficulties) input.value = values.difficultyInstructions[difficulty];
    for (const [level, fields] of wordCounts) for (const [standard, field] of fields) {
      const value = values.gradeWordCountRequirements[level][standard].minWords;
      field.input.value = value === null ? "" : String(value); validateMinimum(field);
    }
    updatedAt.textContent = config ? "Last saved: " + config.updatedAt.toLocaleString() : "Never saved";
    dirty = false;
  }
  function readForm() {
    return normalizeConfiguration({
      additionalLlmInstructions: common.value,
      gradeInstructions: Object.fromEntries([...grades].map(([level, fields]) =>
        [level, Object.fromEntries([...fields].map(([standard, input]) => [standard, input.value]))])),
      difficultyInstructions: Object.fromEntries([...difficulties].map(([difficulty, input]) => [difficulty, input.value])),
      gradeWordCountRequirements: Object.fromEntries([...wordCounts].map(([level, fields]) =>
        [level, Object.fromEntries([...fields].map(([standard, field]) => [standard,
          {minWords: field.input.value.trim() ? Number(field.input.value) : null}]))])),
    });
  }
  async function load() {
    if (disposed || busy || demoBusy) return;
    busy = true; loaded = false; retryButton.hidden = true;
    setStatus("Loading essay question configuration..."); updateControls();
    try {
      const config = await getConfig();
      if (disposed) return;
      render(config); loaded = true;
      setStatus(config ? "Settings loaded." : "No additional instructions configured. Enter instructions and save settings.");
    } catch (error) {
      if (!disposed) {retryButton.hidden = false; setStatus(error.message || "Could not load settings.", true);}
    } finally {busy = false; if (!disposed) updateControls();}
  }
  async function save(event) {
    event.preventDefault();
    if (disposed || busy || demoBusy || !loaded) return;
    if (!minimumFields.map(validateMinimum).every(Boolean)) {
      form.reportValidity?.(); setStatus("Correct the minimum word counts before saving.", true); return;
    }
    let configuration;
    try {configuration = readForm();}
    catch (error) {setStatus(error.message || "Check the settings before saving.", true); return;}
    busy = true; saveButton.textContent = "Saving...";
    setStatus("Saving settings..."); updateControls();
    try {
      const config = await saveConfig(configuration);
      if (disposed) return;
      render(config); setStatus("Settings saved.");
    } catch (error) {
      if (!disposed) setStatus(error.message || "Could not save settings. Try again.", true);
    } finally {busy = false; if (!disposed) {saveButton.textContent = "Save settings"; updateControls();}}
  }
  for (const input of inputs) listen(input, "input", () => {
    if (!disposed && loaded && !busy && !demoBusy) {
      const minimum = minimumFields.find(field => field.input === input);
      if (minimum) validateMinimum(minimum);
      dirty = true; setStatus("You have unsaved changes."); updateControls();
    }
  });
  listen(form, "submit", save);
  listen(retryButton, "click", load);
  demo = mountEssayQuestionDemo({...demoOptions, root,
    onBusyChange(value) {demoBusy = value; updateControls();}});
  render(null); updateControls();
  return {
    ready: Promise.all([load(), demo.ready]),
    dispose() {disposed = true; listeners.forEach(remove => remove()); demo.dispose(); updateControls();},
  };
}
if (typeof document !== "undefined" && document.getElementById("essay-question-generator-admin")) {
  mountEssayQuestionGeneratorAdmin();
}
