import {
  getDiagramConfigForSyllabus,
  listDiagramConfigSyllabuses,
  saveDiagramConfigForSyllabus
} from "../../diagram_config_module.js?v=20260724-diagram-config";

const syllabusSelect = document.querySelector("#syllabus-select");
const syllabusSummary = document.querySelector("#syllabus-summary");
const summaryCountry = document.querySelector("#summary-country");
const summaryLevel = document.querySelector("#summary-level");
const summaryYear = document.querySelector("#summary-year");
const summarySubject = document.querySelector("#summary-subject");
const topicCount = document.querySelector("#topic-count");
const applicableCount = document.querySelector("#applicable-count");
const topicList = document.querySelector("#topic-list");
const diagramConfigForm = document.querySelector("#diagram-config-form");
const saveButton = document.querySelector("#save-config");
const statusMessage = document.querySelector("#status-message");

let loadedContext = null;
let pageBusy = false;

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

function getTopicRows() {
  return [...topicList.querySelectorAll("[data-topic-id]")];
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  syllabusSelect.disabled = isBusy;

  getTopicRows().forEach((row) => {
    row.querySelector("[data-applicable]").disabled = isBusy;
    const percentageInput = row.querySelector("[data-percentage]");

    percentageInput.disabled = isBusy ||
      !row.querySelector("[data-applicable]").checked;
  });

  saveButton.disabled = isBusy ||
    !loadedContext ||
    loadedContext.config.topics.length === 0;
  saveButton.textContent = isBusy ? "Saving..." : "Save Diagram Config";
}

function formatSyllabusOption(syllabus) {
  return [
    syllabus.country,
    syllabus.level,
    `Year ${syllabus.year}`,
    syllabus.subject
  ].join(" | ");
}

function renderSyllabusOptions(syllabuses) {
  syllabusSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = syllabuses.length
    ? `Select syllabus (${syllabuses.length})`
    : "No syllabuses available";
  syllabusSelect.append(placeholder);

  syllabuses.forEach((syllabus) => {
    const option = document.createElement("option");

    option.value = syllabus.id;
    option.textContent = formatSyllabusOption(syllabus);
    syllabusSelect.append(option);
  });
}

function renderSyllabusSummary(syllabus) {
  summaryCountry.textContent = syllabus.country;
  summaryLevel.textContent = syllabus.level;
  summaryYear.textContent = syllabus.year;
  summarySubject.textContent = syllabus.subject;
  syllabusSummary.hidden = false;
}

function updateApplicableCount() {
  const rows = getTopicRows();
  const selectedCount = rows.filter(
    (row) => row.querySelector("[data-applicable]").checked
  ).length;

  applicableCount.textContent =
    `${selectedCount} of ${rows.length} topics use diagram questions`;
  applicableCount.hidden = rows.length === 0;
}

function handleApplicableChange(event) {
  const checkbox = event.currentTarget;
  const row = checkbox.closest("[data-topic-id]");
  const percentageInput = row.querySelector("[data-percentage]");

  percentageInput.disabled = pageBusy || !checkbox.checked;

  if (checkbox.checked && Number(percentageInput.value) < 1) {
    percentageInput.value = "1";
  }

  if (!checkbox.checked) {
    percentageInput.value = "0";
  }

  updateApplicableCount();
}

function createTopicRow(topicConfig, syllabusTopic) {
  const row = document.createElement("article");
  const topicDetails = document.createElement("div");
  const topicTitle = document.createElement("h3");
  const topicDescription = document.createElement("p");
  const applicableLabel = document.createElement("label");
  const applicableInput = document.createElement("input");
  const applicableText = document.createElement("span");
  const percentageLabel = document.createElement("label");
  const percentageTitle = document.createElement("span");
  const percentageWrapper = document.createElement("div");
  const percentageInput = document.createElement("input");
  const subtopicCount = Object.keys(syllabusTopic?.subtopics || {}).length;

  row.className = "topic-row";
  row.dataset.topicId = topicConfig.topicId;

  topicTitle.textContent = topicConfig.topicName || "Untitled topic";
  topicDescription.className = "topic-description";
  topicDescription.textContent = `${subtopicCount} subtopic${subtopicCount === 1 ? "" : "s"}`;
  topicDetails.append(topicTitle, topicDescription);

  applicableLabel.className = "applicable-field";
  applicableInput.type = "checkbox";
  applicableInput.checked = topicConfig.isDiagramApplicable;
  applicableInput.dataset.applicable = "true";
  applicableInput.addEventListener("change", handleApplicableChange);
  applicableText.textContent = "Diagram questions";
  applicableLabel.append(applicableInput, applicableText);

  percentageLabel.className = "percentage-field";
  percentageTitle.textContent = "Percentage";
  percentageWrapper.className = "percentage-input";
  percentageInput.type = "number";
  percentageInput.min = "1";
  percentageInput.max = "100";
  percentageInput.step = "1";
  percentageInput.value = topicConfig.isDiagramApplicable
    ? topicConfig.diagramQuestionPercentage
    : 0;
  percentageInput.disabled = !topicConfig.isDiagramApplicable;
  percentageInput.dataset.percentage = "true";
  percentageWrapper.append(percentageInput);
  percentageLabel.append(percentageTitle, percentageWrapper);

  row.append(topicDetails, applicableLabel, percentageLabel);

  return row;
}

function renderContext(context) {
  loadedContext = context;
  renderSyllabusSummary(context.syllabus);
  topicList.replaceChildren();

  const syllabusTopics = new Map(
    context.syllabus.topics.map((topic) => [topic.id, topic])
  );

  context.config.topics.forEach((topicConfig) => {
    topicList.append(
      createTopicRow(
        topicConfig,
        syllabusTopics.get(topicConfig.topicId)
      )
    );
  });

  if (context.config.topics.length === 0) {
    const emptyState = document.createElement("p");

    emptyState.className = "empty-state";
    emptyState.textContent =
      "This syllabus has no topics. Add topics in Syllabus Admin first.";
    topicList.append(emptyState);
  }

  topicCount.textContent =
    `${context.config.topics.length} syllabus topic${context.config.topics.length === 1 ? "" : "s"}`;
  updateApplicableCount();
  setBusy(false);
}

function readTopicConfigs() {
  return getTopicRows().map((row) => {
    const applicableInput = row.querySelector("[data-applicable]");
    const percentageInput = row.querySelector("[data-percentage]");

    if (
      applicableInput.checked &&
      !percentageInput.checkValidity()
    ) {
      percentageInput.reportValidity();
      throw new Error("Enter a percentage between 1 and 100.");
    }

    return {
      topicId: row.dataset.topicId,
      isDiagramApplicable: applicableInput.checked,
      diagramQuestionPercentage: applicableInput.checked
        ? Number(percentageInput.value)
        : 0
    };
  });
}

async function loadSelectedSyllabus() {
  const syllabusId = syllabusSelect.value;

  if (!syllabusId) {
    loadedContext = null;
    syllabusSummary.hidden = true;
    saveButton.disabled = true;
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const context = await getDiagramConfigForSyllabus(syllabusId);

    renderContext(context);
    setStatus("Diagram configuration loaded.");
  } catch (error) {
    loadedContext = null;
    setStatus(error.message || "Could not load diagram configuration.", true);
  } finally {
    setBusy(false);
  }
}

async function saveDiagramConfig(event) {
  event.preventDefault();

  if (!loadedContext) {
    setStatus("Select a syllabus before saving.", true);
    return;
  }

  let topicConfigs;

  try {
    topicConfigs = readTopicConfigs();
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const context = await saveDiagramConfigForSyllabus(
      loadedContext.syllabus.id,
      topicConfigs
    );

    renderContext(context);
    setStatus("Diagram configuration saved.");
  } catch (error) {
    setStatus(error.message || "Could not save diagram configuration.", true);
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  setBusy(true);
  clearStatus();

  try {
    const syllabuses = await listDiagramConfigSyllabuses();

    renderSyllabusOptions(syllabuses);

    if (syllabuses.length === 0) {
      setStatus("No syllabuses found. Add a syllabus first.");
      return;
    }

    syllabusSelect.value = syllabuses[0].id;
    await loadSelectedSyllabus();
  } catch (error) {
    setStatus(error.message || "Could not load syllabuses.", true);
  } finally {
    setBusy(false);
  }
}

syllabusSelect.addEventListener("change", loadSelectedSyllabus);
diagramConfigForm.addEventListener("submit", saveDiagramConfig);

initPage();
