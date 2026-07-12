import {
  createAssessmentFramework,
  createAssessmentFrameworkLevel,
  deleteAssessmentFramework,
  deleteAssessmentFrameworkLevel,
  readAssessmentFrameworkLevels,
  readAssessmentFrameworks,
  readAssessmentFrameworkWithLevels,
  writeAssessmentFramework,
  writeAssessmentFrameworkLevel
} from "/handler/assessment_framework_handler.js?v=20260712-initial";

const frameworkSelect = document.querySelector("#framework-select");
const newFrameworkButton = document.querySelector("#new-framework");
const saveFrameworkButton = document.querySelector("#save-framework");
const deleteFrameworkButton = document.querySelector("#delete-framework");
const confirmDeleteFrameworkCheckbox = document.querySelector("#confirm-delete-framework");
const frameworkNameInput = document.querySelector("#framework-name");
const endLevelNameInput = document.querySelector("#end-level-name");
const addLevelButton = document.querySelector("#add-level");
const levelsList = document.querySelector("#levels-list");
const statusEl = document.querySelector("#assessment-framework-status");
const levelTemplate = document.querySelector("#level-template");

let frameworks = [];
let selectedFrameworkId = "";
let deletedLevelIds = new Set();

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  document.querySelectorAll("button, input, select").forEach((element) => {
    element.disabled = isBusy;
  });

  if (!isBusy) {
    refreshDeleteButtonState();
  }
}

function showError(error, fallbackMessage) {
  console.error(error);
  setStatus(error.message || fallbackMessage, true);
}

function createOption(value, text = value) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = text;

  return option;
}

function renderEmptyLevels() {
  levelsList.innerHTML = "";

  const empty = document.createElement("div");

  empty.className = "empty-state";
  empty.textContent = "No levels yet.";
  levelsList.append(empty);
}

function removeEmptyLevels() {
  levelsList.querySelector(".empty-state")?.remove();
}

function refreshDeleteButtonState() {
  deleteFrameworkButton.disabled = !selectedFrameworkId ||
    !confirmDeleteFrameworkCheckbox.checked;
}

function clearForm() {
  selectedFrameworkId = "";
  deletedLevelIds = new Set();
  frameworkSelect.value = "";
  frameworkNameInput.value = "";
  endLevelNameInput.value = "";
  confirmDeleteFrameworkCheckbox.checked = false;
  renderEmptyLevels();
  refreshDeleteButtonState();
}

function populateFrameworkSelect() {
  const selectedValue = selectedFrameworkId;

  frameworkSelect.innerHTML = "";
  frameworkSelect.append(createOption("", "Create new framework"));

  frameworks
    .slice()
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""))
    .forEach((framework) => {
      frameworkSelect.append(createOption(framework.id, framework.name || framework.id));
    });

  frameworkSelect.value = selectedValue;
}

function getInputValue(input, name) {
  if (!input) {
    throw new Error(`${name} field is missing.`);
  }

  return String(input.value ?? "").trim();
}

function getNumberValue(input, name) {
  const rawValue = getInputValue(input, name);

  if (rawValue === "") {
    throw new Error(`${name} is required.`);
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }

  return value;
}

function getTextValue(input, name) {
  const value = getInputValue(input, name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getLevelCards() {
  return [...levelsList.querySelectorAll(".level-card")];
}

function addLevel(level = {}) {
  removeEmptyLevels();

  const fragment = levelTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".level-card");
  const levelNameInput = fragment.querySelector(".level-name");
  const sequenceOrderInput = fragment.querySelector(".sequence-order");
  const requiredPracticeCountInput = fragment.querySelector(".required-practice-count");
  const minimumScoreInput = fragment.querySelector(".minimum-score");
  const questionsPerPracticeInput = fragment.querySelector(".questions-per-practice");
  const difficultyLevelSelect = fragment.querySelector(".difficulty-level");
  const removeLevelButton = fragment.querySelector(".remove-level");
  const criteria = level.criteria || {};
  const nextSequenceOrder = getLevelCards().length + 1;

  card.dataset.originalLevelId = level.id || "";
  levelNameInput.value = level.levelName || "";
  sequenceOrderInput.value = level.sequenceOrder ?? nextSequenceOrder;
  requiredPracticeCountInput.value = criteria.requiredPracticeCount ?? 3;
  minimumScoreInput.value = criteria.minimumScore ?? 80;
  questionsPerPracticeInput.value = criteria.questionsPerPractice ?? 10;
  difficultyLevelSelect.value = criteria.difficultyLevel || "Easy";

  removeLevelButton.addEventListener("click", () => {
    const originalLevelId = card.dataset.originalLevelId;

    if (originalLevelId) {
      deletedLevelIds.add(originalLevelId);
    }

    card.remove();

    if (getLevelCards().length === 0) {
      renderEmptyLevels();
    }
  });

  levelsList.append(fragment);
}

function renderFrameworkWithLevels(result) {
  const framework = result.framework;
  const levels = result.levels || [];

  if (!framework) {
    clearForm();
    return;
  }

  selectedFrameworkId = framework.id;
  deletedLevelIds = new Set();
  frameworkSelect.value = framework.id;
  frameworkNameInput.value = framework.name || "";
  endLevelNameInput.value = framework.endLevelName || "";
  confirmDeleteFrameworkCheckbox.checked = false;
  levelsList.innerHTML = "";

  if (levels.length === 0) {
    renderEmptyLevels();
  } else {
    levels
      .slice()
      .sort((left, right) => Number(left.sequenceOrder || 0) - Number(right.sequenceOrder || 0))
      .forEach((level) => addLevel(level));
  }

  refreshDeleteButtonState();
}

function collectFrameworkData() {
  return {
    name: getTextValue(frameworkNameInput, "Framework name"),
    endLevelName: getTextValue(endLevelNameInput, "End level name")
  };
}

function collectLevelData(card, index = 0) {
  const levelLabel = `Level ${index + 1}`;

  return {
    originalLevelId: card.dataset.originalLevelId || "",
    data: {
      levelName: getTextValue(card.querySelector(".level-name"), `${levelLabel} name`),
      sequenceOrder: getNumberValue(
        card.querySelector(".sequence-order"),
        `${levelLabel} sequence`
      ),
      criteria: {
        requiredPracticeCount: getNumberValue(
          card.querySelector(".required-practice-count"),
          `${levelLabel} required practice count`
        ),
        minimumScore: getNumberValue(
          card.querySelector(".minimum-score"),
          `${levelLabel} minimum score`
        ),
        questionsPerPractice: getNumberValue(
          card.querySelector(".questions-per-practice"),
          `${levelLabel} questions per practice`
        ),
        difficultyLevel: getTextValue(
          card.querySelector(".difficulty-level"),
          `${levelLabel} difficulty level`
        )
      }
    }
  };
}

async function loadFrameworks(preferredFrameworkId = selectedFrameworkId) {
  setBusy(true);
  setStatus("Loading assessment frameworks...");

  try {
    frameworks = await readAssessmentFrameworks();
    selectedFrameworkId = preferredFrameworkId &&
      frameworks.some((framework) => framework.id === preferredFrameworkId)
      ? preferredFrameworkId
      : "";

    populateFrameworkSelect();

    if (selectedFrameworkId) {
      renderFrameworkWithLevels(
        await readAssessmentFrameworkWithLevels(selectedFrameworkId)
      );
      setStatus(`Loaded ${frameworks.length} assessment framework(s).`);
    } else {
      clearForm();
      setStatus(frameworks.length > 0
        ? `Loaded ${frameworks.length} assessment framework(s).`
        : "No assessment frameworks yet.");
    }
  } catch (error) {
    showError(error, "Could not load assessment frameworks.");
  } finally {
    setBusy(false);
  }
}

async function loadSelectedFramework() {
  const frameworkId = frameworkSelect.value;

  if (!frameworkId) {
    clearForm();
    return;
  }

  setBusy(true);
  setStatus("Loading assessment framework...");

  try {
    renderFrameworkWithLevels(await readAssessmentFrameworkWithLevels(frameworkId));
    setStatus("Assessment framework loaded.");
  } catch (error) {
    showError(error, "Could not load assessment framework.");
  } finally {
    setBusy(false);
  }
}

async function saveLevels(frameworkId, levels = []) {
  for (const levelId of deletedLevelIds) {
    await deleteAssessmentFrameworkLevel(frameworkId, levelId);
  }

  for (const level of levels) {
    if (level.originalLevelId) {
      await writeAssessmentFrameworkLevel(frameworkId, level.originalLevelId, level.data);
    } else {
      await createAssessmentFrameworkLevel(frameworkId, level.data);
    }
  }
}

async function saveFramework() {
  let frameworkData;
  let levels;

  try {
    frameworkData = collectFrameworkData();
    levels = getLevelCards().map((card, index) => collectLevelData(card, index));
  } catch (error) {
    showError(error, "Assessment framework has invalid fields.");
    return;
  }

  setBusy(true);
  setStatus("Saving assessment framework...");

  try {
    const framework = selectedFrameworkId
      ? await writeAssessmentFramework(selectedFrameworkId, frameworkData)
      : await createAssessmentFramework(frameworkData);

    await saveLevels(framework.id, levels);
    await loadFrameworks(framework.id);
    setStatus(`Saved assessment framework ${framework.name}.`);
  } catch (error) {
    showError(error, "Could not save assessment framework.");
  } finally {
    setBusy(false);
  }
}

async function deleteSelectedFramework() {
  if (!selectedFrameworkId || !confirmDeleteFrameworkCheckbox.checked) {
    refreshDeleteButtonState();
    return;
  }

  setBusy(true);
  setStatus("Deleting assessment framework...");

  try {
    const levels = await readAssessmentFrameworkLevels(selectedFrameworkId);

    for (const level of levels) {
      await deleteAssessmentFrameworkLevel(selectedFrameworkId, level.id);
    }

    await deleteAssessmentFramework(selectedFrameworkId);
    await loadFrameworks("");
    setStatus("Assessment framework deleted.");
  } catch (error) {
    showError(error, "Could not delete assessment framework.");
  } finally {
    setBusy(false);
  }
}

frameworkSelect.addEventListener("change", loadSelectedFramework);
newFrameworkButton.addEventListener("click", () => {
  clearForm();
  setStatus("Create a new assessment framework.");
});
saveFrameworkButton.addEventListener("click", saveFramework);
addLevelButton.addEventListener("click", () => addLevel());
confirmDeleteFrameworkCheckbox.addEventListener("change", refreshDeleteButtonState);
deleteFrameworkButton.addEventListener("click", deleteSelectedFramework);

loadFrameworks();
