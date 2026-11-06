import {adoptMcqFramework, adoptMcqPreAssessment} from "../../application/adopt_mcq_framework.js?v=20261105-mcq-preassessment-adoption-v2";
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
} from "../../assessment_framework_module.js?v=20261105-mcq-adoption-v1";

const mcqAdoptionSection = document.querySelector("#mcq-adoption-section");
const mcqFrameworkSelect = document.querySelector("#mcq-framework-select");
const applyMcqButton = document.querySelector("#apply-mcq-framework");
const undoMcqButton = document.querySelector("#undo-mcq-framework");
let mcqAdoptionSnapshot = null;
const preAssessmentMcqSection = document.querySelector("#mcq-pre-assessment-adoption");
const preAssessmentMcqSelect = document.querySelector("#pre-assessment-mcq-framework-select");
const applyMcqPreAssessmentButton = document.querySelector("#apply-mcq-pre-assessment");
const undoMcqPreAssessmentButton = document.querySelector("#undo-mcq-pre-assessment");
let preAssessmentMcqSnapshot = null;

const frameworkTypeSelect = document.querySelector("#framework-type");
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
  const essay = frameworkTypeSelect.value === "essay";
  const fill = frameworkTypeSelect.value === "fillInTheBlanks";
  document.querySelector("#pre-assessment-section").hidden = essay;
  document.querySelector("#fill-pre-assessment-options").hidden = !fill;
  document.querySelector("#mcq-pre-assessment-count").hidden = fill;
  document.querySelector("#mcq-pre-assessment-difficulty").hidden = fill;
  const canEdit = !essay && !pageBusy && levelsAreReady;

  preAssessmentFields.disabled = !canEdit;
  savePreAssessmentButton.disabled = !canEdit;
  updatePreAssessmentMcqControls();

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
  frameworkTypeSelect.disabled = isBusy || Boolean(loadedFramework);
  endLevelNameInput.disabled = isBusy;
  addLevelButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  updateLevelControls();
  updateDeleteControls();
  updatePreAssessmentControls();
  updateMcqAdoptionControls();
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
  renderMcqFrameworkOptions(frameworks);
  renderPreAssessmentMcqOptions(frameworks);
}

async function refreshFrameworkOptions(selectedFrameworkId = "") {
  const frameworks = await listAssessmentFrameworks();
  renderFrameworkOptions(frameworks, selectedFrameworkId);
  return frameworks;
}

function updateMcqAdoptionControls() {
  const eligible = ["essay", "fillInTheBlanks"].includes(frameworkTypeSelect.value);
  mcqAdoptionSection.hidden = !eligible;
  mcqFrameworkSelect.disabled = pageBusy || !eligible;
  applyMcqButton.disabled = pageBusy || !eligible || !mcqFrameworkSelect.value;
  undoMcqButton.disabled = pageBusy || !eligible || !mcqAdoptionSnapshot;
}

function clearMcqAdoption() {
  clearPreAssessmentMcqAdoption();
  mcqAdoptionSnapshot = null;
  mcqFrameworkSelect.value = "";
  updateMcqAdoptionControls();
}

function renderMcqFrameworkOptions(frameworks) {
  const selectedId = mcqFrameworkSelect.value;
  mcqFrameworkSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = "Select normal (MCQ) framework";
  mcqFrameworkSelect.append(placeholder);
  for (const framework of frameworks.filter(item => (item.frameworkType || "normal") === "normal")) {
    const option = document.createElement("option");
    option.value = framework.id; option.textContent = framework.name;
    mcqFrameworkSelect.append(option);
  }
  mcqFrameworkSelect.value = frameworks.some(item => item.id === selectedId && (item.frameworkType || "normal") === "normal") ? selectedId : "";
  updateMcqAdoptionControls();
}

function captureLevelDrafts() {
  return getLevelRows().map((row, index) => ({id: row.dataset.levelId || null,
    levelName: row.querySelector("[data-field='levelName']").value, sequenceOrder: index + 1,
    criteria: Object.fromEntries(["requiredPracticeCount", "minimumScore", "questionsPerPractice", "difficultyLevel"]
      .map(field => [field, row.querySelector("[data-field='" + field + "']").value]))}));
}

async function applyMcqFramework() {
  if (pageBusy || !["essay", "fillInTheBlanks"].includes(frameworkTypeSelect.value) || !mcqFrameworkSelect.value) return;
  const sourceId = mcqFrameworkSelect.value;
  setBusy(true); clearStatus();
  try {
    const source = await getAssessmentFrameworkById(sourceId);
    const snapshot = {endLevelName: endLevelNameInput.value, levels: captureLevelDrafts(), frameworkLevelsDirty};
    const draft = adoptMcqFramework(source, {frameworkType: frameworkTypeSelect.value, levels: snapshot.levels,
      preAssessment: loadedFramework?.preAssessment});
    mcqAdoptionSnapshot = snapshot;
    endLevelNameInput.value = draft.endLevelName;
    renderLevels(draft.levels);
    markFrameworkLevelsDirty();
    setStatus("MCQ settings applied to this form. You can edit them, undo this application, or save the framework.");
  } catch (error) {setStatus(error.message || "Could not apply MCQ framework settings.", true);}
  finally {setBusy(false);}
}

function undoMcqFramework() {
  if (pageBusy || !mcqAdoptionSnapshot) return;
  const snapshot = mcqAdoptionSnapshot;
  endLevelNameInput.value = snapshot.endLevelName;
  renderLevels(snapshot.levels);
  frameworkLevelsDirty = snapshot.frameworkLevelsDirty;
  clearMcqAdoption();
  updatePreAssessmentControls();
  setStatus("MCQ application undone. The previous form values have been restored. Save to keep any remaining changes.");
}

function updatePreAssessmentMcqControls() {
  const fill = frameworkTypeSelect.value === "fillInTheBlanks";
  const ready = fill && !pageBusy && hasSavedLevels() && !frameworkLevelsDirty;
  preAssessmentMcqSection.hidden = !fill;
  preAssessmentMcqSelect.disabled = !ready;
  applyMcqPreAssessmentButton.disabled = !ready || !preAssessmentMcqSelect.value;
  undoMcqPreAssessmentButton.disabled = !ready || !preAssessmentMcqSnapshot;
}

function clearPreAssessmentMcqAdoption() {
  preAssessmentMcqSnapshot = null;
  preAssessmentMcqSelect.value = "";
}

function renderPreAssessmentMcqOptions(frameworks) {
  const selectedId = preAssessmentMcqSelect.value;
  preAssessmentMcqSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = "Select MCQ pre-assessment source";
  preAssessmentMcqSelect.append(placeholder);
  for (const framework of frameworks.filter(item => (item.frameworkType || "normal") === "normal")) {
    const option = document.createElement("option"); option.value = framework.id;
    option.disabled = !framework.preAssessment;
    option.textContent = framework.name + (option.disabled ? " (no saved pre-assessment)" : "");
    preAssessmentMcqSelect.append(option);
  }
  preAssessmentMcqSelect.value = frameworks.some(item => item.id === selectedId && (item.frameworkType || "normal") === "normal" && item.preAssessment) ? selectedId : "";
  updatePreAssessmentMcqControls();
}

function capturePreAssessmentDraft() {
  return {difficultyLevel: document.querySelector("#fill-pre-assessment-difficulty").value,
    scoreLevelSplit: Object.fromEntries(Array.from(scoreLevelMappings.querySelectorAll("[data-score-field]"))
      .map(select => [select.dataset.scoreField, select.value]))};
}

function displayPreAssessmentDraft(draft) {
  document.querySelector("#fill-pre-assessment-difficulty").value = draft.difficultyLevel;
  scoreLevelMappings.querySelectorAll("[data-score-field]").forEach(select => {
    select.value = draft.scoreLevelSplit[select.dataset.scoreField] || "";
  });
}

async function applyMcqPreAssessment() {
  if (pageBusy || frameworkTypeSelect.value !== "fillInTheBlanks" || !hasSavedLevels() || frameworkLevelsDirty || !preAssessmentMcqSelect.value) return;
  const sourceId = preAssessmentMcqSelect.value;
  setBusy(true); clearStatus();
  try {
    const source = await getAssessmentFrameworkById(sourceId);
    const snapshot = capturePreAssessmentDraft();
    const draft = adoptMcqPreAssessment(source, {frameworkType: "fillInTheBlanks", levels: loadedFramework.levels, preAssessment: snapshot}, assessmentFrameworkPreAssessmentScoreBands);
    preAssessmentMcqSnapshot = snapshot;
    displayPreAssessmentDraft(draft);
    setStatus("MCQ score-to-level mapping applied to this form. Passage difficulty is unchanged. Edit or undo the mapping, then use Save Pre-assessment.");
  } catch (error) {setStatus(error.message || "Could not adopt MCQ pre-assessment settings.", true);}
  finally {setBusy(false);}
}

function undoMcqPreAssessment() {
  if (pageBusy || !preAssessmentMcqSnapshot || frameworkLevelsDirty) return;
  displayPreAssessmentDraft(preAssessmentMcqSnapshot);
  clearPreAssessmentMcqAdoption();
  updatePreAssessmentMcqControls();
  setStatus("Pre-assessment adoption undone. The previous form values are restored. Use Save Pre-assessment to save your changes.");
}

function getLevelRows() {
  return Array.from(levelsContainer.querySelectorAll(".level-row"));
}

function markFrameworkLevelsDirty() {
  clearPreAssessmentMcqAdoption();
  frameworkLevelsDirty = true;
  updatePreAssessmentControls();
}

function updateLevelControls() {
  const rows = getLevelRows();
  const fillHelp = document.querySelector("#fill-framework-help");
  if (fillHelp) fillHelp.hidden = frameworkTypeSelect.value !== "fillInTheBlanks";

  rows.forEach((row, index) => {
    row.querySelector("[data-field='sequenceOrder']").value = index + 1;
    for (const field of ["levelName", "requiredPracticeCount", "minimumScore"]) row.querySelector("[data-field='" + field + "']").disabled = pageBusy;
    const essay = frameworkTypeSelect.value === "essay";
    const fill = frameworkTypeSelect.value === "fillInTheBlanks";
    row.querySelector("[data-label='practice-count']").textContent = fill ? "Passages" : essay ? "Essays" : "Practices";
    for (const field of ["questionsPerPractice", "difficultyLevel"]) {
      const input = row.querySelector("[data-field='" + field + "']");
      if (essay && field === "questionsPerPractice") input.value = 1;
      if (fill && field === "questionsPerPractice") {input.value = 1; input.title = "Blank count is configured per grade in Fill-in-the-Blanks Question Generator.";}
      if (field === "questionsPerPractice") input.parentElement.hidden = fill;
      input.disabled = pageBusy || ((essay || fill) && field === "questionsPerPractice");
    }

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
    ["Easy", "Medium", "Hard"].find(value => value.toLowerCase() === String(criteria.difficultyLevel || "").toLowerCase()) || (frameworkTypeSelect.value === "essay" ? "Medium" : "Easy");
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
  document.querySelector("#fill-pre-assessment-difficulty").value = preAssessment?.difficultyLevel ?? "medium";

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
  document.querySelector("#fill-pre-assessment-difficulty").value = "medium";
  const defaults = getDifficultyDefaults();

  difficultyInputs.forEach((input) => {
    input.value = defaults[input.dataset.difficultyField];
  });

  updateDifficultyTotal();
  updatePreAssessmentControls();
}

function resetForm() {
  loadedFramework = null;
  clearMcqAdoption();
  frameworkTypeSelect.disabled = false;
  frameworkTypeSelect.value = "normal";
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
  clearMcqAdoption();
  loadedFramework = framework;
  frameworkLevelsDirty = false;
  confirmDeleteInput.checked = false;
  newFrameworkNameInput.value = "";

  if (Array.from(frameworkSelect.options).some((option) => option.value === framework.id)) {
    frameworkSelect.value = framework.id;
  }

  frameworkTypeSelect.value = framework.frameworkType || "normal";
  frameworkTypeSelect.disabled = true;
  frameworkNameInput.value = framework.name || "";
  endLevelNameInput.value = framework.endLevelName || "";
  renderLevels(framework.levels || []);
  renderPreAssessmentEditor();
  updateDeleteControls();
  updateMcqAdoptionControls();
  setStatus(message);
}

function prepareNewFramework() {
  const frameworkName = normalizeText(newFrameworkNameInput.value);

  if (!frameworkName) {
    setStatus("Enter a new framework name first.", true);
    return;
  }

  loadedFramework = null;
  clearMcqAdoption();
  frameworkTypeSelect.disabled = false;
  frameworkTypeSelect.value = "normal";
  frameworkLevelsDirty = true;
  frameworkSelect.value = "";
  confirmDeleteInput.checked = false;
  frameworkNameInput.value = frameworkName;
  endLevelNameInput.value = "";
  renderLevels();
  addLevelRow();
  updateDeleteControls();
  resetPreAssessmentEditor();
  updateMcqAdoptionControls();
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
      frameworkType: frameworkTypeSelect.value,
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

  if (frameworkTypeSelect.value !== "fillInTheBlanks" && (!Number.isInteger(numberOfQuestions) || numberOfQuestions < 1)) {
    setStatus("Number of questions must be a positive whole number.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    await saveAssessmentFrameworkPreAssessment(loadedFramework.id, frameworkTypeSelect.value === "fillInTheBlanks" ? {
      difficultyLevel: document.querySelector("#fill-pre-assessment-difficulty").value,
      scoreLevelSplit: readScoreLevelSplit()
    } : {
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

frameworkTypeSelect.addEventListener("change", () => {
  clearMcqAdoption();
  if (!loadedFramework && frameworkTypeSelect.value === "essay") {
    for (const row of getLevelRows()) row.querySelector("[data-field='difficultyLevel']").value = "Medium";
  }
  updateLevelControls();
  updatePreAssessmentControls();
  updateMcqAdoptionControls();
});
mcqFrameworkSelect.addEventListener("change", updateMcqAdoptionControls);
applyMcqButton.addEventListener("click", applyMcqFramework);
undoMcqButton.addEventListener("click", undoMcqFramework);
preAssessmentMcqSelect.addEventListener("change", updatePreAssessmentMcqControls);
applyMcqPreAssessmentButton.addEventListener("click", applyMcqPreAssessment);
undoMcqPreAssessmentButton.addEventListener("click", undoMcqPreAssessment);
initPage();
