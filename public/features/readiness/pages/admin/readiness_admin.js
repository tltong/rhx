import {
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
  getReadinessConfig,
  saveReadinessConfig
} from "../../readiness_module.js?v=20261007-readiness-completion-v1";

export function mountReadinessAdmin({
  root = document,
  getConfig = getReadinessConfig,
  saveConfig = saveReadinessConfig
} = {}) {
  const form = root.querySelector("#readiness-form");
  const fields = root.querySelector("#weight-fields");
  const status = root.querySelector("#readiness-status");
  const updatedAt = root.querySelector("#updated-at");
  const saveButton = root.querySelector("#save-weights");
  const resetButton = root.querySelector("#reset-weights");
  const retryButton = root.querySelector("#retry-load");
  const practiceCountField = {
    input: root.querySelector("#number-of-practices"),
    error: root.querySelector("#number-of-practices-error"),
    integer: true
  };
  const inputs = new Map();
  let busy = false;
  let loaded = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }

  function setBusy(value) {
    busy = value;
    for (const {input} of [practiceCountField, ...inputs.values()]) input.disabled = busy || !loaded;
    saveButton.disabled = busy || !loaded;
    resetButton.disabled = busy || !loaded;
    retryButton.disabled = busy;
  }

  function validateField({input, error, integer = false}) {
    const valid = integer
      ? Number.isSafeInteger(input.valueAsNumber) && input.valueAsNumber >= 1
      : Number.isFinite(input.valueAsNumber) && input.valueAsNumber > 0;
    const message = valid ? "" : integer
      ? "Enter a whole number of practices greater than zero."
      : "Enter a number greater than zero.";
    input.setCustomValidity(message);
    input.setAttribute("aria-invalid", String(!valid));
    error.textContent = message;
    error.hidden = valid;
    return valid;
  }

  for (const difficulty of ["preAssessmentWeight", ...Object.values(DifficultyLevel)]) {
    const row = root.createElement("div");
    row.className = "weight-row";
    const label = root.createElement("label");
    label.htmlFor = difficulty === "preAssessmentWeight" ? "weight-pre-assessment" : `weight-${difficulty}`;
    label.textContent = difficulty === "preAssessmentWeight" ? "Pre-assessment"
      : difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const control = root.createElement("div");
    const input = root.createElement("input");
    input.id = label.htmlFor;
    input.name = difficulty;
    input.type = "number";
    input.required = true;
    input.min = "0";
    input.step = "any";
    input.disabled = true;
    input.setAttribute("aria-describedby", `${input.id}-error`);
    const error = root.createElement("span");
    error.id = `${input.id}-error`;
    error.className = "field-error";
    error.hidden = true;
    const field = {input, error};
    inputs.set(difficulty, field);
    input.addEventListener("input", () => {
      validateField(field);
      setStatus("You have unsaved changes.");
    });
    control.append(input, error);
    row.append(label, control);
    fields.append(row);
  }

  practiceCountField.input.addEventListener("input", () => {
    validateField(practiceCountField);
    setStatus("You have unsaved changes.");
  });

  function renderValues(config) {
    const weights = {
      ...(config?.difficultyWeights || DEFAULT_DIFFICULTY_WEIGHTS),
      preAssessmentWeight: config?.preAssessmentWeight ?? DEFAULT_PRE_ASSESSMENT_WEIGHT
    };
    for (const [difficulty, field] of inputs) {
      field.input.value = String(weights[difficulty]);
      validateField(field);
    }
    practiceCountField.input.value = String(config?.numberOfPractices ?? DEFAULT_NUMBER_OF_PRACTICES);
    validateField(practiceCountField);
  }

  function renderConfig(config) {
    renderValues(config);
    updatedAt.textContent = config
      ? `Last saved ${config.updatedAt.toLocaleString()}`
      : "Never saved";
  }

  async function loadConfig() {
    if (busy) return;
    setBusy(true);
    retryButton.hidden = true;
    setStatus("Loading readiness configuration...");
    try {
      const config = await getConfig();
      renderConfig(config);
      loaded = true;
      setStatus(config ? "Readiness configuration loaded." : "Readiness settings have not been saved yet. Save these values to configure readiness.");
    } catch (error) {
      loaded = false;
      retryButton.hidden = false;
      setStatus(error.message || "Could not load readiness configuration.", true);
    } finally {
      setBusy(false);
    }
  }

  async function saveWeights(event) {
    event.preventDefault();
    if (busy || !loaded) return;
    const valid = [practiceCountField, ...inputs.values()].map((field) => validateField(field)).every(Boolean);
    if (!valid) {
      form.reportValidity();
      setStatus("Correct the highlighted settings before saving.", true);
      return;
    }
    const difficultyWeights = Object.fromEntries(Object.values(DifficultyLevel)
      .map((difficulty) => [difficulty, inputs.get(difficulty).input.valueAsNumber]));
    setBusy(true);
    saveButton.textContent = "Saving...";
    setStatus("Saving readiness configuration...");
    try {
      renderConfig(await saveConfig({
        difficultyWeights,
        numberOfPractices: practiceCountField.input.valueAsNumber,
        preAssessmentWeight: inputs.get("preAssessmentWeight").input.valueAsNumber
      }));
      setStatus("Readiness configuration saved.");
    } catch (error) {
      setStatus(error.message || "Could not save readiness configuration.", true);
    } finally {
      saveButton.textContent = "Save Configuration";
      setBusy(false);
    }
  }

  form.addEventListener("submit", saveWeights);
  resetButton.addEventListener("click", () => {
    if (busy || !loaded) return;
    renderValues(null);
    setStatus("Default settings restored in the form. Save to apply them.");
  });
  retryButton.addEventListener("click", loadConfig);
  renderConfig(null);
  return {ready: loadConfig()};
}

if (typeof document !== "undefined" && document.querySelector("#readiness-form")) {
  mountReadinessAdmin();
}
