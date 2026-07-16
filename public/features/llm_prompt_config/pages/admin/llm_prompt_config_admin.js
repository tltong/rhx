import {
  llmPromptConfigYearNumbers
} from "../../../../config/firebase/llm_prompt_config_schema.js?v=20260717-llm-prompt-config";
import {
  createLlmPromptConfigRecord,
  deleteLlmPromptConfigRecord,
  getLlmPromptConfigById,
  listLlmPromptConfigs,
  updateLlmPromptConfigRecord
} from "../../llm_prompt_config_module.js?v=20260717-llm-prompt-config";

const configSelect = document.querySelector("#config-select");
const newConfigIdentifierInput = document.querySelector("#new-config-identifier");
const useNewConfigButton = document.querySelector("#new-config");
const configIdentifierInput = document.querySelector("#config-identifier");
const primaryContextInput = document.querySelector("#primary-context");
const secondaryContextInput = document.querySelector("#secondary-context");
const overallAdditionalInstructionsInput = document.querySelector(
  "#overall-additional-instructions"
);
const primaryYearInstructionsContainer = document.querySelector(
  "#primary-year-instructions"
);
const secondaryYearInstructionsContainer = document.querySelector(
  "#secondary-year-instructions"
);
const saveButton = document.querySelector("#save-config");
const deleteButton = document.querySelector("#delete-config");
const confirmDeleteInput = document.querySelector("#confirm-delete-config");
const statusMessage = document.querySelector("#status-message");

let loadedConfig = null;
let pageBusy = false;

function normalizeText(value) {
  return String(value || "").trim();
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  statusMessage.classList.toggle("error", isError);
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.hidden = true;
  statusMessage.classList.remove("error");
}

function updateDeleteControls() {
  confirmDeleteInput.disabled = pageBusy || !loadedConfig;
  deleteButton.disabled = pageBusy || !loadedConfig || !confirmDeleteInput.checked;
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  configSelect.disabled = isBusy;
  newConfigIdentifierInput.disabled = isBusy;
  useNewConfigButton.disabled = isBusy;
  configIdentifierInput.disabled = isBusy;
  primaryContextInput.disabled = isBusy;
  secondaryContextInput.disabled = isBusy;
  overallAdditionalInstructionsInput.disabled = isBusy;
  saveButton.disabled = isBusy;

  document.querySelectorAll("[data-year-instructions]").forEach((textarea) => {
    textarea.disabled = isBusy;
  });

  updateDeleteControls();
}

function renderConfigOptions(configs, selectedConfigId = "") {
  configSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = configs.length
    ? `Select config (${configs.length})`
    : "No saved configs";
  configSelect.append(placeholder);

  configs.forEach((config) => {
    const option = document.createElement("option");
    option.value = config.id;
    option.textContent = `${config.identifier} (${config.id})`;
    configSelect.append(option);
  });

  configSelect.value = selectedConfigId;
}

async function refreshConfigOptions(selectedConfigId = "") {
  const configs = await listLlmPromptConfigs();

  renderConfigOptions(configs, selectedConfigId);

  return configs;
}

function renderYearInstructions(container, level, instructions = {}) {
  container.replaceChildren();

  llmPromptConfigYearNumbers.forEach((year) => {
    const card = document.createElement("label");
    const title = document.createElement("span");
    const textarea = document.createElement("textarea");

    card.className = "year-card";
    title.textContent = `${level} Year ${year}`;
    textarea.rows = 4;
    textarea.dataset.level = level.toLowerCase();
    textarea.dataset.year = year;
    textarea.dataset.yearInstructions = "true";
    textarea.value = instructions[year]?.additionalInstructions || "";

    card.append(title, textarea);
    container.append(card);
  });
}

function renderAllYearInstructions(config = {}) {
  renderYearInstructions(
    primaryYearInstructionsContainer,
    "Primary",
    config.primary || {}
  );
  renderYearInstructions(
    secondaryYearInstructionsContainer,
    "Secondary",
    config.secondary || {}
  );
}

function resetEditor() {
  loadedConfig = null;
  configSelect.value = "";
  newConfigIdentifierInput.value = "";
  configIdentifierInput.value = "";
  primaryContextInput.value = "";
  secondaryContextInput.value = "";
  overallAdditionalInstructionsInput.value = "";
  confirmDeleteInput.checked = false;
  renderAllYearInstructions();
  updateDeleteControls();
  clearStatus();
}

function displayConfig(config, message) {
  loadedConfig = config;
  confirmDeleteInput.checked = false;
  newConfigIdentifierInput.value = "";

  if (Array.from(configSelect.options).some((option) => option.value === config.id)) {
    configSelect.value = config.id;
  }

  configIdentifierInput.value = config.identifier || "";
  primaryContextInput.value = config.primaryContext || "";
  secondaryContextInput.value = config.secondaryContext || "";
  overallAdditionalInstructionsInput.value =
    config.overallAdditionalInstructions || "";
  renderAllYearInstructions(config);
  updateDeleteControls();
  setStatus(message);
}

function prepareNewConfig() {
  const identifier = normalizeText(newConfigIdentifierInput.value);

  if (!identifier) {
    setStatus("Enter a config identifier first.", true);
    return;
  }

  loadedConfig = null;
  configSelect.value = "";
  confirmDeleteInput.checked = false;
  configIdentifierInput.value = identifier;
  primaryContextInput.value = "";
  secondaryContextInput.value = "";
  overallAdditionalInstructionsInput.value = "";
  renderAllYearInstructions();
  updateDeleteControls();
  setStatus(`Ready to create ${identifier}. Add instructions and save.`);
}

function readYearInstructions(level) {
  const instructions = {};

  document.querySelectorAll(`[data-level='${level}']`).forEach((textarea) => {
    instructions[textarea.dataset.year] = {
      additionalInstructions: textarea.value
    };
  });

  return instructions;
}

function readConfigForm() {
  const identifier = normalizeText(configIdentifierInput.value);

  if (!identifier) {
    throw new Error("Identifier is required.");
  }

  return {
    identifier,
    primaryContext: primaryContextInput.value,
    secondaryContext: secondaryContextInput.value,
    overallAdditionalInstructions: overallAdditionalInstructionsInput.value,
    primary: readYearInstructions("primary"),
    secondary: readYearInstructions("secondary")
  };
}

async function saveConfig() {
  setBusy(true);
  clearStatus();

  try {
    const changes = readConfigForm();

    loadedConfig = loadedConfig
      ? await updateLlmPromptConfigRecord(loadedConfig, changes)
      : await createLlmPromptConfigRecord(changes);

    await refreshConfigOptions(loadedConfig.id);
    displayConfig(loadedConfig, "LLM prompt config saved.");
  } catch (error) {
    setStatus(error.message || "Could not save LLM prompt config.", true);
  } finally {
    setBusy(false);
  }
}

async function deleteConfig() {
  if (!loadedConfig) {
    setStatus("Load a saved config before deleting.", true);
    return;
  }

  if (!confirmDeleteInput.checked) {
    setStatus("Confirm delete before deleting the selected config.", true);
    return;
  }

  const deletedIdentifier = loadedConfig.identifier;

  setBusy(true);
  clearStatus();

  try {
    await deleteLlmPromptConfigRecord(loadedConfig.id);
    resetEditor();

    const configs = await refreshConfigOptions();

    if (configs.length > 0) {
      displayConfig(configs[0], `${deletedIdentifier} deleted. Loaded ${configs[0].identifier}.`);
      return;
    }

    setStatus(`${deletedIdentifier} deleted. No saved configs remain.`);
  } catch (error) {
    setStatus(error.message || "Could not delete selected config.", true);
  } finally {
    setBusy(false);
  }
}

async function loadSelectedConfig() {
  const selectedConfigId = configSelect.value;

  if (!selectedConfigId) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const config = await getLlmPromptConfigById(selectedConfigId);

    if (!config) {
      throw new Error("Selected LLM prompt config could not be found.");
    }

    displayConfig(config, "LLM prompt config loaded.");
  } catch (error) {
    setStatus(error.message || "Could not load selected config.", true);
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  renderAllYearInstructions();

  try {
    const configs = await refreshConfigOptions();

    if (configs.length === 0) {
      setStatus("No saved configs found. Add a new config to start.");
      return;
    }

    displayConfig(configs[0], `Loaded ${configs.length} saved configs.`);
  } catch (error) {
    setStatus(error.message || "Could not load saved configs.", true);
  }
}

configSelect.addEventListener("change", loadSelectedConfig);
useNewConfigButton.addEventListener("click", prepareNewConfig);
saveButton.addEventListener("click", saveConfig);
deleteButton.addEventListener("click", deleteConfig);
confirmDeleteInput.addEventListener("change", updateDeleteControls);

initPage();
