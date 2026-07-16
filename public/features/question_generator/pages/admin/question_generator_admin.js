import {
  listLlmPromptConfigs
} from "../../../llm_prompt_config/llm_prompt_config_module.js?v=20260717-question-prompt-display";
import {
  listSyllabuses
} from "../../../syllabus/syllabus_module.js?v=20260717-question-prompt-display";
import {
  llmPromptDifficultyLevels
} from "../../../llm_prompt_generator/llm_prompt_generator_module.js?v=20260717-question-prompt-display";
import {
  generateQuestions
} from "../../question_generator_module.js?v=20260717-question-prompt-display";

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
const generateQuestionsButton = document.querySelector("#generate-questions");
const statusMessage = document.querySelector("#status-message");
const promptSection = document.querySelector("#prompt-section");
const promptOutput = document.querySelector("#prompt-output");
const copyPromptButton = document.querySelector("#copy-prompt");
const resultsSection = document.querySelector("#results-section");
const resultsCount = document.querySelector("#results-count");
const resultsContainer = document.querySelector("#results-container");

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

function getSelectedTopicIds() {
  return Array.from(
    topicsContainer.querySelectorAll("input[data-topic-id]:checked")
  ).map((input) => input.dataset.topicId);
}

function isQuestionCountValid() {
  const questionCount = Number(numberOfQuestionsInput.value);

  return Number.isInteger(questionCount) && questionCount > 0;
}

function hasSelectedTopic() {
  const syllabus = getSelectedSyllabus();

  return Boolean(syllabus?.topics?.length) && getSelectedTopicIds().length > 0;
}

function updateGenerateButton() {
  generateQuestionsButton.disabled = pageBusy
    || !configSelect.value
    || !syllabusSelect.value
    || !difficultyLevelSelect.value
    || !isQuestionCountValid()
    || !hasSelectedTopic();
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

  generateQuestionsButton.textContent = isBusy
    ? "Generating Questions..."
    : "Generate and Store Questions";
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
    renderEmptyTopics("This syllabus has no topics. Add topics before generating questions.");
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
    checkbox.checked = true;
    checkbox.dataset.topicId = topic.id;
    checkbox.addEventListener("change", updateGenerateButton);
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

  resultsSection.hidden = true;
  promptSection.hidden = true;
  promptOutput.value = "";

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

function renderQuestionOptions(question) {
  const optionList = document.createElement("ul");
  optionList.className = "option-list";

  Object.entries(question.options).forEach(([key, value]) => {
    const option = document.createElement("li");
    option.textContent = `${key}. ${value}`;
    option.classList.toggle("correct", key === question.correctAnswer);
    optionList.append(option);
  });

  return optionList;
}

function renderResults(questions) {
  resultsContainer.replaceChildren();
  resultsCount.textContent = `${questions.length} saved`;

  questions.forEach((question, index) => {
    const card = document.createElement("article");
    const meta = document.createElement("div");
    const number = document.createElement("span");
    const topic = document.createElement("span");
    const questionId = document.createElement("span");
    const questionText = document.createElement("p");

    card.className = "question-card";
    meta.className = "question-meta";
    number.textContent = `Question ${index + 1}`;
    topic.textContent = `Topic: ${question.topicName}`;
    questionId.textContent = `ID: ${question.id}`;
    questionText.className = "question-text";
    questionText.textContent = question.questionText;
    meta.append(number, topic, questionId);
    card.append(meta, questionText, renderQuestionOptions(question));
    resultsContainer.append(card);
  });

  resultsSection.hidden = false;
}

async function generateAndStoreQuestions() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus) {
    setStatus("Select a syllabus first.", true);
    return;
  }

  setBusy(true);
  clearStatus();
  promptSection.hidden = true;
  promptOutput.value = "";
  resultsSection.hidden = true;

  try {
    const result = await generateQuestions({
      llmPromptConfigId: configSelect.value,
      syllabusId: syllabus.id,
      topicIds: getSelectedTopicIds(),
      numberOfQuestions: Number(numberOfQuestionsInput.value),
      difficultyLevel: difficultyLevelSelect.value,
      additionalInstructions: additionalInstructionsInput.value
    });

    promptOutput.value = result.prompt;
    promptSection.hidden = false;
    renderResults(result.questions);
    setStatus(`${result.questions.length} questions generated and stored.`);
  } catch (error) {
    if (error?.prompt) {
      promptOutput.value = error.prompt;
      promptSection.hidden = false;
    }

    setStatus(error.message || "Could not generate questions.", true);
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

      setStatus(`Create ${missingData.join(" and ")} before generating questions.`, true);
    }
  } catch (error) {
    setStatus(error.message || "Could not load question generator data.", true);
  } finally {
    updateGenerateButton();
  }
}

configSelect.addEventListener("change", updateGenerateButton);
syllabusSelect.addEventListener("change", displaySelectedSyllabus);
numberOfQuestionsInput.addEventListener("input", updateGenerateButton);
difficultyLevelSelect.addEventListener("change", updateGenerateButton);
generateQuestionsButton.addEventListener("click", generateAndStoreQuestions);
copyPromptButton.addEventListener("click", copyPrompt);

initPage();
