import {
  readSyllabusScopes
} from "/handler/syllabusscope_handler.js?v=20260711-new-syllabus-admin";
import {
  createSubtopicId,
  deleteSyllabusByScope,
  readSyllabusByScopeWithTopics,
  readSyllabusSubjects,
  saveSyllabusWithTopics
} from "/handler/syllabus_handler.js?v=20260711-year-field";

const countrySelect = document.querySelector("#country");
const levelSelect = document.querySelector("#level");
const yearSelect = document.querySelector("#year");
const subjectSelect = document.querySelector("#subject-select");
const newSubjectInput = document.querySelector("#new-subject");
const loadButton = document.querySelector("#load-syllabus");
const saveButton = document.querySelector("#save-syllabus");
const confirmDeleteSubjectCheckbox = document.querySelector("#confirm-delete-subject");
const deleteSubjectButton = document.querySelector("#delete-subject");
const addTopicButton = document.querySelector("#add-topic");
const topicsList = document.querySelector("#topics-list");
const statusEl = document.querySelector("#syllabus-status");
const topicTemplate = document.querySelector("#topic-template");
const subtopicTemplate = document.querySelector("#subtopic-template");

let syllabusScopes = [];
let currentSyllabusId = "";

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  document.querySelectorAll("button, input, select").forEach((element) => {
    element.disabled = isBusy;
  });

  if (!isBusy) {
    refreshDeleteSubjectState();
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

function clearSelect(selectEl, placeholder) {
  selectEl.innerHTML = "";
  selectEl.append(createOption("", placeholder));
}

function normalizeYearKey(yearKey) {
  const match = String(yearKey).match(/^grade_(\d+)$/);

  return match ? match[1] : String(yearKey);
}

function getSelectedScope() {
  return syllabusScopes.find((scope) => scope.country === countrySelect.value) || null;
}

function getLevelYears(scope, level) {
  const years = scope?.levels?.[level] || {};

  return Object.entries(years)
    .filter(([, isSelected]) => Boolean(isSelected))
    .map(([year]) => normalizeYearKey(year))
    .filter((year, index, list) => list.indexOf(year) === index)
    .sort((left, right) => Number(left) - Number(right));
}

function getAvailableLevels(scope) {
  return Object.keys(scope?.levels || {})
    .filter((level) => getLevelYears(scope, level).length > 0)
    .sort();
}

function resetEditor() {
  currentSyllabusId = "";
  confirmDeleteSubjectCheckbox.checked = false;
  refreshDeleteSubjectState();
  renderTopics([]);
}

function populateCountries() {
  clearSelect(countrySelect, "Select country");

  syllabusScopes
    .filter((scope) => getAvailableLevels(scope).length > 0)
    .sort((left, right) => (left.country || "").localeCompare(right.country || ""))
    .forEach((scope) => {
      countrySelect.append(createOption(scope.country));
    });
}

function populateLevels() {
  const scope = getSelectedScope();

  clearSelect(levelSelect, "Select level");
  clearSelect(yearSelect, "Select year");

  getAvailableLevels(scope).forEach((level) => {
    levelSelect.append(createOption(level, `${level.charAt(0).toUpperCase()}${level.slice(1)}`));
  });
}

function populateYears() {
  const scope = getSelectedScope();

  clearSelect(yearSelect, "Select year");

  getLevelYears(scope, levelSelect.value).forEach((year) => {
    yearSelect.append(createOption(year, `Year ${year}`));
  });
}

function getScopeSelection() {
  const country = countrySelect.value;
  const level = levelSelect.value;
  const year = Number(yearSelect.value);

  if (!country || !level || !yearSelect.value) {
    throw new Error("Country, level, and year must be selected.");
  }

  return {
    country,
    level,
    year
  };
}

function getSubjectSelection() {
  return newSubjectInput.value.trim() || subjectSelect.value;
}

function getExistingSubjectSelection() {
  if (newSubjectInput.value.trim()) {
    throw new Error("Clear the new subject field before deleting an existing subject.");
  }

  if (!subjectSelect.value) {
    throw new Error("Select an existing subject to delete.");
  }

  return subjectSelect.value;
}

function refreshDeleteSubjectState() {
  deleteSubjectButton.disabled = !confirmDeleteSubjectCheckbox.checked
    || !subjectSelect.value
    || Boolean(newSubjectInput.value.trim());
}

function populateSubjects(subjects = [], selectedSubject = "") {
  clearSelect(subjectSelect, "Select subject");

  subjects.forEach((subject) => {
    subjectSelect.append(createOption(subject));
  });

  if (selectedSubject && subjects.includes(selectedSubject)) {
    subjectSelect.value = selectedSubject;
  }
}

async function loadSubjectOptions(selectedSubject = "") {
  populateSubjects([]);

  if (!countrySelect.value || !levelSelect.value || !yearSelect.value) {
    return;
  }

  setStatus("Loading subjects...");

  try {
    const subjects = await readSyllabusSubjects(getScopeSelection());

    populateSubjects(subjects, selectedSubject);
    setStatus(subjects.length > 0
      ? "Select an existing subject or enter a new subject."
      : "No subjects yet for this scope. Enter a new subject.");
  } catch (error) {
    showError(error, "Could not load subjects.");
  }
}

function renderEmptyState() {
  topicsList.innerHTML = "";

  const empty = document.createElement("div");

  empty.className = "empty-state";
  empty.textContent = "No topics yet.";
  topicsList.append(empty);
}

function removeEmptyState() {
  topicsList.querySelector(".empty-state")?.remove();
}

function createSubtopicRow(subtopicId = "", subtopicName = "") {
  const fragment = subtopicTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".subtopic-row");
  const input = fragment.querySelector(".subtopic-name");
  const removeButton = fragment.querySelector(".remove-subtopic");

  row.dataset.subtopicId = subtopicId;
  input.value = subtopicName;
  removeButton.addEventListener("click", () => {
    row.remove();
  });

  return fragment;
}

function createTopicCard(topic = {}) {
  const fragment = topicTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".topic-card");
  const topicNameInput = fragment.querySelector(".topic-name");
  const subtopicsList = fragment.querySelector(".subtopics-list");
  const addSubtopicButton = fragment.querySelector(".add-subtopic");
  const removeTopicButton = fragment.querySelector(".remove-topic");

  card.dataset.topicId = topic.id || "";
  topicNameInput.value = topic.topicName || "";

  Object.entries(topic.subtopics || {}).forEach(([subtopicId, subtopicName]) => {
    subtopicsList.append(createSubtopicRow(subtopicId, subtopicName));
  });

  addSubtopicButton.addEventListener("click", () => {
    subtopicsList.append(createSubtopicRow());
  });

  removeTopicButton.addEventListener("click", () => {
    card.remove();

    if (topicsList.querySelectorAll(".topic-card").length === 0) {
      renderEmptyState();
    }
  });

  return fragment;
}

function addTopic(topic = {}) {
  removeEmptyState();
  topicsList.append(createTopicCard(topic));
}

function renderTopics(topics = []) {
  topicsList.innerHTML = "";

  if (topics.length === 0) {
    renderEmptyState();
    return;
  }

  topics.forEach((topic) => {
    addTopic(topic);
  });
}

function getSyllabusSelection() {
  const scope = getScopeSelection();
  const subject = getSubjectSelection();

  if (!subject) {
    throw new Error("Country, level, year, and subject must be selected.");
  }

  return {
    ...scope,
    subject
  };
}

function collectTopics() {
  const topics = [];

  topicsList.querySelectorAll(".topic-card").forEach((card) => {
    const topicName = card.querySelector(".topic-name").value.trim();
    const subtopics = {};

    card.querySelectorAll(".subtopic-row").forEach((row) => {
      const subtopicName = row.querySelector(".subtopic-name").value.trim();

      if (!subtopicName) {
        return;
      }

      subtopics[row.dataset.subtopicId || createSubtopicId()] = subtopicName;
    });

    if (!topicName && Object.keys(subtopics).length === 0) {
      return;
    }

    if (!topicName) {
      throw new Error("Every topic with subtopics must have a topic name.");
    }

    topics.push({
      id: card.dataset.topicId || null,
      topicName,
      subtopics
    });
  });

  return topics;
}

async function loadSyllabus() {
  setBusy(true);
  setStatus("Loading syllabus...");

  try {
    const selection = getSyllabusSelection();
    const result = await readSyllabusByScopeWithTopics(selection);

    currentSyllabusId = result.syllabus?.id || "";
    renderTopics(result.topics || []);
    setStatus(result.syllabus
      ? `Loaded ${selection.subject} syllabus.`
      : "No syllabus exists for this scope yet.");
  } catch (error) {
    showError(error, "Could not load syllabus.");
  } finally {
    setBusy(false);
  }
}

async function saveSyllabus() {
  setBusy(true);
  setStatus("Saving syllabus...");

  try {
    const selection = getSyllabusSelection();
    const topics = collectTopics();
    const result = await saveSyllabusWithTopics({
      ...selection,
      topics
    });

    currentSyllabusId = result.syllabus?.id || currentSyllabusId;
    await loadSubjectOptions(selection.subject);
    newSubjectInput.value = "";
    renderTopics(result.topics || []);
    setStatus(`Saved ${topics.length} topics for ${selection.subject}.`);
  } catch (error) {
    showError(error, "Could not save syllabus.");
  } finally {
    setBusy(false);
  }
}

async function deleteSelectedSubject() {
  if (!confirmDeleteSubjectCheckbox.checked) {
    return;
  }

  setBusy(true);
  setStatus("Deleting subject...");

  try {
    const selection = {
      ...getScopeSelection(),
      subject: getExistingSubjectSelection()
    };
    const result = await deleteSyllabusByScope(selection);

    await loadSubjectOptions();
    subjectSelect.value = "";
    newSubjectInput.value = "";
    confirmDeleteSubjectCheckbox.checked = false;
    currentSyllabusId = "";
    renderTopics([]);
    setStatus(result.deleted
      ? `Deleted ${selection.subject} and its topics.`
      : `No syllabus found for ${selection.subject}.`);
  } catch (error) {
    showError(error, "Could not delete subject.");
  } finally {
    setBusy(false);
  }
}

async function loadScopeOptions() {
  setBusy(true);
  setStatus("Loading syllabus scope...");

  try {
    syllabusScopes = await readSyllabusScopes();
    populateCountries();
    populateLevels();
    populateYears();
    await loadSubjectOptions();
    resetEditor();
    setStatus(syllabusScopes.length > 0
      ? "Select a country, level, year, and subject."
      : "No syllabus scope records found.");
  } catch (error) {
    showError(error, "Could not load syllabus scope.");
  } finally {
    setBusy(false);
  }
}

countrySelect.addEventListener("change", () => {
  populateLevels();
  populateYears();
  loadSubjectOptions();
  resetEditor();
});

levelSelect.addEventListener("change", () => {
  populateYears();
  loadSubjectOptions();
  resetEditor();
});

yearSelect.addEventListener("change", () => {
  loadSubjectOptions();
  resetEditor();
});

subjectSelect.addEventListener("change", () => {
  if (subjectSelect.value) {
    newSubjectInput.value = "";
  }

  refreshDeleteSubjectState();
  resetEditor();
});

newSubjectInput.addEventListener("input", () => {
  if (newSubjectInput.value.trim()) {
    subjectSelect.value = "";
  }

  refreshDeleteSubjectState();
  resetEditor();
});
confirmDeleteSubjectCheckbox.addEventListener("change", refreshDeleteSubjectState);
loadButton.addEventListener("click", loadSyllabus);
saveButton.addEventListener("click", saveSyllabus);
deleteSubjectButton.addEventListener("click", deleteSelectedSubject);
addTopicButton.addEventListener("click", () => addTopic());

loadScopeOptions();
