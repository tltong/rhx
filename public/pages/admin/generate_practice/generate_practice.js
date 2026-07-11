import {
  readSyllabusWithTopics,
  readSyllabuses
} from "../../../handler/syllabus_handler.js?v=20260711-year-field";
import {
  readStudents
} from "../../../handler/student_handler.js?v=20260711-generate-practice";
import {
  assignPracticeToStudent,
  generatePractice,
  readPractice
} from "../../../handler/practice_generation_handler.js?v=20260711-student-assignment";

const countrySelect = document.querySelector("#country");
const levelSelect = document.querySelector("#level");
const yearSelect = document.querySelector("#year");
const subjectSelect = document.querySelector("#subject");
const topicsList = document.querySelector("#topics-list");
const studentSelect = document.querySelector("#student");
const numberOfQuestionsInput = document.querySelector("#number-of-questions");
const difficultySelect = document.querySelector("#difficulty");
const languageSelect = document.querySelector("#language");
const temperatureInput = document.querySelector("#temperature");
const specialInstructionInput = document.querySelector("#special-instruction");
const generateButton = document.querySelector("#generate-button");
const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");

let syllabuses = [];
let students = [];
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

function getStudentLabel(student = {}) {
  const name = student.name || "Unnamed student";
  const username = student.username ? ` (${student.username})` : "";

  return `${name}${username}`;
}

function populateStudents() {
  clearSelect(studentSelect, "Select student");

  students
    .slice()
    .sort((left, right) => getStudentLabel(left).localeCompare(getStudentLabel(right)))
    .forEach((student) => {
      studentSelect.append(createOption(student.id, getStudentLabel(student)));
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

function distributeQuestionCount(totalQuestions, selectedTopicCount) {
  if (selectedTopicCount === 0) {
    throw new Error("Select at least one topic.");
  }

  if (totalQuestions < selectedTopicCount) {
    throw new Error("Total questions must be at least the number of selected topics.");
  }

  const baseCount = Math.floor(totalQuestions / selectedTopicCount);
  const remainder = totalQuestions % selectedTopicCount;

  return Array.from({ length: selectedTopicCount }, (_, index) =>
    baseCount + (index < remainder ? 1 : 0)
  );
}

function refreshGenerateButtonState() {
  generateButton.disabled = !currentSyllabus ||
    getSelectedTopicIds().length === 0 ||
    !studentSelect.value ||
    !numberOfQuestionsInput.value ||
    !numberOfQuestionsInput.checkValidity() ||
    !difficultySelect.value ||
    !languageSelect.value ||
    !temperatureInput.value ||
    !temperatureInput.checkValidity();
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
      ? "Select topics and a student, then generate the practice."
      : "This syllabus has no topics.");
  } catch (error) {
    resetSyllabusSelection("Could not load topics.");
    showError(error, "Could not load topics.");
  } finally {
    setBusy(false);
  }
}

async function loadInitialData() {
  setBusy(true);
  setStatus("Loading syllabuses and students...");
  outputEl.textContent = "{}";

  try {
    const [loadedSyllabuses, loadedStudents] = await Promise.all([
      readSyllabuses(),
      readStudents()
    ]);

    syllabuses = loadedSyllabuses;
    students = loadedStudents;

    populateCountries();
    populateLevels();
    populateYears();
    populateSubjects();
    populateStudents();
    resetSyllabusSelection(syllabuses.length > 0
      ? "Select country, level, year, and subject to load topics."
      : "No syllabuses found.");

    if (syllabuses.length === 0) {
      setStatus("No syllabuses found.", true);
    } else if (students.length === 0) {
      setStatus("No students found.", true);
    } else {
      setStatus("Select country, level, year, subject, topics, and student.");
    }
  } catch (error) {
    showError(error, "Could not load initial data.");
  } finally {
    setBusy(false);
  }
}

function getPracticeInput(topic, numberOfQuestions, practiceId = null) {
  if (!currentSyllabus) {
    throw new Error("Select a syllabus first.");
  }

  return {
    practiceId,
    country: currentSyllabus.country,
    level: currentSyllabus.level,
    year: currentSyllabus.year,
    subject: currentSyllabus.subject,
    syllabusId: currentSyllabus.id,
    topicId: topic.id,
    numberOfQuestions,
    difficulty: difficultySelect.value,
    language: languageSelect.value,
    specialInstruction: specialInstructionInput.value.trim()
  };
}

async function generatePracticeForStudent() {
  const selectedTopics = getSelectedTopics();
  const studentId = studentSelect.value;

  if (selectedTopics.length === 0) {
    setStatus("Select at least one topic.", true);
    return;
  }

  if (!studentId) {
    setStatus("Select a student.", true);
    return;
  }

  let totalQuestionCount;
  let temperature;
  let questionCountsByTopic;

  try {
    totalQuestionCount = parseNumberOfQuestions();
    temperature = parseTemperature();
    questionCountsByTopic = distributeQuestionCount(totalQuestionCount, selectedTopics.length);
  } catch (error) {
    showError(error, "Invalid practice settings.");
    return;
  }

  setBusy(true);
  setStatus(`Generating ${totalQuestionCount} question(s) for ${selectedTopics.length} topic(s)...`);
  outputEl.textContent = "{}";

  try {
    let practiceId = null;
    const topicResults = [];

    for (const [index, topic] of selectedTopics.entries()) {
      const questionCount = questionCountsByTopic[index];

      setStatus(
        `Generating ${questionCount} question(s) for ${topic.topicName || topic.id} (${index + 1} of ${selectedTopics.length})...`
      );

      const result = await generatePractice(
        getPracticeInput(topic, questionCount, practiceId),
        { temperature }
      );

      practiceId = result.practice.id;
      topicResults.push({
        topicId: topic.id,
        topicName: topic.topicName || topic.id,
        requestedQuestionCount: questionCount,
        result
      });
    }

    const assignment = await assignPracticeToStudent(studentId, practiceId);
    const practice = await readPractice(practiceId);
    const selectedStudent = students.find((student) => student.id === studentId) || null;
    const response = {
      practice,
      assignment,
      student: selectedStudent,
      requestedQuestionCount: totalQuestionCount,
      selectedTopicCount: selectedTopics.length,
      topicResults
    };

    outputEl.textContent = JSON.stringify(response, null, 2);
    setStatus(`Generated and assigned practice ${practiceId}.`);
  } catch (error) {
    showError(error, "Practice generation failed.");
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
studentSelect.addEventListener("change", refreshGenerateButtonState);
numberOfQuestionsInput.addEventListener("input", refreshGenerateButtonState);
difficultySelect.addEventListener("change", refreshGenerateButtonState);
languageSelect.addEventListener("change", refreshGenerateButtonState);
temperatureInput.addEventListener("input", refreshGenerateButtonState);
generateButton.addEventListener("click", generatePracticeForStudent);

loadInitialData();
