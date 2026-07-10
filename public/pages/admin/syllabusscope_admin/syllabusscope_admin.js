import {
  buildSyllabusScopeDocumentId,
  deleteSyllabusScope,
  getSyllabusScopeGradeNumbers,
  getSyllabusScopeLevelTypes,
  readSyllabusScopes,
  writeSyllabusScope
} from "/handler/syllabusscope_handler.js?v=20260711-skip-empty-levels";

const addCountryButton = document.querySelector("#add-country");
const saveScopesButton = document.querySelector("#save-scopes");
const countriesList = document.querySelector("#countries-list");
const statusEl = document.querySelector("#syllabusscope-status");
const countryTemplate = document.querySelector("#country-template");
const levelTemplate = document.querySelector("#level-template");
const gradeCheckboxTemplate = document.querySelector("#grade-checkbox-template");
const levelTypes = getSyllabusScopeLevelTypes();
const gradeNumbers = getSyllabusScopeGradeNumbers();

let deletedCountryIds = new Set();

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  document.querySelectorAll("button, input").forEach((element) => {
    element.disabled = isBusy;
  });

  if (!isBusy) {
    getCountryCards().forEach(refreshLevelButtons);
  }
}

function showError(error, fallbackMessage) {
  console.error(error);
  setStatus(error.message || fallbackMessage, true);
}

function renderEmptyState() {
  countriesList.innerHTML = "";

  const empty = document.createElement("div");

  empty.className = "empty-state";
  empty.textContent = "No countries yet.";
  countriesList.append(empty);
}

function removeEmptyState() {
  countriesList.querySelector(".empty-state")?.remove();
}

function formatLevelType(levelType) {
  return `${levelType.charAt(0).toUpperCase()}${levelType.slice(1)}`;
}

function getCountryCards() {
  return [...countriesList.querySelectorAll(".country-card")];
}

function hasLevel(card, levelType) {
  return Boolean(card.querySelector(`.level-card[data-level-type="${levelType}"]`));
}

function refreshLevelButtons(card) {
  levelTypes.forEach((levelType) => {
    const button = card.querySelector(`.add-level[data-level-type="${levelType}"]`);

    if (button) {
      button.disabled = hasLevel(card, levelType);
    }
  });
}

function isGradeSelected(grades, gradeNumber) {
  return Boolean(grades?.[gradeNumber] || grades?.[`grade_${gradeNumber}`]);
}

function renderGradeCheckboxes(levelCard, grades = {}) {
  const gradeOptions = levelCard.querySelector(".grade-options");

  gradeOptions.innerHTML = "";

  gradeNumbers.forEach((gradeNumber) => {
    const fragment = gradeCheckboxTemplate.content.cloneNode(true);
    const checkbox = fragment.querySelector(".grade-checkbox");
    const labelText = fragment.querySelector("span");

    checkbox.value = gradeNumber;
    checkbox.checked = isGradeSelected(grades, gradeNumber);
    labelText.textContent = `Grade ${gradeNumber}`;
    gradeOptions.append(fragment);
  });
}

function addLevelToCountry(card, levelType, grades = {}) {
  const type = levelType.toLowerCase();

  if (hasLevel(card, type)) {
    return;
  }

  const levelsList = card.querySelector(".levels-list");
  const fragment = levelTemplate.content.cloneNode(true);
  const levelCard = fragment.querySelector(".level-card");
  const title = fragment.querySelector("h3");
  const removeLevelButton = fragment.querySelector(".remove-level");

  levelCard.dataset.levelType = type;
  title.textContent = formatLevelType(type);
  renderGradeCheckboxes(levelCard, grades);

  removeLevelButton.addEventListener("click", () => {
    levelCard.remove();
    refreshLevelButtons(card);
  });

  levelsList.append(fragment);
  refreshLevelButtons(card);
}

function createLevelButton(card, levelType) {
  const button = document.createElement("button");

  button.className = "secondary add-level";
  button.dataset.levelType = levelType;
  button.type = "button";
  button.textContent = `Add ${formatLevelType(levelType)} Level`;
  button.addEventListener("click", () => {
    addLevelToCountry(card, levelType);
  });

  return button;
}

function addCountry(scope = {}) {
  removeEmptyState();

  const fragment = countryTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".country-card");
  const countryInput = fragment.querySelector(".country-name");
  const removeCountryButton = fragment.querySelector(".remove-country");
  const levelToolbar = fragment.querySelector(".level-toolbar");
  const levels = scope.levels || {};

  card.dataset.originalDocumentId = scope.id || "";
  countryInput.value = scope.country || "";

  levelTypes.forEach((levelType) => {
    levelToolbar.append(createLevelButton(card, levelType));
  });

  Object.entries(levels).forEach(([levelType, grades]) => {
    addLevelToCountry(card, levelType, grades);
  });

  removeCountryButton.addEventListener("click", () => {
    if (card.dataset.originalDocumentId) {
      deletedCountryIds.add(card.dataset.originalDocumentId);
    }

    card.remove();

    if (getCountryCards().length === 0) {
      renderEmptyState();
    }
  });

  countriesList.append(fragment);
  refreshLevelButtons(card);
}

function renderCountries(scopes = []) {
  countriesList.innerHTML = "";

  if (scopes.length === 0) {
    renderEmptyState();
    return;
  }

  scopes
    .slice()
    .sort((left, right) => (left.country || "").localeCompare(right.country || ""))
    .forEach((scope) => addCountry(scope));
}

function collectCountryScope(card) {
  const countryInput = card.querySelector(".country-name");
  const country = countryInput.value.trim();
  const levels = {};

  if (!country) {
    throw new Error("Every country must have a country name.");
  }

  card.querySelectorAll(".level-card").forEach((levelCard) => {
    const levelType = levelCard.dataset.levelType;
    const grades = {};

    levelCard.querySelectorAll(".grade-checkbox:checked").forEach((checkbox) => {
      grades[checkbox.value] = true;
    });

    if (Object.keys(grades).length > 0) {
      levels[levelType] = grades;
    }
  });

  return {
    country,
    levels,
    originalDocumentId: card.dataset.originalDocumentId || ""
  };
}

async function loadScopes() {
  setBusy(true);
  setStatus("Loading syllabus scopes...");

  try {
    const scopes = await readSyllabusScopes();

    deletedCountryIds = new Set();
    renderCountries(scopes);
    setStatus(`Loaded ${scopes.length} countries.`);
  } catch (error) {
    showError(error, "Could not load syllabus scopes.");
  } finally {
    setBusy(false);
  }
}

async function saveScopes() {
  setBusy(true);
  setStatus("Saving syllabus scopes...");

  try {
    const scopes = getCountryCards().map(collectCountryScope);
    const nextDocumentIds = new Set();

    scopes.forEach((scope) => {
      const documentId = buildSyllabusScopeDocumentId(scope.country);

      if (nextDocumentIds.has(documentId)) {
        throw new Error(`Duplicate country: ${scope.country}.`);
      }

      nextDocumentIds.add(documentId);

      if (scope.originalDocumentId && scope.originalDocumentId !== documentId) {
        deletedCountryIds.add(scope.originalDocumentId);
      }
    });

    for (const documentId of deletedCountryIds) {
      await deleteSyllabusScope(documentId);
    }

    for (const scope of scopes) {
      await writeSyllabusScope({
        country: scope.country,
        levels: scope.levels
      });
    }

    const savedScopes = await readSyllabusScopes();

    deletedCountryIds = new Set();
    renderCountries(savedScopes);
    setStatus(`Saved ${scopes.length} countries.`);
  } catch (error) {
    showError(error, "Could not save syllabus scopes.");
  } finally {
    setBusy(false);
  }
}

addCountryButton.addEventListener("click", () => {
  addCountry();
});

saveScopesButton.addEventListener("click", saveScopes);

loadScopes();
