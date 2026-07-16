import {
  createSyllabusRecord,
  deleteSyllabusRecord,
  getSyllabusById,
  listSyllabuses,
  updateSyllabusRecord
} from "../../syllabus_module.js?v=20260715-scope-subject";

import {
  listSyllabusScopes
} from "../../../syllabusscope/syllabusscope_module.js?v=20260715-scope-subject";

import {
  listAssessmentFrameworks
} from "../../../assessment_framework/assessment_framework_module.js?v=20260715-scope-subject";

const syllabusSelect = document.querySelector("#syllabus-select");
const useNewSyllabusButton = document.querySelector("#use-new-syllabus");
const countrySelect = document.querySelector("#country-select");
const levelSelect = document.querySelector("#level-select");
const yearSelect = document.querySelector("#year-select");
const subjectSelect = document.querySelector("#subject-select");
const newSubjectInput = document.querySelector("#new-subject-input");
const useNewSubjectButton = document.querySelector("#use-new-subject");
const assessmentFrameworkSelect = document.querySelector("#assessment-framework-select");
const activeInput = document.querySelector("#active-input");
const addTopicButton = document.querySelector("#add-topic");
const topicsContainer = document.querySelector("#topics-container");
const topicTemplate = document.querySelector("#topic-template");
const subtopicTemplate = document.querySelector("#subtopic-template");
const saveButton = document.querySelector("#save-syllabus");
const deleteButton = document.querySelector("#delete-syllabus");
const confirmDeleteInput = document.querySelector("#confirm-delete-syllabus");
const statusMessage = document.querySelector("#status-message");

let loadedSyllabus = null;
let syllabusScopes = [];
let subjects = [];
let pageBusy = false;

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
  confirmDeleteInput.disabled = pageBusy || !loadedSyllabus;
  deleteButton.disabled = pageBusy || !loadedSyllabus || !confirmDeleteInput.checked;
}

function updateScopeControls() {
  const isScopeLocked = pageBusy || Boolean(loadedSyllabus);

  countrySelect.disabled = isScopeLocked;
  levelSelect.disabled = isScopeLocked;
  yearSelect.disabled = isScopeLocked;
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  [
    syllabusSelect,
    useNewSyllabusButton,
    subjectSelect,
    newSubjectInput,
    useNewSubjectButton,
    assessmentFrameworkSelect,
    activeInput,
    addTopicButton,
    saveButton
  ].forEach((control) => {
    control.disabled = isBusy;
  });
  updateScopeControls();
  updateDeleteControls();
}

function clearSelect(select, placeholderText) {
  select.replaceChildren();

  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholderText;
  select.append(option);
}

function renderSyllabusOptions(syllabuses, selectedSyllabusId = "") {
  clearSelect(
    syllabusSelect,
    syllabuses.length ? `Select syllabus (${syllabuses.length})` : "No saved syllabuses"
  );

  syllabuses.forEach((syllabus) => {
    const option = document.createElement("option");
    option.value = syllabus.id;
    option.textContent = [
      syllabus.country,
      syllabus.level,
      `Year ${syllabus.year}`,
      syllabus.subject
    ].join(" / ");
    syllabusSelect.append(option);
  });

  syllabusSelect.value = selectedSyllabusId;
}

async function refreshSyllabusOptions(selectedSyllabusId = "") {
  const syllabuses = await listSyllabuses();
  renderSyllabusOptions(syllabuses, selectedSyllabusId);
  subjects = getSubjectsFromSyllabuses(syllabuses);
  renderSubjectOptions(subjects, subjectSelect.value);
  return syllabuses;
}

function renderCountryOptions() {
  clearSelect(
    countrySelect,
    syllabusScopes.length ? "Select country" : "No syllabus scope countries"
  );

  syllabusScopes.forEach((scope) => {
    const option = document.createElement("option");
    option.value = scope.country;
    option.textContent = scope.country;
    countrySelect.append(option);
  });
}

function getSelectedScope() {
  return syllabusScopes.find((scope) => scope.country === countrySelect.value) || null;
}

function getAvailableLevels(scope) {
  if (!scope?.levels) {
    return [];
  }

  return Object.entries(scope.levels)
    .filter(([, years]) => Object.values(years || {}).some(Boolean))
    .map(([level]) => level);
}

function getAvailableYears(scope, level) {
  if (!scope?.levels?.[level]) {
    return [];
  }

  return Object.entries(scope.levels[level])
    .filter(([, isEnabled]) => Boolean(isEnabled))
    .map(([year]) => Number(year))
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
}

function renderLevelOptions(selectedLevel = "") {
  const scope = getSelectedScope();
  const levels = getAvailableLevels(scope);

  clearSelect(levelSelect, levels.length ? "Select level" : "No levels");

  levels.forEach((level) => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level;
    levelSelect.append(option);
  });

  levelSelect.value = selectedLevel;
}

function renderYearOptions(selectedYear = "") {
  const scope = getSelectedScope();
  const years = getAvailableYears(scope, levelSelect.value);

  clearSelect(yearSelect, years.length ? "Select year" : "No years");

  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `Year ${year}`;
    yearSelect.append(option);
  });

  yearSelect.value = selectedYear === "" ? "" : String(selectedYear);
}

function renderFrameworkOptions(frameworks, selectedFrameworkId = "") {
  clearSelect(
    assessmentFrameworkSelect,
    frameworks.length ? "Select framework" : "No assessment frameworks"
  );

  frameworks.forEach((framework) => {
    const option = document.createElement("option");
    option.value = framework.id;
    option.textContent = framework.name;
    assessmentFrameworkSelect.append(option);
  });

  assessmentFrameworkSelect.value = selectedFrameworkId || "";
}

function getSubjectsFromSyllabuses(syllabuses) {
  return Array.from(
    new Set(
      syllabuses
        .map((syllabus) => normalizeText(syllabus.subject))
        .filter(Boolean)
    )
  ).sort((first, second) => first.localeCompare(second));
}

function ensureSubjectOption(subject) {
  const normalizedSubject = normalizeText(subject);

  if (!normalizedSubject) {
    return;
  }

  if (!subjects.includes(normalizedSubject)) {
    subjects = [...subjects, normalizedSubject]
      .sort((first, second) => first.localeCompare(second));
  }
}

function renderSubjectOptions(nextSubjects, selectedSubject = "") {
  const selected = normalizeText(selectedSubject);
  const availableSubjects = [...nextSubjects];

  if (selected && !availableSubjects.includes(selected)) {
    availableSubjects.push(selected);
    availableSubjects.sort((first, second) => first.localeCompare(second));
  }

  clearSelect(
    subjectSelect,
    availableSubjects.length ? "Select subject" : "No saved subjects"
  );

  availableSubjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    subjectSelect.append(option);
  });

  subjectSelect.value = selected;
}

function addSubtopicRow(container, subtopic = {}) {
  const fragment = subtopicTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".subtopic-row");

  row.dataset.subtopicId = subtopic.id || "";
  row.querySelector("[data-field='subtopicName']").value = subtopic.name || "";
  row.querySelector("[data-action='remove-subtopic']").addEventListener("click", () => {
    row.remove();
  });

  container.append(row);
}

function addTopicRow(topic = {}) {
  const fragment = topicTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".topic-row");
  const subtopicsContainer = row.querySelector("[data-role='subtopics']");

  row.dataset.topicId = topic.id || "";
  row.querySelector("[data-field='topicName']").value = topic.topicName || "";
  row.querySelector("[data-action='remove-topic']").addEventListener("click", () => {
    row.remove();
  });
  row.querySelector("[data-action='add-subtopic']").addEventListener("click", () => {
    addSubtopicRow(subtopicsContainer);
  });

  Object.entries(topic.subtopics || {}).forEach(([id, name]) => {
    addSubtopicRow(subtopicsContainer, { id, name });
  });

  topicsContainer.append(row);
}

function renderTopics(topics = []) {
  topicsContainer.replaceChildren();
  topics.forEach((topic) => addTopicRow(topic));
}

function resetForm() {
  loadedSyllabus = null;
  syllabusSelect.value = "";
  countrySelect.value = "";
  renderLevelOptions();
  renderYearOptions();
  subjectSelect.value = "";
  newSubjectInput.value = "";
  assessmentFrameworkSelect.value = "";
  activeInput.checked = false;
  confirmDeleteInput.checked = false;
  renderTopics();
  updateScopeControls();
  updateDeleteControls();
  clearStatus();
}

function prepareNewSyllabus() {
  loadedSyllabus = null;
  syllabusSelect.value = "";
  confirmDeleteInput.checked = false;
  countrySelect.value = "";
  renderLevelOptions();
  renderYearOptions();
  subjectSelect.value = "";
  newSubjectInput.value = "";
  assessmentFrameworkSelect.value = "";
  activeInput.checked = false;
  renderTopics();
  addTopicRow();
  updateScopeControls();
  updateDeleteControls();
  setStatus("Ready to create a new syllabus. Select scope, subject, framework, and topics.");
}

function displaySyllabus(syllabus, message) {
  loadedSyllabus = syllabus;
  confirmDeleteInput.checked = false;

  if (Array.from(syllabusSelect.options).some((option) => option.value === syllabus.id)) {
    syllabusSelect.value = syllabus.id;
  }

  countrySelect.value = syllabus.country || "";
  renderLevelOptions(syllabus.level || "");
  renderYearOptions(syllabus.year || "");
  ensureSubjectOption(syllabus.subject);
  renderSubjectOptions(subjects, syllabus.subject || "");
  newSubjectInput.value = "";
  assessmentFrameworkSelect.value = syllabus.assessmentFrameworkId || "";
  activeInput.checked = Boolean(syllabus.active);
  renderTopics(syllabus.topics || []);
  updateScopeControls();
  updateDeleteControls();
  setStatus(message);
}

function useNewSubject() {
  const subject = normalizeText(newSubjectInput.value);

  if (!subject) {
    setStatus("Enter a new subject first.", true);
    return;
  }

  ensureSubjectOption(subject);
  renderSubjectOptions(subjects, subject);
  newSubjectInput.value = "";
  setStatus(`Subject selected: ${subject}.`);
}

function getNextSubtopicId(subtopics, fallbackIndex) {
  let index = fallbackIndex;

  while (subtopics[`subtopic_${index}`]) {
    index += 1;
  }

  return `subtopic_${index}`;
}

function readTopics() {
  return Array.from(topicsContainer.querySelectorAll(".topic-row"))
    .map((topicRow, topicIndex) => {
      const topicName = normalizeText(topicRow.querySelector("[data-field='topicName']").value);

      if (!topicName) {
        throw new Error(`Topic ${topicIndex + 1} name is required.`);
      }

      const subtopics = {};
      const subtopicRows = Array.from(topicRow.querySelectorAll(".subtopic-row"));

      subtopicRows.forEach((subtopicRow, subtopicIndex) => {
        const subtopicName = normalizeText(
          subtopicRow.querySelector("[data-field='subtopicName']").value
        );

        if (!subtopicName) {
          throw new Error(
            `Topic ${topicIndex + 1}, subtopic ${subtopicIndex + 1} is required.`
          );
        }

        const existingId = normalizeText(subtopicRow.dataset.subtopicId);
        const subtopicId = existingId || getNextSubtopicId(subtopics, subtopicIndex + 1);
        subtopics[subtopicId] = subtopicName;
      });

      return {
        id: topicRow.dataset.topicId || null,
        topicName,
        subtopics
      };
    });
}

async function saveSyllabus() {
  const country = countrySelect.value;
  const level = levelSelect.value;
  const year = Number(yearSelect.value);
  const subject = normalizeText(subjectSelect.value);
  const assessmentFrameworkId = assessmentFrameworkSelect.value || null;

  if (!country) {
    setStatus("Country is required.", true);
    return;
  }

  if (!level) {
    setStatus("Level is required.", true);
    return;
  }

  if (!Number.isFinite(year)) {
    setStatus("Year is required.", true);
    return;
  }

  if (!subject) {
    setStatus("Subject is required.", true);
    return;
  }

  if (!assessmentFrameworkId) {
    setStatus("Assessment framework is required.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const changes = {
      country,
      level,
      year,
      subject,
      active: activeInput.checked,
      assessmentFrameworkId,
      topics: readTopics()
    };

    loadedSyllabus = loadedSyllabus
      ? await updateSyllabusRecord(loadedSyllabus, changes)
      : await createSyllabusRecord(changes);

    await refreshSyllabusOptions(loadedSyllabus.id);
    displaySyllabus(loadedSyllabus, "Syllabus saved.");
  } catch (error) {
    setStatus(error.message || "Could not save syllabus.", true);
  } finally {
    setBusy(false);
  }
}

async function deleteSyllabus() {
  if (!loadedSyllabus) {
    setStatus("Load a saved syllabus before deleting.", true);
    return;
  }

  if (!confirmDeleteInput.checked) {
    setStatus("Confirm delete before deleting the selected syllabus.", true);
    return;
  }

  const deletedName = [
    loadedSyllabus.country,
    loadedSyllabus.level,
    `Year ${loadedSyllabus.year}`,
    loadedSyllabus.subject
  ].join(" / ");

  setBusy(true);
  clearStatus();

  try {
    await deleteSyllabusRecord(loadedSyllabus.id);
    resetForm();

    const syllabuses = await refreshSyllabusOptions();

    if (syllabuses.length > 0) {
      displaySyllabus(syllabuses[0], `${deletedName} deleted. Loaded next syllabus.`);
      return;
    }

    setStatus(`${deletedName} deleted. No saved syllabuses remain.`);
  } catch (error) {
    setStatus(error.message || "Could not delete selected syllabus.", true);
  } finally {
    setBusy(false);
  }
}

async function loadSelectedSyllabus() {
  const selectedSyllabusId = syllabusSelect.value;

  if (!selectedSyllabusId) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const syllabus = await getSyllabusById(selectedSyllabusId);

    if (!syllabus) {
      throw new Error("Selected syllabus could not be found.");
    }

    displaySyllabus(syllabus, "Syllabus loaded.");
  } catch (error) {
    setStatus(error.message || "Could not load selected syllabus.", true);
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  renderTopics();

  try {
    syllabusScopes = await listSyllabusScopes();
    renderCountryOptions();

    const frameworks = await listAssessmentFrameworks();
    renderFrameworkOptions(frameworks);

    const syllabuses = await refreshSyllabusOptions();

    if (syllabuses.length > 0) {
      displaySyllabus(syllabuses[0], `Loaded ${syllabuses.length} saved syllabuses.`);
      return;
    }

    setStatus("No saved syllabuses found. Use New Syllabus to start.");
  } catch (error) {
    setStatus(error.message || "Could not load syllabus admin data.", true);
  }
}

syllabusSelect.addEventListener("change", loadSelectedSyllabus);
useNewSyllabusButton.addEventListener("click", prepareNewSyllabus);
useNewSubjectButton.addEventListener("click", useNewSubject);
countrySelect.addEventListener("change", () => {
  renderLevelOptions();
  renderYearOptions();
});
levelSelect.addEventListener("change", () => {
  renderYearOptions();
});
addTopicButton.addEventListener("click", () => addTopicRow());
saveButton.addEventListener("click", saveSyllabus);
deleteButton.addEventListener("click", deleteSyllabus);
confirmDeleteInput.addEventListener("change", updateDeleteControls);

initPage();
