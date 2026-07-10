import {
  getSyllabusScope,
  readSyllabusWithTopics,
  saveSyllabusWithTopics
} from "/handler/syllabus_handler.js?v=20260710-syllabus-admin";

const standardSelect = document.querySelector("#syllabus-standard");
const subjectSelect = document.querySelector("#syllabus-subject");
const loadButton = document.querySelector("#load-syllabus");
const saveButton = document.querySelector("#save-syllabus");
const addTopicButton = document.querySelector("#add-topic");
const topicsList = document.querySelector("#topics-list");
const statusEl = document.querySelector("#syllabus-status");
const topicTemplate = document.querySelector("#topic-template");
const subtopicTemplate = document.querySelector("#subtopic-template");

let hasUnsavedChanges = false;
let loadedScope = {
  standard: "",
  subject: ""
};

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  loadButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  addTopicButton.disabled = isBusy;
  standardSelect.disabled = isBusy;
  subjectSelect.disabled = isBusy;
}

function showError(error, fallbackMessage) {
  console.error(error);
  setStatus(error.message || fallbackMessage, true);
}

function markDirty() {
  hasUnsavedChanges = true;
}

function populateSelect(selectEl, values) {
  selectEl.innerHTML = "";

  values.forEach((value) => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;
    selectEl.append(option);
  });
}

function getSelectedScope() {
  return {
    standard: standardSelect.value,
    subject: subjectSelect.value
  };
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

function createSubtopicRow(subtopicName = "") {
  const fragment = subtopicTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".subtopic-row");
  const nameInput = fragment.querySelector(".subtopic-name");
  const removeButton = fragment.querySelector(".remove-subtopic");

  nameInput.value = subtopicName;
  nameInput.addEventListener("input", markDirty);
  removeButton.addEventListener("click", () => {
    row.remove();
    markDirty();
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
  const subtopics = topic.subtopics || {};

  card.dataset.topicId = topic.id || "";
  topicNameInput.value = topic.topicName || "";
  topicNameInput.addEventListener("input", markDirty);

  Object.values(subtopics).forEach((subtopicName) => {
    subtopicsList.append(createSubtopicRow(subtopicName));
  });

  addSubtopicButton.addEventListener("click", () => {
    subtopicsList.append(createSubtopicRow());
    markDirty();
  });

  removeTopicButton.addEventListener("click", () => {
    card.remove();

    if (topicsList.querySelectorAll(".topic-card").length === 0) {
      renderEmptyState();
    }

    markDirty();
  });

  return fragment;
}

function addTopic(topic = {}) {
  removeEmptyState();
  topicsList.append(createTopicCard(topic));
  markDirty();
}

function renderTopics(topics = []) {
  topicsList.innerHTML = "";

  if (topics.length === 0) {
    renderEmptyState();
    hasUnsavedChanges = false;
    return;
  }

  topics.forEach((topic) => {
    topicsList.append(createTopicCard(topic));
  });

  hasUnsavedChanges = false;
}

function collectTopics() {
  const topics = [];

  topicsList.querySelectorAll(".topic-card").forEach((card) => {
    const topicName = card.querySelector(".topic-name").value.trim();
    const subtopics = {};
    let subtopicIndex = 1;

    card.querySelectorAll(".subtopic-row").forEach((row) => {
      const subtopicName = row.querySelector(".subtopic-name").value.trim();

      if (!subtopicName) {
        return;
      }

      subtopics[`subtopic_${subtopicIndex}`] = subtopicName;
      subtopicIndex += 1;
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
  const { standard, subject } = getSelectedScope();

  setBusy(true);
  setStatus("Loading syllabus...");

  try {
    const result = await readSyllabusWithTopics(standard, subject);

    renderTopics(result.topics || []);
    loadedScope = {
      standard,
      subject
    };
    setStatus(`Loaded ${subject} Standard ${standard}.`);
  } catch (error) {
    showError(error, "Could not load syllabus.");
  } finally {
    setBusy(false);
  }
}

async function saveSyllabus() {
  const { standard, subject } = getSelectedScope();

  setBusy(true);
  setStatus("Saving syllabus...");

  try {
    const topics = collectTopics();
    const result = await saveSyllabusWithTopics({
      standard,
      subject,
      topics
    });

    renderTopics(result.topics || []);
    setStatus(`Saved ${topics.length} topics for ${subject} Standard ${standard}.`);
  } catch (error) {
    showError(error, "Could not save syllabus.");
  } finally {
    setBusy(false);
  }
}

async function reloadAfterScopeChange() {
  if (hasUnsavedChanges && !globalThis.confirm("Discard unsaved syllabus changes?")) {
    standardSelect.value = loadedScope.standard;
    subjectSelect.value = loadedScope.subject;
    return;
  }

  await loadSyllabus();
}

function init() {
  const scope = getSyllabusScope();

  populateSelect(standardSelect, scope.standards);
  populateSelect(subjectSelect, scope.subjects);

  loadButton.addEventListener("click", reloadAfterScopeChange);
  saveButton.addEventListener("click", saveSyllabus);
  addTopicButton.addEventListener("click", () => addTopic());
  standardSelect.addEventListener("change", reloadAfterScopeChange);
  subjectSelect.addEventListener("change", reloadAfterScopeChange);

  loadSyllabus();
}

init();
