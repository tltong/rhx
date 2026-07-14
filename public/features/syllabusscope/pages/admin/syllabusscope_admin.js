import {
  createSyllabusScopeRecord,
  deleteSyllabusScopeRecord,
  getSyllabusScopeById,
  listSyllabusScopes
} from "../../syllabusscope_module.js?v=20260715-module-api";

import {
  syllabusScopeGradeNumbers,
  syllabusScopeLevelTypes
} from "../../../../config/firebase/syllabusscope_schema.js?v=20260715-country-sections";

const countryInput = document.querySelector("#scope-country");
const countrySelect = document.querySelector("#scope-country-select");
const newButton = document.querySelector("#new-scope");
const saveButton = document.querySelector("#save-scope");
const deleteButton = document.querySelector("#delete-scope");
const confirmDeleteInput = document.querySelector("#confirm-delete-country");
const levelsContainer = document.querySelector("#levels-container");
const statusMessage = document.querySelector("#status-message");

let loadedScope = null;
let pageBusy = false;
let pendingCountry = "";

function normalizeCountry(country) {
  return country.trim().replace(/\s+/g, " ");
}

function buildCountryId(country) {
  return normalizeCountry(country).replace(/\//g, "_");
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
  confirmDeleteInput.disabled = pageBusy || !loadedScope;
  deleteButton.disabled = pageBusy || !loadedScope || !confirmDeleteInput.checked;
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  countryInput.disabled = isBusy;
  countrySelect.disabled = isBusy;
  newButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  updateDeleteControls();
}

function renderCountryOptions(scopes, selectedScopeId = "") {
  countrySelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = scopes.length
    ? `Select country (${scopes.length})`
    : "No saved countries";
  countrySelect.append(placeholder);

  scopes.forEach((scope) => {
    const option = document.createElement("option");
    option.value = scope.id;
    option.textContent = scope.country;
    option.dataset.country = scope.country;
    countrySelect.append(option);
  });

  countrySelect.value = selectedScopeId;
}

async function refreshCountryOptions(selectedScopeId = "") {
  const scopes = await listSyllabusScopes();
  renderCountryOptions(scopes, selectedScopeId);
  return scopes;
}

function renderLevelPanels(levels = {}) {
  levelsContainer.replaceChildren();

  syllabusScopeLevelTypes.forEach((levelType) => {
    const panel = document.createElement("section");
    panel.className = "level-panel";

    const heading = document.createElement("h2");
    heading.textContent = levelType;

    const gradeGrid = document.createElement("div");
    gradeGrid.className = "grade-grid";

    syllabusScopeGradeNumbers.forEach((gradeNumber) => {
      const option = document.createElement("label");
      option.className = "grade-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.level = levelType;
      checkbox.dataset.grade = gradeNumber;
      checkbox.checked = Boolean(levels[levelType]?.[gradeNumber]);

      const text = document.createElement("span");
      text.textContent = `Year ${gradeNumber}`;

      option.append(checkbox, text);
      gradeGrid.append(option);
    });

    panel.append(heading, gradeGrid);
    levelsContainer.append(panel);
  });
}

function readSelectedLevels() {
  const levels = {};
  const checkboxes = levelsContainer.querySelectorAll("input[type='checkbox']");

  checkboxes.forEach((checkbox) => {
    if (!checkbox.checked) {
      return;
    }

    const levelType = checkbox.dataset.level;
    const gradeNumber = checkbox.dataset.grade;

    if (!levels[levelType]) {
      levels[levelType] = {};
    }

    levels[levelType][gradeNumber] = true;
  });

  return levels;
}

function resetForm() {
  loadedScope = null;
  pendingCountry = "";
  countrySelect.value = "";
  countryInput.value = "";
  confirmDeleteInput.checked = false;
  renderLevelPanels();
  updateDeleteControls();
  clearStatus();
}

function displayScope(scope, message) {
  loadedScope = scope;
  pendingCountry = "";
  confirmDeleteInput.checked = false;

  if (Array.from(countrySelect.options).some((option) => option.value === scope.id)) {
    countrySelect.value = scope.id;
  }

  countryInput.value = "";
  renderLevelPanels(scope.levels);
  updateDeleteControls();
  setStatus(message);
}

async function saveScope() {
  const country = loadedScope?.country || pendingCountry || normalizeCountry(countryInput.value);

  if (!country) {
    setStatus("Country is required.", true);
    return;
  }

  const id = loadedScope?.id || buildCountryId(country);

  if (!id) {
    setStatus("Country must contain at least one letter or number.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    loadedScope = await createSyllabusScopeRecord({
      id,
      country,
      levels: readSelectedLevels()
    });

    await refreshCountryOptions(loadedScope.id);
    displayScope(loadedScope, "Syllabus scope saved.");
  } catch (error) {
    setStatus(error.message || "Could not save syllabus scope.", true);
  } finally {
    setBusy(false);
  }
}

async function deleteScope() {
  if (!loadedScope) {
    setStatus("Load a saved country before deleting.", true);
    return;
  }

  if (!confirmDeleteInput.checked) {
    setStatus("Confirm delete before deleting the selected country.", true);
    return;
  }

  const deletedCountry = loadedScope.country;

  setBusy(true);
  clearStatus();

  try {
    await deleteSyllabusScopeRecord(loadedScope.id);
    loadedScope = null;
    pendingCountry = "";
    confirmDeleteInput.checked = false;
    countryInput.value = "";
    renderLevelPanels();

    const scopes = await refreshCountryOptions();

    if (scopes.length > 0) {
      displayScope(scopes[0], `${deletedCountry} deleted. Loaded ${scopes[0].country}.`);
      return;
    }

    setStatus(`${deletedCountry} deleted. No saved countries remain.`);
  } catch (error) {
    setStatus(error.message || "Could not delete selected country.", true);
  } finally {
    setBusy(false);
    updateDeleteControls();
  }
}

async function loadSelectedScope() {
  const selectedScopeId = countrySelect.value;

  if (!selectedScopeId) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const scope = await getSyllabusScopeById(selectedScopeId);

    if (!scope) {
      throw new Error("Selected country could not be found.");
    }

    displayScope(scope, "Syllabus scope loaded.");
  } catch (error) {
    setStatus(error.message || "Could not load selected country.", true);
  } finally {
    setBusy(false);
  }
}

function handleCountryInput() {
  pendingCountry = "";
}

function prepareNewCountry() {
  const country = normalizeCountry(countryInput.value);

  if (!country) {
    setStatus("Enter a new country name first.", true);
    return;
  }

  loadedScope = null;
  pendingCountry = country;
  countrySelect.value = "";
  confirmDeleteInput.checked = false;
  renderLevelPanels();
  updateDeleteControls();
  setStatus(`Ready to create ${country}. Select years and save scope.`);
}

async function initPage() {
  renderLevelPanels();

  try {
    const scopes = await refreshCountryOptions();

    if (scopes.length === 0) {
      setStatus("No saved countries found. Add a new country to create the first scope.");
      return;
    }

    displayScope(scopes[0], `Loaded ${scopes.length} saved countries.`);
  } catch (error) {
    setStatus(error.message || "Could not load saved countries.", true);
  }
}

countrySelect.addEventListener("change", loadSelectedScope);
countryInput.addEventListener("input", handleCountryInput);
confirmDeleteInput.addEventListener("change", updateDeleteControls);
newButton.addEventListener("click", prepareNewCountry);
saveButton.addEventListener("click", saveScope);
deleteButton.addEventListener("click", deleteScope);

initPage();
