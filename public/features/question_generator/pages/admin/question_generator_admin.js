import {
  generateQuestions,
  generateQuestionsWithDiagram,
  loadQuestionGeneratorOptions
} from "../../question_generator_module.js?v=20260722-mermaid-chart-repair";

/**
 * @typedef {import("../../../llm_prompt_generator/domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */

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
const languageSelect = document.querySelector("#language-select");
const includeDiagramInput = document.querySelector("#include-diagram");
const additionalInstructionsInput = document.querySelector(
  "#additional-instructions"
);
const generateQuestionsButton = document.querySelector(
  "#generate-questions"
);
const statusMessage = document.querySelector("#status-message");
const resultsSection = document.querySelector("#results-section");
const resultsSummary = document.querySelector("#results-summary");
const promptsSection = document.querySelector("#prompts-section");
const promptBatchSelect = document.querySelector("#prompt-batch-select");
const promptOutput = document.querySelector("#prompt-output");
const copyPromptButton = document.querySelector("#copy-prompt");
const questionsSection = document.querySelector("#questions-section");
const questionsContainer = document.querySelector("#questions-container");

const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

let syllabuses = [];
let prompts = [];
let pageBusy = false;
let diagramObjectUrls = [];

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
  return syllabuses.find(
    (syllabus) => syllabus.id === syllabusSelect.value
  ) || null;
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

function updateGenerateButton() {
  generateQuestionsButton.disabled = pageBusy
    || !configSelect.value
    || !syllabusSelect.value
    || !difficultyLevelSelect.value
    || !languageSelect.value
    || !isQuestionCountValid()
    || getSelectedTopicIds().length === 0;
}

function setBusy(isBusy) {
  pageBusy = isBusy;

  [
    configSelect,
    syllabusSelect,
    numberOfQuestionsInput,
    difficultyLevelSelect,
    languageSelect,
    includeDiagramInput,
    additionalInstructionsInput
  ].forEach((control) => {
    control.disabled = isBusy;
  });

  topicsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.disabled = isBusy;
  });

  generateQuestionsButton.textContent = isBusy
    ? "Generating and Saving..."
    : "Generate and Save Questions";
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

function renderEmptyTopics(message) {
  topicsContainer.replaceChildren();

  const emptyMessage = document.createElement("p");
  emptyMessage.className = "empty-message";
  emptyMessage.textContent = message;
  topicsContainer.append(emptyMessage);
}

function renderTopics(topics = []) {
  topicsContainer.replaceChildren();

  if (topics.length === 0) {
    renderEmptyTopics("This syllabus has no topics available for generation.");
    return;
  }

  topics.forEach((topic) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const content = document.createElement("span");
    const topicName = document.createElement("span");
    const subtopicNames = Object.values(topic.subtopics || {})
      .map((subtopic) => String(subtopic || "").trim())
      .filter(Boolean);

    label.className = "topic-option";
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.topicId = topic.id;
    topicName.className = "topic-name";
    topicName.textContent = topic.topicName;
    content.append(topicName);

    if (subtopicNames.length > 0) {
      const subtopics = document.createElement("span");
      subtopics.className = "subtopics";
      subtopics.textContent = subtopicNames.join(", ");
      content.append(subtopics);
    }

    label.append(checkbox, content);
    topicsContainer.append(label);
  });
}

function displaySelectedSyllabus() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus) {
    syllabusSummary.hidden = true;
    renderLanguageOptions();
    renderEmptyTopics("Select a syllabus to load its topics.");
    updateGenerateButton();
    return;
  }

  summaryCountry.textContent = syllabus.country;
  summaryLevel.textContent = syllabus.level;
  summaryYear.textContent = `Year ${syllabus.year}`;
  summarySubject.textContent = syllabus.subject;
  syllabusSummary.hidden = false;
  renderLanguageOptions(syllabus.languages || []);
  renderTopics(syllabus.topics || []);
  updateGenerateButton();
}

function clearResults() {
  diagramObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  diagramObjectUrls = [];
  prompts = [];
  resultsSection.hidden = true;
  promptsSection.hidden = true;
  questionsSection.hidden = true;
  resultsSummary.textContent = "";
  promptBatchSelect.replaceChildren();
  promptOutput.value = "";
  questionsContainer.replaceChildren();
  copyPromptButton.disabled = true;
}

function displaySelectedPrompt() {
  const promptIndex = Number(promptBatchSelect.value);
  promptOutput.value = prompts[promptIndex] || "";
  copyPromptButton.disabled = pageBusy || !promptOutput.value;
}

function renderPrompts(nextPrompts = []) {
  prompts = nextPrompts;
  promptBatchSelect.replaceChildren();

  prompts.forEach((_prompt, promptIndex) => {
    const option = document.createElement("option");
    option.value = String(promptIndex);
    option.textContent = `LLM attempt ${promptIndex + 1}`;
    promptBatchSelect.append(option);
  });

  promptsSection.hidden = prompts.length === 0;
  promptBatchSelect.value = "0";
  displaySelectedPrompt();
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = text;

  return badge;
}

function renderQuestions(questions = []) {
  diagramObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  diagramObjectUrls = [];
  questionsContainer.replaceChildren();
  questionsSection.hidden = questions.length === 0;

  questions.forEach((question, questionIndex) => {
    const item = document.createElement("article");
    const heading = document.createElement("div");
    const number = document.createElement("span");
    const questionText = document.createElement("p");
    const optionsList = document.createElement("ul");
    const explanation = document.createElement("details");
    const explanationSummary = document.createElement("summary");
    const explanationText = document.createElement("p");

    item.className = "question-item";
    heading.className = "question-heading";
    number.className = "question-number";
    number.textContent = `Question ${questionIndex + 1}`;
    heading.append(
      number,
      createBadge(question.id || "Unsaved"),
      createBadge(question.difficulty),
      createBadge(question.language),
      createBadge(`Topic ${question.topicId}`)
    );

    if (question.hasDiagram) {
      heading.append(createBadge("Diagram"));
    }

    questionText.className = "question-text";
    questionText.textContent = question.questionText;
    optionsList.className = "options-list";

    QUESTION_OPTION_KEYS.forEach((optionKey) => {
      const option = document.createElement("li");
      option.textContent = `${optionKey.toUpperCase()}. ${question.options[optionKey]}`;

      if (optionKey === question.correctAnswer) {
        option.className = "correct-option";
      }

      optionsList.append(option);
    });

    explanation.className = "explanation";
    explanationSummary.textContent = "Answer explanation";
    explanationText.textContent = question.explanation;
    explanation.append(explanationSummary, explanationText);
    item.append(heading);

    if (question.hasDiagram && question.svg) {
      const diagram = document.createElement("figure");
      const diagramImage = document.createElement("img");
      const objectUrl = URL.createObjectURL(
        new Blob([question.svg], { type: "image/svg+xml" })
      );

      diagramObjectUrls.push(objectUrl);
      diagram.className = "question-diagram";
      diagramImage.src = objectUrl;
      diagramImage.alt = `Diagram for question ${questionIndex + 1}`;
      diagram.append(diagramImage);
      item.append(diagram);
    }

    item.append(questionText, optionsList, explanation);
    questionsContainer.append(item);
  });
}

function renderResults(result) {
  renderPrompts(result.prompts || []);
  renderQuestions(result.questions || []);
  resultsSummary.textContent = [
    `${result.questions.length} questions saved`,
    `${result.prompts.length} LLM ${result.prompts.length === 1 ? "attempt" : "attempts"}`
  ].join(" in ");
  resultsSection.hidden = false;
}

async function generateAndSaveQuestions() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus) {
    setStatus("Select a syllabus first.", true);
    return;
  }

  const topicIds = getSelectedTopicIds();

  if (topicIds.length === 0) {
    setStatus("Select at least one syllabus topic.", true);
    return;
  }

  setBusy(true);
  clearStatus();
  clearResults();

  try {
    const questionGenerator = includeDiagramInput.checked
      ? generateQuestionsWithDiagram
      : generateQuestions;

    /** @type {LlmPromptGenerationInput} */
    const generationInput = {
      numberOfQuestions: Number(numberOfQuestionsInput.value),
      difficultyLevel: difficultyLevelSelect.value,
      language: languageSelect.value,
      topicIds,
      additionalInstructions: additionalInstructionsInput.value
    };
    const result = await questionGenerator(
      configSelect.value,
      syllabus.id,
      generationInput
    );

    renderResults(result);
    setStatus(`${result.questions.length} questions generated and saved.`);
  } catch (error) {
    if (Array.isArray(error.prompts) && error.prompts.length > 0) {
      renderPrompts(error.prompts);
      resultsSummary.textContent = "Generation failed before questions were saved.";
      resultsSection.hidden = false;
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
  renderLanguageOptions();

  try {
    const options = await loadQuestionGeneratorOptions();
    const configs = options.promptConfigs || [];
    const loadedSyllabuses = options.syllabuses || [];

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

      setStatus(
        `Create ${missingData.join(" and ")} before generating questions.`,
        true
      );
    }
  } catch (error) {
    setStatus(error.message || "Could not load question generator data.", true);
  } finally {
    updateGenerateButton();
  }
}

configSelect.addEventListener("change", updateGenerateButton);
syllabusSelect.addEventListener("change", displaySelectedSyllabus);
topicsContainer.addEventListener("change", updateGenerateButton);
numberOfQuestionsInput.addEventListener("input", updateGenerateButton);
difficultyLevelSelect.addEventListener("change", updateGenerateButton);
languageSelect.addEventListener("change", updateGenerateButton);
generateQuestionsButton.addEventListener("click", generateAndSaveQuestions);
promptBatchSelect.addEventListener("change", displaySelectedPrompt);
copyPromptButton.addEventListener("click", copyPrompt);

initPage();
