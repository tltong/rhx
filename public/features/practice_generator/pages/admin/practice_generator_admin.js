import {
  generatePreAssessmentPractice,
  loadPreAssessmentGeneratorOptions,
  loadPreAssessmentPractice
} from "../../practice_generator_module.js?v=20260801-syllabus-topic-instructions";

const syllabusSelect = document.querySelector("#syllabus-select");
const topicSelect = document.querySelector("#topic-select");
const languageSelect = document.querySelector("#language-select");
const syllabusSummary = document.querySelector("#syllabus-summary");
const summaryCountry = document.querySelector("#summary-country");
const summaryLevel = document.querySelector("#summary-level");
const summaryYear = document.querySelector("#summary-year");
const summarySubject = document.querySelector("#summary-subject");
const assignmentMessage = document.querySelector("#assignment-message");
const generateButton = document.querySelector("#generate-practice");
const statusMessage = document.querySelector("#status-message");
const resultsSection = document.querySelector("#results-section");
const resultsSummary = document.querySelector("#results-summary");
const practiceId = document.querySelector("#practice-id");
const totalQuestions = document.querySelector("#total-questions");
const withoutDiagram = document.querySelector("#without-diagram");
const withDiagram = document.querySelector("#with-diagram");
const diagramPercentage = document.querySelector("#diagram-percentage");
const allocationBody = document.querySelector("#allocation-body");
const allocationSummary = document.querySelector("#allocation-summary");
const questionsContainer = document.querySelector("#questions-container");

const DIFFICULTY_KEYS = Object.freeze(["easy", "medium", "hard"]);
const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

let syllabuses = [];
let pageBusy = false;
let diagramObjectUrls = [];
let existingPracticeLoadVersion = 0;

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

function getSelectedTopic() {
  return getSelectedSyllabus()?.topics.find(
    (topic) => topic.id === topicSelect.value
  ) || null;
}

function getExistingAssignment() {
  const topic = getSelectedTopic();
  const selectedLanguage = languageSelect.value.trim().toLowerCase();

  if (!topic || !selectedLanguage) {
    return null;
  }

  return Object.values(topic.preAssessmentPractices || {}).find(
    (assignment) => (
      String(assignment.language || "").trim().toLowerCase()
      === selectedLanguage
    )
  ) || null;
}

function updateGenerateButton() {
  const hasSelection = Boolean(
    syllabusSelect.value
    && topicSelect.value
    && languageSelect.value
  );

  generateButton.disabled = pageBusy
    || !hasSelection;

  if (!pageBusy) {
    generateButton.textContent = getExistingAssignment()
      ? "Regenerate and Replace"
      : "Generate Pre-Assessment";
  }
}

function updateAssignmentMessage() {
  const assignment = getExistingAssignment();

  if (!assignment) {
    assignmentMessage.textContent = "";
    assignmentMessage.hidden = true;
    updateGenerateButton();
    return;
  }

  assignmentMessage.textContent =
    `This topic already has a ${assignment.language} pre-assessment `
    + `practice (${assignment.practiceId}). Regeneration will replace and `
    + "delete the existing practice and its questions.";
  assignmentMessage.hidden = false;
  updateGenerateButton();
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  syllabusSelect.disabled = isBusy;
  topicSelect.disabled = isBusy || !syllabusSelect.value;
  languageSelect.disabled = isBusy || !syllabusSelect.value;
  generateButton.textContent = isBusy ? "Generating..." : "";
  updateGenerateButton();
}

function appendPlaceholder(select, text) {
  const option = document.createElement("option");

  option.value = "";
  option.textContent = text;
  select.append(option);
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

function renderSyllabuses() {
  syllabusSelect.replaceChildren();
  appendPlaceholder(
    syllabusSelect,
    syllabuses.length
      ? `Select syllabus (${syllabuses.length})`
      : "No eligible syllabuses available"
  );

  syllabuses.forEach((syllabus) => {
    const option = document.createElement("option");

    option.value = syllabus.id;
    option.textContent = getSyllabusLabel(syllabus);
    syllabusSelect.append(option);
  });
}

function renderTopics(topics = []) {
  topicSelect.replaceChildren();
  appendPlaceholder(
    topicSelect,
    topics.length ? "Select topic" : "No topics available"
  );

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

function renderLanguages(languages = []) {
  languageSelect.replaceChildren();
  appendPlaceholder(
    languageSelect,
    languages.length ? "Select language" : "No languages available"
  );

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

function displaySelectedSyllabus() {
  const syllabus = getSelectedSyllabus();

  existingPracticeLoadVersion += 1;
  clearQuestions();
  resultsSection.hidden = true;
  clearStatus();

  if (!syllabus) {
    syllabusSummary.hidden = true;
    renderTopics();
    renderLanguages();
    topicSelect.disabled = true;
    languageSelect.disabled = true;
    updateAssignmentMessage();
    return;
  }

  summaryCountry.textContent = syllabus.country;
  summaryLevel.textContent = syllabus.level;
  summaryYear.textContent = `Year ${syllabus.year}`;
  summarySubject.textContent = syllabus.subject;
  syllabusSummary.hidden = false;
  renderTopics(syllabus.topics);
  renderLanguages(syllabus.languages);
  topicSelect.disabled = false;
  languageSelect.disabled = false;
  updateAssignmentMessage();
  displayExistingPractice();
}

function renderAllocation(allocation) {
  totalQuestions.textContent = allocation.totalQuestions;
  withoutDiagram.textContent = allocation.withoutDiagram;
  withDiagram.textContent = allocation.withDiagram;
  diagramPercentage.textContent = `${allocation.diagramPercentage}%`;
  allocationBody.replaceChildren();

  DIFFICULTY_KEYS.forEach((difficultyKey) => {
    const difficulty = allocation.byDifficulty[difficultyKey];
    const row = document.createElement("tr");

    [
      difficulty.difficultyLevel,
      difficulty.total,
      difficulty.withoutDiagram,
      difficulty.withDiagram
    ].forEach((value) => {
      const cell = document.createElement("td");

      cell.textContent = value;
      row.append(cell);
    });

    allocationBody.append(row);
  });
}

function clearQuestions() {
  diagramObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  diagramObjectUrls = [];
  questionsContainer.replaceChildren();
}

function createBadge(text) {
  const badge = document.createElement("span");

  badge.className = "badge";
  badge.textContent = text;

  return badge;
}

function renderQuestions(questions = []) {
  clearQuestions();

  questions.forEach((question, questionIndex) => {
    const item = document.createElement("article");
    const heading = document.createElement("div");
    const number = document.createElement("strong");
    const questionText = document.createElement("p");
    const options = document.createElement("ol");
    const explanation = document.createElement("details");
    const explanationSummary = document.createElement("summary");
    const explanationText = document.createElement("p");

    item.className = "question-item";
    heading.className = "question-heading";
    number.textContent = `Question ${questionIndex + 1}`;
    heading.append(
      number,
      createBadge(question.difficulty),
      createBadge(question.language),
      createBadge(question.hasDiagram ? "Diagram" : "No diagram"),
      createBadge(question.id)
    );
    questionText.className = "question-text";
    questionText.textContent = question.questionText;
    options.className = "question-options";

    QUESTION_OPTION_KEYS.forEach((optionKey) => {
      const option = document.createElement("li");
      const optionLabel = document.createElement("strong");

      optionLabel.textContent = `${optionKey.toUpperCase()}. `;
      option.append(optionLabel, question.options[optionKey]);

      if (optionKey === question.correctAnswer) {
        option.className = "correct-option";
        option.append(" (Correct)");
      }

      options.append(option);
    });

    explanationSummary.textContent = "Answer explanation";
    explanationText.textContent = question.explanation;
    explanation.append(explanationSummary, explanationText);
    item.append(heading);

    if (question.hasDiagram && question.svg) {
      const diagram = document.createElement("figure");
      const image = document.createElement("img");
      const objectUrl = URL.createObjectURL(
        new Blob([question.svg], { type: "image/svg+xml" })
      );

      diagramObjectUrls.push(objectUrl);
      diagram.className = "question-diagram";
      image.src = objectUrl;
      image.alt = `Diagram for question ${questionIndex + 1}`;
      diagram.append(image);
      item.append(diagram);
    }

    item.append(questionText, options, explanation);
    questionsContainer.append(item);
  });
}

function renderResult(result) {
  practiceId.textContent = result.practice.id;
  resultsSummary.textContent = [
    result.topicName,
    result.language,
    result.replacement.replaced ? "Replaced previous practice" : "New practice",
    `${result.categoryResults.length} generated categories`,
    `${result.prompts.length} LLM attempts`
  ].join(" / ");
  allocationSummary.hidden = false;
  renderAllocation(result.allocation);
  renderQuestions(result.questions);
  resultsSection.hidden = false;
}

function renderExistingPractice(result) {
  practiceId.textContent = result.practice.id;
  resultsSummary.textContent = [
    "Existing assigned practice",
    `${result.questions.length} questions`
  ].join(" / ");
  allocationSummary.hidden = true;
  renderQuestions(result.questions);
  resultsSection.hidden = false;
}

async function displayExistingPractice() {
  const assignment = getExistingAssignment();
  const syllabusId = syllabusSelect.value;
  const topicId = topicSelect.value;
  const language = languageSelect.value;
  const loadVersion = ++existingPracticeLoadVersion;

  clearStatus();
  clearQuestions();
  resultsSection.hidden = true;

  if (!assignment || !syllabusId || !topicId || !language) {
    return;
  }

  practiceId.textContent = assignment.practiceId;
  resultsSummary.textContent = "Loading existing questions...";
  allocationSummary.hidden = true;
  resultsSection.hidden = false;

  try {
    const result = await loadPreAssessmentPractice({
      syllabusId,
      topicId,
      language
    });

    if (loadVersion !== existingPracticeLoadVersion) {
      return;
    }

    if (result) {
      renderExistingPractice(result);
    }
  } catch (error) {
    if (loadVersion !== existingPracticeLoadVersion) {
      return;
    }

    resultsSection.hidden = true;
    setStatus(
      error.message || "Could not load the existing pre-assessment practice.",
      true
    );
  }
}

function recordAssignment(result) {
  const topic = getSelectedTopic();

  if (!topic) {
    return;
  }

  topic.preAssessmentPractices = {
    ...(topic.preAssessmentPractices || {}),
    [result.language.toLowerCase()]: {
      language: result.language,
      practiceId: result.practice.id
    }
  };
}

async function generatePractice() {
  existingPracticeLoadVersion += 1;
  setBusy(true);
  clearStatus();
  clearQuestions();
  resultsSection.hidden = true;

  try {
    const result = await generatePreAssessmentPractice({
      syllabusId: syllabusSelect.value,
      topicId: topicSelect.value,
      language: languageSelect.value
    });

    recordAssignment(result);
    renderResult(result);
    updateAssignmentMessage();
    setStatus(
      result.replacement.replaced
        ? "Pre-assessment practice regenerated; the previous practice and questions were deleted."
        : "Pre-assessment practice generated and assigned."
    );
  } catch (error) {
    setStatus(
      error.message || "Could not generate the pre-assessment practice.",
      true
    );
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  try {
    const options = await loadPreAssessmentGeneratorOptions();

    syllabuses = options.syllabuses || [];
    renderSyllabuses();

    if (syllabuses.length === 0) {
      setStatus(
        "No syllabus has all required topics, languages, and an assessment framework.",
        true
      );
    }
  } catch (error) {
    setStatus(
      error.message || "Could not load pre-assessment generator options.",
      true
    );
  } finally {
    updateGenerateButton();
  }
}

syllabusSelect.addEventListener("change", displaySelectedSyllabus);
topicSelect.addEventListener("change", () => {
  updateAssignmentMessage();
  displayExistingPractice();
});
languageSelect.addEventListener("change", () => {
  updateAssignmentMessage();
  displayExistingPractice();
});
generateButton.addEventListener("click", generatePractice);

initPage();
