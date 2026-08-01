import {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreBands,
  createAssessmentFrameworkRecord,
  deleteAssessmentFrameworkRecord,
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
  saveAssessmentFrameworkPreAssessment,
  updateAssessmentFrameworkRecord
} from "../../assessment_framework_module.js?v=20260730-score-bands";

const frameworkSelect = document.querySelector("#framework-select");
const newFrameworkNameInput = document.querySelector("#new-framework-name");
const useNewFrameworkButton = document.querySelector("#use-new-framework");
const frameworkNameInput = document.querySelector("#framework-name");
const endLevelNameInput = document.querySelector("#framework-end-level-name");
const addLevelButton = document.querySelector("#add-level");
const levelsContainer = document.querySelector("#levels-container");
const levelTemplate = document.querySelector("#level-template");
const saveButton = document.querySelector("#save-framework");
const deleteButton = document.querySelector("#delete-framework");
const confirmDeleteInput = document.querySelector("#confirm-delete-framework");
const preAssessmentAvailability = document.querySelector(
  "#pre-assessment-availability"
);
const preAssessmentFields = document.querySelector("#pre-assessment-fields");
const preAssessmentQuestionCountInput = document.querySelector(
  "#pre-assessment-question-count"
);
const difficultyInputs = Array.from(
  document.querySelectorAll("[data-difficulty-field]")
);
const difficultyTotal = document.querySelector("#difficulty-total");
const scoreLevelMappings = document.querySelector("#score-level-mappings");
const savePreAssessmentButton = document.querySelector(
  "#save-pre-assessment"
);
const statusMessage = document.querySelector("#status-message");

let loadedFramework = null;
let pageBusy = false;
let frameworkLevelsDirty = false;

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
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
  confirmDeleteInput.disabled = pageBusy || !loadedFramework;
  deleteButton.disabled = pageBusy || !loadedFramework || !confirmDeleteInput.checked;
}

function hasSavedLevels() {
  return Boolean(
    loadedFramework?.id &&
    Array.isArray(loadedFramework.levels) &&
    loadedFramework.levels.length > 0
  );
}

function updatePreAssessmentControls() {
  const levelsAreReady = hasSavedLevels() && !frameworkLevelsDirty;
  const canEdit = !pageBusy && levelsAreReady;

  preAssessmentFields.disabled = !canEdit;
  savePreAssessmentButton.disabled = !canEdit;

  if (!loadedFramework?.id || !hasSavedLevels()) {
    preAssessmentAvailability.textContent =
      "Save at least one framework level before configuring pre-assessment.";
    return;
  }

  if (frameworkLevelsDirty) {
    preAssessmentAvailability.textContent =
      "Save the framework level changes before editing pre-assessment.";
    return;
  }

  preAssessmentAvailability.textContent =
    "This pre-assessment configuration applies to every topic.";
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  frameworkSelect.disabled = isBusy;
  newFrameworkNameInput.disabled = isBusy;
  useNewFrameworkButton.disabled = isBusy;
  frameworkNameInput.disabled = isBusy;
  endLevelNameInput.disabled = isBusy;
  addLevelButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  updateLevelControls();
  updateDeleteControls();
  updatePreAssessmentControls();
}

function renderFrameworkOptions(frameworks, selectedFrameworkId = "") {
  frameworkSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = frameworks.length
    ? `Select framework (${frameworks.length})`
    : "No saved frameworks";
  frameworkSelect.append(placeholder);

  frameworks.forEach((framework) => {
    const option = document.createElement("option");
    option.value = framework.id;
    option.textContent = framework.name;
    frameworkSelect.append(option);
  });

  frameworkSelect.value = selectedFrameworkId;
}

async function refreshFrameworkOptions(selectedFrameworkId = "") {
  const frameworks = await listAssessmentFrameworks();
  renderFrameworkOptions(frameworks, selectedFrameworkId);
  return frameworks;
}

function getLevelRows() {
  return Array.from(levelsContainer.querySelectorAll(".level-row"));
}

function markFrameworkLevelsDirty() {
  frameworkLevelsDirty = true;
  updatePreAssessmentControls();
}

function updateLevelControls() {
  const rows = getLevelRows();

  rows.forEach((row, index) => {
    row.querySelector("[data-field='sequenceOrder']").value = index + 1;

    const moveUpButton = row.querySelector("[data-action='move-up']");
    const moveDownButton = row.querySelector("[data-action='move-down']");
    const removeButton = row.querySelector("[data-action='remove-level']");

    moveUpButton.disabled = pageBusy || index === 0;
    moveDownButton.disabled = pageBusy || index === rows.length - 1;
    removeButton.disabled = pageBusy;
  });
}

function moveLevelRow(row, direction) {
  const sibling = direction === "up"
    ? row.previousElementSibling
    : row.nextElementSibling;

  if (!sibling) {
    return;
  }

  if (direction === "up") {
    levelsContainer.insertBefore(row, sibling);
  } else {
    levelsContainer.insertBefore(sibling, row);
  }

  markFrameworkLevelsDirty();
  updateLevelControls();
}

function addLevelRow(level = {}) {
  const fragment = levelTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".level-row");
  const criteria = level.criteria || {};

  row.dataset.levelId = level.id || "";
  row.querySelector("[data-field='levelName']").value = level.levelName || "";
  row.querySelector("[data-field='requiredPracticeCount']").value =
    criteria.requiredPracticeCount ?? 3;
  row.querySelector("[data-field='minimumScore']").value =
    criteria.minimumScore ?? 80;
  row.querySelector("[data-field='questionsPerPractice']").value =
    criteria.questionsPerPractice ?? 10;
  row.querySelector("[data-field='difficultyLevel']").value =
    criteria.difficultyLevel || "Easy";
  row.querySelector("[data-action='move-up']").addEventListener("click", () => {
    moveLevelRow(row, "up");
  });
  row.querySelector("[data-action='move-down']").addEventListener("click", () => {
    moveLevelRow(row, "down");
  });
  row.querySelector("[data-action='remove-level']").addEventListener("click", () => {
    row.remove();
    markFrameworkLevelsDirty();
    updateLevelControls();
  });
  row.addEventListener("input", markFrameworkLevelsDirty);
  row.addEventListener("change", markFrameworkLevelsDirty);

  levelsContainer.append(row);
  updateLevelControls();
}

function renderLevels(levels = []) {
  levelsContainer.replaceChildren();

  levels.forEach((level) => addLevelRow(level));
  updateLevelControls();
}

function getDifficultyDefaults() {
  return {
    easyPercentage: 34,
    mediumPercentage: 33,
    hardPercentage: 33
  };
}

function renderScoreLevelMappings(levels = [], endLevelName = "") {
  scoreLevelMappings.replaceChildren();

  assessmentFrameworkPreAssessmentScoreBands.forEach((scoreBand) => {
    const fieldLabel = document.createElement("label");
    const scoreLabel = document.createElement("span");
    const select = document.createElement("select");

    fieldLabel.className = "score-mapping";
    scoreLabel.textContent = scoreBand.label;
    select.dataset.scoreField = scoreBand.field;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select level";
    select.append(placeholder);

    levels.forEach((level) => {
      const option = document.createElement("option");
      option.value = level.id;
      option.textContent = level.levelName;
      select.append(option);
    });

    const endLevelOption = document.createElement("option");
    endLevelOption.value = ASSESSMENT_FRAMEWORK_END_LEVEL_ID;
    endLevelOption.textContent =
      `End level: ${endLevelName || "End level"}`;
    select.append(endLevelOption);

    fieldLabel.append(scoreLabel, select);
    scoreLevelMappings.append(fieldLabel);
  });
}

function updateDifficultyTotal() {
  const total = difficultyInputs.reduce(
    (sum, input) => sum + (Number(input.value) || 0),
    0
  );

  difficultyTotal.value = `${total}%`;
  difficultyTotal.textContent = `${total}%`;
  difficultyTotal.classList.toggle("error", Math.abs(total - 100) > 0.0001);
}

function renderPreAssessmentEditor() {
  const preAssessment = loadedFramework?.preAssessment;
  const difficultySplit = preAssessment?.difficultySplit ||
    getDifficultyDefaults();

  renderScoreLevelMappings(
    loadedFramework?.levels || [],
    loadedFramework?.endLevelName || ""
  );
  preAssessmentQuestionCountInput.value =
    preAssessment?.numberOfQuestions ?? 10;

  difficultyInputs.forEach((input) => {
    input.value = difficultySplit[input.dataset.difficultyField] ?? 0;
  });

  scoreLevelMappings.querySelectorAll("[data-score-field]").forEach(
    (select) => {
      select.value =
        preAssessment?.scoreLevelSplit?.[select.dataset.scoreField] || "";
    }
  );

  updateDifficultyTotal();
  updatePreAssessmentControls();
}

function resetPreAssessmentEditor() {
  renderScoreLevelMappings([]);
  preAssessmentQuestionCountInput.value = 10;
  const defaults = getDifficultyDefaults();

  difficultyInputs.forEach((input) => {
    input.value = defaults[input.dataset.difficultyField];
  });

  updateDifficultyTotal();
  updatePreAssessmentControls();
}

function resetForm() {
  loadedFramework = null;
  frameworkLevelsDirty = false;
  frameworkSelect.value = "";
  frameworkNameInput.value = "";
  endLevelNameInput.value = "";
  newFrameworkNameInput.value = "";
  confirmDeleteInput.checked = false;
  renderLevels();
  resetPreAssessmentEditor();
  updateDeleteControls();
  clearStatus();
}

function displayFramework(framework, message) {
  loadedFramework = framework;
  frameworkLevelsDirty = false;
  confirmDeleteInput.checked = false;
  newFrameworkNameInput.value = "";

  if (Array.from(frameworkSelect.options).some((option) => option.value === framework.id)) {
    frameworkSelect.value = framework.id;
  }

  frameworkNameInput.value = framework.name || "";
  endLevelNameInput.value = framework.endLevelName || "";
  renderLevels(framework.levels || []);
  renderPreAssessmentEditor();
  updateDeleteControls();
  setStatus(message);
}

function prepareNewFramework() {
  const frameworkName = normalizeText(newFrameworkNameInput.value);

  if (!frameworkName) {
    setStatus("Enter a new framework name first.", true);
    return;
  }

  loadedFramework = null;
  frameworkLevelsDirty = true;
  frameworkSelect.value = "";
  confirmDeleteInput.checked = false;
  frameworkNameInput.value = frameworkName;
  endLevelNameInput.value = "";
  renderLevels();
  addLevelRow();
  updateDeleteControls();
  resetPreAssessmentEditor();
  setStatus(`Ready to create ${frameworkName}. Add levels and save.`);
}

function readLevelRow(row, index) {
  const levelName = normalizeText(row.querySelector("[data-field='levelName']").value);
  const sequenceOrder = index + 1;
  const requiredPracticeCount = Number(
    row.querySelector("[data-field='requiredPracticeCount']").value
  );
  const minimumScore = Number(row.querySelector("[data-field='minimumScore']").value);
  const questionsPerPractice = Number(
    row.querySelector("[data-field='questionsPerPractice']").value
  );
  const difficultyLevel = row.querySelector("[data-field='difficultyLevel']").value;

  if (!levelName) {
    throw new Error(`Level ${index + 1} name is required.`);
  }

  if (!Number.isFinite(requiredPracticeCount)) {
    throw new Error(`Level ${index + 1} practice count is required.`);
  }

  if (!Number.isFinite(minimumScore)) {
    throw new Error(`Level ${index + 1} minimum score is required.`);
  }

  if (!Number.isFinite(questionsPerPractice)) {
    throw new Error(`Level ${index + 1} question count is required.`);
  }

  return {
    id: row.dataset.levelId || null,
    levelName,
    sequenceOrder,
    criteria: {
      requiredPracticeCount,
      minimumScore,
      questionsPerPractice,
      difficultyLevel
    }
  };
}

function readLevels() {
  updateLevelControls();

  return getLevelRows().map(readLevelRow);
}

async function saveFramework() {
  const name = normalizeText(frameworkNameInput.value);
  const endLevelName = normalizeText(endLevelNameInput.value);

  if (!name) {
    setStatus("Framework name is required.", true);
    return;
  }

  if (!endLevelName) {
    setStatus("End level name is required.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const changes = {
      name,
      endLevelName,
      levels: readLevels()
    };

    loadedFramework = loadedFramework
      ? await updateAssessmentFrameworkRecord(loadedFramework, changes)
      : await createAssessmentFrameworkRecord(changes);

    await refreshFrameworkOptions(loadedFramework.id);
    displayFramework(loadedFramework, "Assessment framework saved.");
  } catch (error) {
    setStatus(error.message || "Could not save assessment framework.", true);
  } finally {
    setBusy(false);
  }
}

function readDifficultySplit() {
  const difficultySplit = Object.fromEntries(
    assessmentFrameworkPreAssessmentDifficultyLevels.map((difficulty) => {
      const fieldName = `${difficulty}Percentage`;
      const input = difficultyInputs.find(
        (item) => item.dataset.difficultyField === fieldName
      );

      return [fieldName, Number(input?.value)];
    })
  );
  const total = Object.values(difficultySplit).reduce(
    (sum, percentage) => sum + percentage,
    0
  );

  if (
    Object.values(difficultySplit).some(
      (percentage) => !Number.isFinite(percentage)
    )
  ) {
    throw new Error("All difficulty percentages are required.");
  }

  if (Math.abs(total - 100) > 0.0001) {
    throw new Error("Difficulty percentages must total 100.");
  }

  return difficultySplit;
}

function readScoreLevelSplit() {
  return Object.fromEntries(
    assessmentFrameworkPreAssessmentScoreBands.map(({ field, label }) => {
      const select = scoreLevelMappings.querySelector(
        `[data-score-field="${field}"]`
      );

      if (!select?.value) {
        throw new Error(`Select a level for ${label}.`);
      }

      return [field, select.value];
    })
  );
}

async function savePreAssessment() {
  if (!loadedFramework?.id || !hasSavedLevels() || frameworkLevelsDirty) {
    setStatus(
      "Save the assessment framework levels before configuring pre-assessment.",
      true
    );
    return;
  }

  const numberOfQuestions = Number(preAssessmentQuestionCountInput.value);

  if (!Number.isInteger(numberOfQuestions) || numberOfQuestions < 1) {
    setStatus("Number of questions must be a positive whole number.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    await saveAssessmentFrameworkPreAssessment(loadedFramework.id, {
      numberOfQuestions,
      difficultySplit: readDifficultySplit(),
      scoreLevelSplit: readScoreLevelSplit()
    });

    const refreshedFramework = await getAssessmentFrameworkById(
      loadedFramework.id
    );

    displayFramework(
      refreshedFramework,
      "Framework-wide pre-assessment settings saved."
    );
  } catch (error) {
    setStatus(
      error.message || "Could not save pre-assessment settings.",
      true
    );
  } finally {
    setBusy(false);
  }
}

async function deleteFramework() {
  if (!loadedFramework) {
    setStatus("Load a saved framework before deleting.", true);
    return;
  }

  if (!confirmDeleteInput.checked) {
    setStatus("Confirm delete before deleting the selected framework.", true);
    return;
  }

  const deletedName = loadedFramework.name;

  setBusy(true);
  clearStatus();

  try {
    await deleteAssessmentFrameworkRecord(loadedFramework.id);
    resetForm();

    const frameworks = await refreshFrameworkOptions();

    if (frameworks.length > 0) {
      displayFramework(frameworks[0], `${deletedName} deleted. Loaded ${frameworks[0].name}.`);
      return;
    }

    setStatus(`${deletedName} deleted. No saved frameworks remain.`);
  } catch (error) {
    setStatus(error.message || "Could not delete selected framework.", true);
  } finally {
    setBusy(false);
  }
}

async function loadSelectedFramework() {
  const selectedFrameworkId = frameworkSelect.value;

  if (!selectedFrameworkId) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const framework = await getAssessmentFrameworkById(selectedFrameworkId);

    if (!framework) {
      throw new Error("Selected framework could not be found.");
    }

    displayFramework(framework, "Assessment framework loaded.");
  } catch (error) {
    setStatus(error.message || "Could not load selected framework.", true);
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  renderLevels();
  resetPreAssessmentEditor();

  try {
    const frameworks = await refreshFrameworkOptions();

    if (frameworks.length === 0) {
      setStatus("No saved frameworks found. Add a new framework to start.");
      return;
    }

    displayFramework(frameworks[0], `Loaded ${frameworks.length} saved frameworks.`);
  } catch (error) {
    setStatus(error.message || "Could not load saved frameworks.", true);
  }
}

frameworkSelect.addEventListener("change", loadSelectedFramework);
useNewFrameworkButton.addEventListener("click", prepareNewFramework);
addLevelButton.addEventListener("click", () => {
  addLevelRow();
  markFrameworkLevelsDirty();
});
saveButton.addEventListener("click", saveFramework);
deleteButton.addEventListener("click", deleteFramework);
confirmDeleteInput.addEventListener("change", updateDeleteControls);
endLevelNameInput.addEventListener("input", markFrameworkLevelsDirty);
difficultyInputs.forEach((input) => {
  input.addEventListener("input", updateDifficultyTotal);
});
savePreAssessmentButton.addEventListener("click", savePreAssessment);

initPage();
