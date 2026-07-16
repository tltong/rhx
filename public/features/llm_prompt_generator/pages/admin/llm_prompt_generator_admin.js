import {
  listLlmPromptConfigs
} from "../../../llm_prompt_config/llm_prompt_config_module.js?v=20260717-llm-prompt-generator";
import {
  listSyllabuses
} from "../../../syllabus/syllabus_module.js?v=20260717-llm-prompt-generator";
import {
  generateLlmPrompt,
  llmPromptDifficultyLevels
} from "../../llm_prompt_generator_module.js?v=20260717-llm-prompt-generator";

const configSelect = document.querySelector("#config-select");
const syllabusSelect = document.querySelector("#syllabus-select");
const syllabusSummary = document.querySelector("#syllabus-summary");
const summaryCountry = document.querySelector("#summary-country");
const summaryLevel = document.querySelector("#summary-level");
const summaryYear = document.querySelector("#summary-year");
const summarySubject = document.querySelector("#summary-subject");
const topicsContainer = document.querySelector("#topics-container");
const numberOfQuestionsInput = document.querySelector("#number-of-questions");
const difficultyLevelSelect = document.querySelector("#difficulty-level");
const additionalInstructionsInput = document.querySelector(
  "#additional-instructions"
);
const generatePromptButton = document.querySelector("#generate-prompt");
const copyPromptButton = document.querySelector("#copy-prompt");
const promptOutput = document.querySelector("#prompt-output");
const statusMessage = document.querySelector("#status-message");

let syllabuses = [];
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
    || !difficultyLevelSelect.value
    || !isQuestionCountValid();
}

function setBusy(isBusy) {
  pageBusy = isBusy;

  [
    configSelect,
    syllabusSelect,
    numberOfQuestionsInput,
    difficultyLevelSelect,
    additionalInstructionsInput
  ].forEach((control) => {
    control.disabled = isBusy;
  });

  topicsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.disabled = isBusy;
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

function renderEmptyTopics(message) {
  topicsContainer.replaceChildren();

  const emptyMessage = document.createElement("p");
  emptyMessage.className = "empty-message";
  emptyMessage.textContent = message;
  topicsContainer.append(emptyMessage);
}

function renderTopics(topics) {
  topicsContainer.replaceChildren();

  if (topics.length === 0) {
    renderEmptyTopics("This syllabus has no defined topics. The prompt will use its subject.");
    return;
  }

  topics.forEach((topic) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const content = document.createElement("span");
    const topicName = document.createElement("span");
    const subtopicNames = Object.values(topic.subtopics || {}).filter(Boolean);

    label.className = "topic-option";
    checkbox.type = "checkbox";
    checkbox.value = topic.id;
    checkbox.checked = true;
    checkbox.dataset.topicId = topic.id;
    topicName.className = "topic-name";
    topicName.textContent = topic.topicName;
    content.append(topicName);

    if (subtopicNames.length > 0) {
      const subtopicList = document.createElement("ul");
      subtopicList.className = "subtopic-list";

      subtopicNames.forEach((subtopic) => {
        const item = document.createElement("li");
        item.textContent = subtopic;
        subtopicList.append(item);
      });

      content.append(subtopicList);
    }

    label.append(checkbox, content);
    topicsContainer.append(label);
  });
}

function displaySelectedSyllabus() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus) {
    syllabusSummary.hidden = true;
    renderEmptyTopics("Select a syllabus to load its topics.");
    updateGenerateButton();
    return;
  }

  summaryCountry.textContent = syllabus.country;
  summaryLevel.textContent = syllabus.level;
  summaryYear.textContent = `Year ${syllabus.year}`;
  summarySubject.textContent = syllabus.subject;
  syllabusSummary.hidden = false;
  renderTopics(syllabus.topics || []);
  updateGenerateButton();
}

function renderDifficultyOptions() {
  difficultyLevelSelect.replaceChildren();

  Object.values(llmPromptDifficultyLevels).forEach((difficulty) => {
    const option = document.createElement("option");
    option.value = difficulty;
    option.textContent = difficulty;
    difficultyLevelSelect.append(option);
  });

  difficultyLevelSelect.value = llmPromptDifficultyLevels.MEDIUM;
}

function readSelectedTopicIds(syllabus) {
  const topicIds = Array.from(
    topicsContainer.querySelectorAll("input[data-topic-id]:checked")
  ).map((input) => input.dataset.topicId);

  if ((syllabus.topics || []).length > 0 && topicIds.length === 0) {
    throw new Error("Select at least one syllabus topic.");
  }

  return topicIds;
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
    const prompt = await generateLlmPrompt({
      llmPromptConfigId: configSelect.value,
      syllabusId: syllabus.id,
      topicIds: readSelectedTopicIds(syllabus),
      numberOfQuestions: Number(numberOfQuestionsInput.value),
      difficultyLevel: difficultyLevelSelect.value,
      additionalInstructions: additionalInstructionsInput.value
    });

    promptOutput.value = prompt;
    copyPromptButton.disabled = false;
    setStatus("Prompt generated.");
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
  renderDifficultyOptions();

  try {
    const [configs, loadedSyllabuses] = await Promise.all([
      listLlmPromptConfigs(),
      listSyllabuses()
    ]);

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
numberOfQuestionsInput.addEventListener("input", updateGenerateButton);
difficultyLevelSelect.addEventListener("change", updateGenerateButton);
generatePromptButton.addEventListener("click", generatePrompt);
copyPromptButton.addEventListener("click", copyPrompt);

initPage();
