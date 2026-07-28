import {
  generateLlmPrompt,
  generateLlmPromptWithDiagram,
  getTopicDiagramPercentage,
  loadLlmPromptGeneratorOptions
} from "../../llm_prompt_generator_module.js?v=20260727-topic-diagram-percentage";

/**
 * @typedef {import("../../domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */

const configSelect = document.querySelector("#config-select");
const syllabusSelect = document.querySelector("#syllabus-select");
const topicSelect = document.querySelector("#topic-select");
const syllabusSummary = document.querySelector("#syllabus-summary");
const summaryCountry = document.querySelector("#summary-country");
const summaryLevel = document.querySelector("#summary-level");
const summaryYear = document.querySelector("#summary-year");
const summarySubject = document.querySelector("#summary-subject");
const numberOfQuestionsInput = document.querySelector("#number-of-questions");
const difficultyLevelSelect = document.querySelector("#difficulty-level");
const languageSelect = document.querySelector("#language-select");
const diagramPercentageOutput = document.querySelector(
  "#diagram-percentage"
);
const includeDiagramInput = document.querySelector("#include-diagram");
const additionalInstructionsInput = document.querySelector(
  "#additional-instructions"
);
const generatePromptButton = document.querySelector("#generate-prompt");
const copyPromptButton = document.querySelector("#copy-prompt");
const promptOutput = document.querySelector("#prompt-output");
const statusMessage = document.querySelector("#status-message");

let syllabuses = [];
let pageBusy = false;
let diagramPercentageRequestId = 0;

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

function getSelectedSyllabus() {
  return syllabuses.find((syllabus) => syllabus.id === syllabusSelect.value) || null;
}

function isQuestionCountValid() {
  const questionCount = Number(numberOfQuestionsInput.value);

  return Number.isInteger(questionCount) && questionCount > 0;
}

function updateGenerateButton() {
  generatePromptButton.disabled = pageBusy
    || !configSelect.value
    || !syllabusSelect.value
    || !topicSelect.value
    || !difficultyLevelSelect.value
    || !languageSelect.value
    || !isQuestionCountValid();
}

function setBusy(isBusy) {
  pageBusy = isBusy;

  [
    configSelect,
    syllabusSelect,
    topicSelect,
    numberOfQuestionsInput,
    difficultyLevelSelect,
    languageSelect,
    includeDiagramInput,
    additionalInstructionsInput
  ].forEach((control) => {
    control.disabled = isBusy;
  });

  copyPromptButton.disabled = isBusy || !promptOutput.value;
  updateGenerateButton();
}

function renderConfigOptions(configs) {
  configSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = configs.length
    ? `Select prompt config (${configs.length})`
    : "No prompt configs available";
  configSelect.append(placeholder);

  configs.forEach((config) => {
    const option = document.createElement("option");
    option.value = config.id;
    option.textContent = config.identifier;
    configSelect.append(option);
  });

  if (configs.length === 1) {
    configSelect.value = configs[0].id;
  }
}

function getSyllabusLabel(syllabus) {
  return [
    syllabus.country,
    syllabus.level,
    `Year ${syllabus.year}`,
    syllabus.subject,
    syllabus.active ? "Active" : "Inactive"
  ].join(" / ");
}

function renderSyllabusOptions(nextSyllabuses) {
  syllabusSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = nextSyllabuses.length
    ? `Select syllabus (${nextSyllabuses.length})`
    : "No syllabuses available";
  syllabusSelect.append(placeholder);

  nextSyllabuses.forEach((syllabus) => {
    const option = document.createElement("option");
    option.value = syllabus.id;
    option.textContent = getSyllabusLabel(syllabus);
    syllabusSelect.append(option);
  });
}

function renderTopicOptions(topics = []) {
  topicSelect.replaceChildren();

  const placeholder = document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = topics.length
    ? "Select topic"
    : "No syllabus topics available";
  topicSelect.append(placeholder);

  topics.forEach((topic) => {
    const option = document.createElement("option");

    option.value = topic.id;
    option.textContent = topic.topicName;
    topicSelect.append(option);
  });

  if (topics.length === 1) {
    topicSelect.value = topics[0].id;
  }
}

async function displayDiagramPercentage() {
  const syllabusId = syllabusSelect.value;
  const topicId = topicSelect.value;
  const requestId = ++diagramPercentageRequestId;

  if (!syllabusId || !topicId) {
    diagramPercentageOutput.textContent = "Select topic";
    return;
  }

  diagramPercentageOutput.textContent = "Loading...";

  try {
    const percentage = await getTopicDiagramPercentage(
      syllabusId,
      topicId
    );

    if (requestId !== diagramPercentageRequestId) {
      return;
    }

    diagramPercentageOutput.textContent = `${percentage}%`;
  } catch (error) {
    if (requestId !== diagramPercentageRequestId) {
      return;
    }

    diagramPercentageOutput.textContent = "Unavailable";
    setStatus(
      error.message || "Could not load the diagram percentage.",
      true
    );
  }
}

function displaySelectedSyllabus() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus) {
    syllabusSummary.hidden = true;
    renderLanguageOptions();
    renderTopicOptions();
    void displayDiagramPercentage();
    updateGenerateButton();
    return;
  }

  summaryCountry.textContent = syllabus.country;
  summaryLevel.textContent = syllabus.level;
  summaryYear.textContent = `Year ${syllabus.year}`;
  summarySubject.textContent = syllabus.subject;
  syllabusSummary.hidden = false;
  renderLanguageOptions(syllabus.languages || []);
  renderTopicOptions(syllabus.topics || []);
  void displayDiagramPercentage();
  updateGenerateButton();
}

function renderLanguageOptions(languages = []) {
  languageSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = languages.length
    ? "Select language"
    : "No syllabus languages available";
  languageSelect.append(placeholder);

  languages.forEach((language) => {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = language;
    languageSelect.append(option);
  });

  if (languages.length === 1) {
    languageSelect.value = languages[0];
  }
}

async function generatePrompt() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus) {
    setStatus("Select a syllabus first.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const promptGenerator = includeDiagramInput.checked
      ? generateLlmPromptWithDiagram
      : generateLlmPrompt;

    /** @type {LlmPromptGenerationInput} */
    const generationInput = {
      numberOfQuestions: Number(numberOfQuestionsInput.value),
      difficultyLevel: difficultyLevelSelect.value,
      language: languageSelect.value,
      topicId: topicSelect.value,
      additionalInstructions: additionalInstructionsInput.value
    };
    const prompt = await promptGenerator(
      configSelect.value,
      syllabus.id,
      generationInput
    );

    promptOutput.value = prompt;
    copyPromptButton.disabled = false;
    setStatus(
      includeDiagramInput.checked
        ? "Prompt using the configured diagram percentage generated."
        : "Prompt generated."
    );
  } catch (error) {
    setStatus(error.message || "Could not generate the prompt.", true);
  } finally {
    setBusy(false);
  }
}

async function copyPrompt() {
  if (!promptOutput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(promptOutput.value);
    setStatus("Prompt copied.");
  } catch (error) {
    promptOutput.focus();
    promptOutput.select();
    setStatus("Could not copy automatically. The prompt has been selected.", true);
  }
}

async function initPage() {
  renderLanguageOptions();
  renderTopicOptions();
  void displayDiagramPercentage();

  try {
    const options = await loadLlmPromptGeneratorOptions();
    const configs = options.promptConfigs;
    const loadedSyllabuses = options.syllabuses;

    syllabuses = loadedSyllabuses;
    renderConfigOptions(configs);
    renderSyllabusOptions(syllabuses);

    if (configs.length === 0 || syllabuses.length === 0) {
      const missingData = [];

      if (configs.length === 0) {
        missingData.push("an LLM prompt config");
      }

      if (syllabuses.length === 0) {
        missingData.push("a syllabus");
      }

      setStatus(`Create ${missingData.join(" and ")} before generating a prompt.`, true);
    }
  } catch (error) {
    setStatus(error.message || "Could not load prompt generator data.", true);
  } finally {
    updateGenerateButton();
  }
}

configSelect.addEventListener("change", updateGenerateButton);
syllabusSelect.addEventListener("change", displaySelectedSyllabus);
topicSelect.addEventListener("change", () => {
  updateGenerateButton();
  void displayDiagramPercentage();
});
numberOfQuestionsInput.addEventListener("input", updateGenerateButton);
difficultyLevelSelect.addEventListener("change", updateGenerateButton);
languageSelect.addEventListener("change", updateGenerateButton);
generatePromptButton.addEventListener("click", generatePrompt);
copyPromptButton.addEventListener("click", copyPrompt);

initPage();
