import {getEssayConfiguration, saveEssayConfiguration} from "../../../essay_config/essay_config_module.js?v=20261112-essay-variation-v1";
import {fromLegacyConfiguration, generatorConfiguration, normalizeEssayConfiguration, gradeDocumentId} from "../../../essay_config/domain/essay_config.js?v=20261112-essay-variation-v1";
import {
  ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES,
} from "../../essay_question_generator_module.js?v=20261112-essay-variation-v1";
import {normalizeConfiguration} from "../../domain/essay_question_generator_config.js?v=20261112-essay-variation-v1";
import {mountEssayQuestionDemo} from "./essay_question_demo.js?v=20261113-essay-helping-preview-v1";

export function mountEssayQuestionGeneratorAdmin({
  root = document, getConfig = getEssayConfiguration, saveConfig = saveEssayConfiguration,
  demoOptions = {},
} = {}) {
  const byId = id => root.getElementById(id);
  const form = byId("essay-config-form");
  const common = byId("essay-common-instructions");
  const status = byId("essay-status");
  const updatedAt = byId("essay-updated-at");
  const saveButton = byId("essay-save-config");
  const retryButton = byId("essay-retry-load");
  const supports = new Map(), grades = new Map(), wordCounts = new Map(), difficulties = new Map(), listeners = [];
  let busy = false, loaded = false, disposed = false, dirty = false, demoBusy = false;
  let demo = null, canonical = fromLegacyConfiguration(), typeFields = new Map(), assignmentFields = new Map(), dynamicListeners = [];
  const typeContainer = byId("essay-type-catalog"), addTypeButton = byId("essay-add-type");
  function dynamicListen(element, event, callback) {
    element.addEventListener(event, callback); dynamicListeners.push(() => element.removeEventListener(event, callback));
  }
  function inputField(parent, tag, id, title, value, type = "text") {
    const wrapper = root.createElement("div"), label = root.createElement("label"), field = root.createElement(tag);
    field.id = id; if (tag === "input") field.type = type; field.value = String(value); label.textContent = title; label.setAttribute("for", id);
    wrapper.append(label, field); parent.append(wrapper); return field;
  }
  function renderTypes() {
    if (!typeContainer) return;
    dynamicListeners.forEach(remove => remove()); dynamicListeners = []; typeFields.clear(); assignmentFields.clear(); typeContainer.replaceChildren();
    for (const type of canonical.essayTypes) {
      const section = root.createElement("details"), heading = root.createElement("summary"), fields = {};
      section.className = "essay-type-card"; heading.textContent = type.name; section.append(heading);
      fields.name = inputField(section, "input", "essay-type-" + type.id + "-name", "Name", type.name);
      fields.instructions = inputField(section, "textarea", "essay-type-" + type.id + "-instructions", "Instructions for this essay type", type.llmInstructions);
      fields.requirement = inputField(section, "select", "essay-type-" + type.id + "-picture-requirement", "Picture requirement", type.pictureRequirement);
      for (const [value, title] of [["optional", "Optional"], ["required", "Required"]]) {
        const option = root.createElement("option"); option.value = value; option.textContent = title; fields.requirement.append(option);
      }
      fields.requirement.value = type.pictureRequirement;
      fields.frames = inputField(section, "input", "essay-type-" + type.id + "-frames", "Frames in one picture", type.pictureFrameCount, "number");
      fields.frames.min = "1"; fields.frames.max = "12"; fields.frames.step = "1";
      const grid = root.createElement("div"); grid.className = "grade-grid";
      for (const level of ["primary", "secondary"]) {
        const group = root.createElement("div"), title = root.createElement("h3"); title.textContent = level === "primary" ? "Primary" : "Secondary"; group.append(title);
        for (let standard = 1; standard <= 6; standard++) {
          const gradeId = gradeDocumentId(level, standard), ref = canonical.gradeSettings[level][standard].essayTypes.find(item => item.essayTypeId === type.id);
          const row = root.createElement("fieldset"), legend = root.createElement("legend"); legend.textContent = "Grade " + standard; row.append(legend);
          const prefix = "essay-type-" + type.id + "-" + gradeId;
          const available = inputField(row, "input", prefix + "-available", "Available", "", "checkbox"); available.checked = Boolean(ref);
          const picture = inputField(row, "input", prefix + "-picture", "Include picture", "", "checkbox"); picture.checked = ref?.pictureEnabled ?? type.pictureRequirement === "required";
          const instructions = inputField(row, "textarea", prefix + "-instructions", "Additional instructions for this type and grade", type.gradeInstructions[gradeId] ?? "");
          assignmentFields.set(type.id + ":" + gradeId, {typeId: type.id, level, standard, available, picture, instructions});
          group.append(row);
        }
        grid.append(group);
      }
      typeFields.set(type.id, fields); section.append(grid); typeContainer.append(section);
      for (const field of [fields.name, fields.instructions, fields.requirement, fields.frames]) dynamicListen(field, "input", () => {
        if (field === fields.frames && Number(field.value) > 1) fields.requirement.value = "required";
        dirty = true; setStatus("You have unsaved changes."); updateControls();
      });
    }
    for (const entry of assignmentFields.values()) for (const field of [entry.available, entry.picture, entry.instructions]) dynamicListen(field, "input", () => {
      dirty = true; setStatus("You have unsaved changes."); updateControls();
    });
  }
  function readCanonical(shared) {
    const config = structuredClone(canonical);
    config.additionalLlmInstructions = shared.additionalLlmInstructions; config.difficultyInstructions = shared.difficultyInstructions;
    for (const type of config.essayTypes) {
      const fields = typeFields.get(type.id);
      if (fields) Object.assign(type, {name: fields.name.value, llmInstructions: fields.instructions.value,
        pictureRequirement: fields.requirement.value, pictureFrameCount: Number(fields.frames.value)});
    }
    for (const level of ["primary", "secondary"]) for (let standard = 1; standard <= 6; standard++) {
      const grade = config.gradeSettings[level][standard], gradeId = gradeDocumentId(level, standard);
      grade.additionalLlmInstructions = shared.gradeInstructions[level][standard];
      grade.wordCountRequirement = shared.gradeWordCountRequirements[level][standard];
      grade.helpingWordsEnabled = shared.gradeSupport[level][standard].helpingWordsEnabled;
      grade.helpingWordCount = shared.gradeSupport[level][standard].helpingWordCount;
      if (typeContainer) {
        grade.essayTypes = [];
        for (const type of config.essayTypes) {
          const entry = assignmentFields.get(type.id + ":" + gradeId);
          if (entry.available.checked) grade.essayTypes.push({essayTypeId: type.id, pictureEnabled: entry.picture.checked});
          type.gradeInstructions[gradeId] = entry.instructions.value;
        }
      }
    }
    return {...generatorConfiguration(normalizeEssayConfiguration(config)), expectedVersion: canonical.version ?? 0};
  }
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
  function addSupport(level, standard, container) {
    const fields = {};
    for (const [key, title, type] of [["helpingWordsEnabled", "Include helping suggestions", "checkbox"], ["helpingWordCount", "Number of suggestions (words or short phrases)", "number"]]) {
      const label = root.createElement("label"), input = root.createElement("input");
      input.id = "essay-" + level + "-grade-" + standard + "-" + key;
      input.type = type; input.disabled = true; label.setAttribute("for", input.id);
      if (type === "number") {input.min = "1"; input.max = "30"; input.step = "1";}
      label.textContent = title; container.append(label, input); fields[key] = input;
    }
    supports.set(level + ":" + standard, fields);
  }
  for (const level of Object.values(ESSAY_QUESTION_LEVELS)) {
    const fields = new Map(), counts = new Map();
    for (const standard of ESSAY_QUESTION_STANDARDS) {
      const minimum = addMinimumWords(level, standard);
      fields.set(standard, addInstruction(byId("essay-" + level + "-instructions"),
        "essay-" + level + "-grade-" + standard, "Grade " + standard, minimum.element));
      addSupport(level, standard, minimum.element);
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
    ...minimumFields.map(field => field.input), ...[...supports.values()].flatMap(fields => Object.values(fields))];
  function updateControls() {
    for (const input of inputs) input.disabled = disposed || busy || demoBusy || !loaded;
    for (const fields of supports.values()) fields.helpingWordCount.disabled ||= !fields.helpingWordsEnabled.checked;
    saveButton.disabled = disposed || busy || demoBusy || !loaded;
    retryButton.disabled = disposed || busy || demoBusy;
    form.setAttribute("aria-busy", String(busy));
    const locked = disposed || busy || demoBusy || !loaded;
    if (addTypeButton) addTypeButton.disabled = locked;
    for (const fields of typeFields.values()) for (const field of Object.values(fields)) field.disabled = locked;
    for (const entry of assignmentFields.values()) {
      const required = typeFields.get(entry.typeId).requirement.value === "required";
      entry.available.disabled = locked; entry.picture.disabled = locked || !entry.available.checked || required;
      if (required) entry.picture.checked = true;
      entry.instructions.disabled = locked || !entry.available.checked;
    }
    demo?.setConfigurationState({loaded: loaded && !disposed, busy: busy || disposed, dirty, config: canonical});
  }
  function render(config) {
    canonical = config?.essayTypes ? config : fromLegacyConfiguration(config || {});
    const values = generatorConfiguration(canonical);
    renderTypes();
    common.value = values.additionalLlmInstructions;
    for (const [level, fields] of grades) for (const [standard, input] of fields) {
      input.value = values.gradeInstructions[level][standard];
    }
    for (const [difficulty, input] of difficulties) input.value = values.difficultyInstructions[difficulty];
    for (const [level, fields] of wordCounts) for (const [standard, field] of fields) {
      const value = values.gradeWordCountRequirements[level][standard].minWords;
      field.input.value = value === null ? "" : String(value); validateMinimum(field);
    }
    for (const [key, fields] of supports) {
      const [level, standard] = key.split(":"); const support = values.gradeSupport[level][standard];

      fields.helpingWordsEnabled.checked = support.helpingWordsEnabled;
      fields.helpingWordCount.value = String(support.helpingWordCount);
    }
    updatedAt.textContent = canonical.updatedAt ? "Last saved: " + new Date(canonical.updatedAt.toDate?.() ?? canonical.updatedAt).toLocaleString() : "Never saved";
    dirty = false;
  }
  function readForm() {
    return readCanonical(normalizeConfiguration({
      gradeSupport: Object.fromEntries(Object.values(ESSAY_QUESTION_LEVELS).map(level => [level,
        Object.fromEntries(ESSAY_QUESTION_STANDARDS.map(standard => {
          const fields = supports.get(level + ":" + standard);
          return [standard, {helpingWordsEnabled: fields.helpingWordsEnabled.checked,
            helpingWordCount: Number(fields.helpingWordCount.value)}];
        }))])),
      additionalLlmInstructions: common.value,
      gradeInstructions: Object.fromEntries([...grades].map(([level, fields]) =>
        [level, Object.fromEntries([...fields].map(([standard, input]) => [standard, input.value]))])),
      difficultyInstructions: Object.fromEntries([...difficulties].map(([difficulty, input]) => [difficulty, input.value])),
      gradeWordCountRequirements: Object.fromEntries([...wordCounts].map(([level, fields]) =>
        [level, Object.fromEntries([...fields].map(([standard, field]) => [standard,
          {minWords: field.input.value.trim() ? Number(field.input.value) : null}]))])),
    }));
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
      if (!disposed) {
        setStatus(error.message || "Could not save settings. Try again.", true);
        if (error.code?.endsWith("aborted")) {retryButton.textContent = "Reload saved settings"; retryButton.hidden = false;}
      }
    } finally {busy = false; if (!disposed) {saveButton.textContent = "Save settings"; updateControls();}}
  }
  for (const input of inputs) listen(input, "input", () => {
    if (!disposed && loaded && !busy && !demoBusy) {
      const minimum = minimumFields.find(field => field.input === input);
      if (minimum) validateMinimum(minimum);
      dirty = true; setStatus("You have unsaved changes."); updateControls();
    }
  });
  if (addTypeButton) listen(addTypeButton, "click", () => {
    if (disposed || busy || demoBusy || !loaded) return;
    try {
      canonical = {...readForm(), version: canonical.version};
      canonical.essayTypes.push({id: "type_" + crypto.randomUUID(), name: "New essay type", llmInstructions: "", gradeInstructions: {}, pictureRequirement: "optional", pictureFrameCount: 1});
      renderTypes(); dirty = true; updateControls(); setStatus("New essay type added. Enter its instructions, choose available grades, then save.");
    } catch (error) {setStatus(error.message, true);}
  });
  listen(form, "submit", save);
  listen(retryButton, "click", load);
  demo = mountEssayQuestionDemo({...demoOptions, root,
    onBusyChange(value) {demoBusy = value; updateControls();}});
  render(null); updateControls();
  return {
    ready: Promise.all([load(), demo.ready]),
    dispose() {disposed = true; listeners.forEach(remove => remove()); dynamicListeners.forEach(remove => remove()); demo.dispose(); updateControls();},
  };
}
if (typeof document !== "undefined" && document.getElementById("essay-question-generator-admin")) {
  mountEssayQuestionGeneratorAdmin();
}
