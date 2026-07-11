import {
  readSyllabusWithTopics,
  readSyllabuses
} from "../../../handler/syllabus_handler.js?v=20260711-year-field";
import {
  DEFAULT_QUESTION_GENERATION_TEMPERATURE,
  generateQuestions as generateAndStoreQuestions,
  getQuestionGenerationPromptPreview
} from "../../../handler/question_generation_handler.js?v=20260711-prompt-preview";

const countrySelect = document.querySelector("#country");
const levelSelect = document.querySelector("#level");
const yearSelect = document.querySelector("#year");
const subjectSelect = document.querySelector("#subject");
const topicsList = document.querySelector("#topics-list");
const numberOfQuestionsInput = document.querySelector("#number-of-questions");
const difficultySelect = document.querySelector("#difficulty");
const languageSelect = document.querySelector("#language");
const temperatureInput = document.querySelector("#temperature");
const temperaturePreviewEl = document.querySelector("#temperature-preview");
const promptPreviewEl = document.querySelector("#prompt-preview");
const specialInstructionInput = document.querySelector("#special-instruction");
const generateButton = document.querySelector("#generate-button");
const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");

let syllabuses = [];
let currentSyllabus = null;
let currentTopics = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  document.querySelectorAll("button, input, select, textarea").forEach((element) => {
    element.disabled = isBusy;
  });

  if (!isBusy) {
    refreshGenerateButtonState();
  }
}

function showError(error, fallbackMessage) {
  console.error(error);
  outputEl.textContent = JSON.stringify(error.payload || { message: error.message }, null, 2);
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

function uniqueSorted(values, compare = null) {
  const uniqueValues = [...new Set(values.filter((value) => value !== "" && value !== null && value !== undefined))];

  return uniqueValues.sort(compare || ((left, right) => String(left).localeCompare(String(right))));
}

function getMatchingSyllabuses(criteria = {}) {
  return syllabuses.filter((syllabus) =>
    Object.entries(criteria).every(([key, value]) => {
      if (value === "" || value === null || value === undefined) {
        return true;
      }

      if (key === "year") {
        return Number(syllabus.year) === Number(value);
      }

      return syllabus[key] === value;
    })
  );
}

function populateCountries() {
  clearSelect(countrySelect, "Select country");

  uniqueSorted(syllabuses.map((syllabus) => syllabus.country)).forEach((country) => {
    countrySelect.append(createOption(country));
  });
}

function populateLevels() {
  clearSelect(levelSelect, "Select level");
  clearSelect(yearSelect, "Select year");
  clearSelect(subjectSelect, "Select subject");

  uniqueSorted(
    getMatchingSyllabuses({ country: countrySelect.value }).map((syllabus) => syllabus.level)
  ).forEach((level) => {
    levelSelect.append(createOption(level, `${level.charAt(0).toUpperCase()}${level.slice(1)}`));
  });
}

function populateYears() {
  clearSelect(yearSelect, "Select year");
  clearSelect(subjectSelect, "Select subject");

  uniqueSorted(
    getMatchingSyllabuses({
      country: countrySelect.value,
      level: levelSelect.value
    }).map((syllabus) => Number(syllabus.year)),
    (left, right) => Number(left) - Number(right)
  ).forEach((year) => {
    yearSelect.append(createOption(String(year), `Year ${year}`));
  });
}

function populateSubjects() {
  clearSelect(subjectSelect, "Select subject");

  uniqueSorted(
    getMatchingSyllabuses({
      country: countrySelect.value,
      level: levelSelect.value,
      year: yearSelect.value
    }).map((syllabus) => syllabus.subject)
  ).forEach((subject) => {
    subjectSelect.append(createOption(subject));
  });
}

function getSelectedSyllabusSummary() {
  if (!countrySelect.value || !levelSelect.value || !yearSelect.value || !subjectSelect.value) {
    return null;
  }

  return {
    country: countrySelect.value,
    level: levelSelect.value,
    year: Number(yearSelect.value),
    subject: subjectSelect.value
  };
}

function findSelectedSyllabus() {
  const summary = getSelectedSyllabusSummary();

  if (!summary) {
    return null;
  }

  return getMatchingSyllabuses(summary)[0] || null;
}

function getTopicSubtopics(topic = {}) {
  return Object.values(topic.subtopics || {})
    .filter((subtopic) => typeof subtopic === "string" && subtopic.trim() !== "")
    .map((subtopic) => subtopic.trim());
}

function renderEmptyTopics(message) {
  topicsList.innerHTML = "";

  const empty = document.createElement("div");

  empty.className = "empty-state";
  empty.textContent = message;
  topicsList.append(empty);
}

function renderTopics(topics = []) {
  topicsList.innerHTML = "";

  if (topics.length === 0) {
    renderEmptyTopics("No topics found for this syllabus.");
    return;
  }

  topics.forEach((topic) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const content = document.createElement("span");
    const name = document.createElement("span");
    const subtopics = document.createElement("span");
    const subtopicList = getTopicSubtopics(topic);

    label.className = "topic-option";
    checkbox.type = "checkbox";
    checkbox.value = topic.id;
    checkbox.addEventListener("change", refreshGenerateButtonState);

    name.className = "topic-name";
    name.textContent = topic.topicName || topic.id;

    subtopics.className = "topic-subtopics";
    subtopics.textContent = subtopicList.length > 0
      ? subtopicList.join(", ")
      : "No subtopics";

    content.append(name, subtopics);
    label.append(checkbox, content);
    topicsList.append(label);
  });
}

function getSelectedTopicIds() {
  return [...topicsList.querySelectorAll("input[type='checkbox']:checked")]
    .map((checkbox) => checkbox.value);
}

function getSelectedTopics() {
  const selectedTopicIds = new Set(getSelectedTopicIds());

  return currentTopics.filter((topic) => selectedTopicIds.has(topic.id));
}

function parseNumberOfQuestions() {
  const value = Number(numberOfQuestionsInput.value);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Enter a positive whole number of questions.");
  }

  return value;
}

function parseTemperature() {
  if (temperatureInput.value === "") {
    throw new Error("Enter a temperature between 0 and 2.");
  }

  const value = Number(temperatureInput.value);

  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error("Enter a temperature between 0 and 2.");
  }

  return value;
}

function refreshGenerateButtonState() {
  generateButton.disabled = !currentSyllabus ||
    getSelectedTopicIds().length === 0 ||
    !numberOfQuestionsInput.value ||
    !numberOfQuestionsInput.checkValidity() ||
    !difficultySelect.value ||
    !languageSelect.value ||
    !temperatureInput.value ||
    !temperatureInput.checkValidity();

  renderPromptPreview();
}

function resetSyllabusSelection(message = "Select a syllabus.") {
  currentSyllabus = null;
  currentTopics = [];
  renderEmptyTopics(message);
  refreshGenerateButtonState();
}

async function loadTopicsForSelection() {
  const selectedSyllabus = findSelectedSyllabus();

  if (!selectedSyllabus) {
    resetSyllabusSelection("Select country, level, year, and subject to load topics.");
    return;
  }

  setBusy(true);
  setStatus("Loading topics...");

  try {
    const result = await readSyllabusWithTopics(selectedSyllabus.id);

    currentSyllabus = result.syllabus;
    currentTopics = result.topics || [];
    renderTopics(currentTopics);
    setStatus(currentTopics.length > 0
      ? "Select one or more topics, then generate questions."
      : "This syllabus has no topics.");
  } catch (error) {
    resetSyllabusSelection("Could not load topics.");
    showError(error, "Could not load topics.");
  } finally {
    setBusy(false);
  }
}

async function loadSyllabuses() {
  setBusy(true);
  setStatus("Loading syllabuses...");
  outputEl.textContent = "{}";

  try {
    syllabuses = await readSyllabuses();
    populateCountries();
    populateLevels();
    populateYears();
    populateSubjects();
    resetSyllabusSelection(syllabuses.length > 0
      ? "Select country, level, year, and subject to load topics."
      : "No syllabuses found.");
    setStatus(syllabuses.length > 0
      ? "Select country, level, year, and subject."
      : "No syllabuses found.");
  } catch (error) {
    showError(error, "Could not load syllabuses.");
  } finally {
    setBusy(false);
  }
}

function getGenerationInput(topic) {
  if (!currentSyllabus) {
    throw new Error("Select a syllabus first.");
  }

  return {
    country: currentSyllabus.country,
    level: currentSyllabus.level,
    year: currentSyllabus.year,
    subject: currentSyllabus.subject,
    syllabusId: currentSyllabus.id,
    topicId: topic.id,
    numberOfQuestions: parseNumberOfQuestions(),
    difficulty: difficultySelect.value,
    language: languageSelect.value,
    specialInstruction: specialInstructionInput.value.trim()
  };
}

function renderPromptPreview() {
  temperaturePreviewEl.textContent = temperatureInput.value ||
    String(DEFAULT_QUESTION_GENERATION_TEMPERATURE);

  if (!currentSyllabus) {
    promptPreviewEl.textContent = "Select a syllabus and topic to preview the prompt.";
    return;
  }

  const selectedTopics = getSelectedTopics();

  if (selectedTopics.length === 0) {
    promptPreviewEl.textContent = "Select one or more topics to preview the prompt.";
    return;
  }

  try {
    const temperature = parseTemperature();

    temperaturePreviewEl.textContent = String(temperature);
    promptPreviewEl.textContent = selectedTopics
      .map((topic, index) => {
        const preview = getQuestionGenerationPromptPreview(
          getGenerationInput(topic),
          currentSyllabus,
          topic,
          { temperature }
        );

        return [
          `Topic ${index + 1}: ${topic.topicName || topic.id}`,
          `Temperature: ${preview.temperature}`,
          "",
          preview.prompt
        ].join("\n");
      })
      .join("\n\n---\n\n");
  } catch (error) {
    promptPreviewEl.textContent = error.message;
  }
}

async function generateQuestions() {
  const selectedTopics = getSelectedTopics();

  if (selectedTopics.length === 0) {
    setStatus("Select at least one topic.", true);
    return;
  }

  let generationOptions;

  try {
    generationOptions = {
      temperature: parseTemperature()
    };
  } catch (error) {
    showError(error, "Invalid generation settings.");
    return;
  }

  setBusy(true);
  setStatus(`Generating questions for ${selectedTopics.length} topic(s)...`);
  outputEl.textContent = "{}";

  try {
    const results = [];

    for (const [index, topic] of selectedTopics.entries()) {
      setStatus(`Generating ${index + 1} of ${selectedTopics.length}: ${topic.topicName || topic.id}`);

      results.push(await generateAndStoreQuestions(getGenerationInput(topic), generationOptions));
    }

    outputEl.textContent = JSON.stringify(results, null, 2);
    setStatus(`Saved questions for ${results.length} topic(s).`);
  } catch (error) {
    showError(error, "Question generation failed.");
  } finally {
    setBusy(false);
  }
}

countrySelect.addEventListener("change", () => {
  populateLevels();
  populateYears();
  populateSubjects();
  resetSyllabusSelection("Select level, year, and subject to load topics.");
});

levelSelect.addEventListener("change", () => {
  populateYears();
  populateSubjects();
  resetSyllabusSelection("Select year and subject to load topics.");
});

yearSelect.addEventListener("change", () => {
  populateSubjects();
  resetSyllabusSelection("Select subject to load topics.");
});

subjectSelect.addEventListener("change", loadTopicsForSelection);
numberOfQuestionsInput.addEventListener("input", refreshGenerateButtonState);
difficultySelect.addEventListener("change", refreshGenerateButtonState);
languageSelect.addEventListener("change", refreshGenerateButtonState);
temperatureInput.addEventListener("input", refreshGenerateButtonState);
specialInstructionInput.addEventListener("input", renderPromptPreview);
generateButton.addEventListener("click", generateQuestions);

loadSyllabuses();
