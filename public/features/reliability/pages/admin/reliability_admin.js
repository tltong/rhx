import {
  DEFAULT_PERCENTAGE_PER_PRACTICE,
  getReliabilityConfig,
  saveReliabilityConfig
} from "../../reliability_module.js?v=20261018-essay-reuse-v1";

export function mountReliabilityAdmin({
  root = document,
  getConfig = getReliabilityConfig,
  saveConfig = saveReliabilityConfig
} = {}) {
  const form = root.querySelector("#reliability-form");
  const input = root.querySelector("#percentage-per-practice");
  const fieldError = root.querySelector("#percentage-per-practice-error");
  const status = root.querySelector("#reliability-status");
  const updatedAt = root.querySelector("#updated-at");
  const saveButton = root.querySelector("#save-config");
  const resetButton = root.querySelector("#reset-config");
  const retryButton = root.querySelector("#retry-load");
  let busy = false;
  let loaded = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }

  function setBusy(value) {
    busy = value;
    input.disabled = busy || !loaded;
    saveButton.disabled = busy || !loaded;
    resetButton.disabled = busy || !loaded;
    retryButton.disabled = busy;
  }

  function validateField() {
    const value = input.valueAsNumber;
    const valid = Number.isFinite(value) && value > 0 && value <= 100;
    const message = valid ? "" : "Enter a percentage greater than 0 and at most 100.";
    input.setCustomValidity(message);
    input.setAttribute("aria-invalid", String(!valid));
    fieldError.textContent = message;
    fieldError.hidden = valid;
    return valid;
  }

  function renderValue(config) {
    input.value = String(config?.percentagePerPractice ?? DEFAULT_PERCENTAGE_PER_PRACTICE);
    validateField();
  }

  function renderConfig(config) {
    renderValue(config);
    updatedAt.textContent = config
      ? `Last saved ${config.updatedAt.toLocaleString()}`
      : "Never saved";
  }

  async function loadConfig() {
    if (busy) return;
    setBusy(true);
    retryButton.hidden = true;
    setStatus("Loading reliability configuration...");
    try {
      const config = await getConfig();
      renderConfig(config);
      loaded = true;
      setStatus(config
        ? "Reliability configuration loaded."
        : `Using the default of ${DEFAULT_PERCENTAGE_PER_PRACTICE}% per completed practice. Save to configure reliability.`);
    } catch (error) {
      loaded = false;
      retryButton.hidden = false;
      setStatus(error.message || "Could not load reliability configuration.", true);
    } finally {
      setBusy(false);
    }
  }

  async function saveConfiguration(event) {
    event.preventDefault();
    if (busy || !loaded) return;
    if (!validateField()) {
      form.reportValidity();
      setStatus("Correct the highlighted percentage before saving.", true);
      return;
    }
    const configuration = {percentagePerPractice: input.valueAsNumber};
    setBusy(true);
    saveButton.textContent = "Saving...";
    setStatus("Saving reliability configuration...");
    try {
      renderConfig(await saveConfig(configuration));
      setStatus("Reliability configuration saved.");
    } catch (error) {
      setStatus(error.message || "Could not save reliability configuration.", true);
    } finally {
      saveButton.textContent = "Save Configuration";
      setBusy(false);
    }
  }

  input.addEventListener("input", () => {
    validateField();
    setStatus("You have unsaved changes.");
  });
  form.addEventListener("submit", saveConfiguration);
  resetButton.addEventListener("click", () => {
    if (busy || !loaded) return;
    renderValue(null);
    setStatus("Default percentage restored in the form. Save to apply it.");
  });
  retryButton.addEventListener("click", loadConfig);
  renderConfig(null);
  return {ready: loadConfig()};
}

if (typeof document !== "undefined" && document.querySelector("#reliability-form")) {
  mountReliabilityAdmin();
}
