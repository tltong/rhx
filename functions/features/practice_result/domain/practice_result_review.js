const OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function normalizeDate(value) {
  const dateValue = value && typeof value.toDate === "function"
    ? value.toDate()
    : value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error("submittedAt must be a valid date.");
  }

  return date;
}

function normalizeOption(value, fieldName) {
  const option = requireText(value, fieldName).toLowerCase();

  if (!OPTION_KEYS.includes(option)) {
    throw new Error(`${fieldName} must be one of: ${OPTION_KEYS.join(", ")}.`);
  }

  return option;
}

function normalizeOptions(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return Object.freeze(Object.fromEntries(OPTION_KEYS.map((optionKey) => [
    optionKey,
    requireText(value[optionKey], `${fieldName}.${optionKey}`),
  ])));
}

function normalizeQuestion(question, index) {
  const fieldName = `questions[${index}]`;
  const selectedOption = normalizeOption(
    question.selectedOption,
    `${fieldName}.selectedOption`,
  );
  const correctAnswer = normalizeOption(
    question.correctAnswer,
    `${fieldName}.correctAnswer`,
  );

  if (typeof question.isCorrect !== "boolean") {
    throw new Error(`${fieldName}.isCorrect must be a boolean.`);
  }

  if (question.isCorrect !== (selectedOption === correctAnswer)) {
    throw new Error(`${fieldName}.isCorrect is inconsistent.`);
  }

  const hasDiagram = Boolean(question.hasDiagram);
  const svg = String(question.svg ?? "").trim();

  if (hasDiagram && !svg) {
    throw new Error(`${fieldName}.svg is required for a diagram question.`);
  }

  return Object.freeze({
    questionId: requireText(question.questionId, `${fieldName}.questionId`),
    questionText: requireText(
      question.questionText,
      `${fieldName}.questionText`,
    ),
    options: normalizeOptions(question.options, `${fieldName}.options`),
    selectedOption,
    correctAnswer,
    isCorrect: question.isCorrect,
    explanation: String(question.explanation ?? "").trim(),
    hasDiagram,
    svg: hasDiagram ? svg : "",
  });
}

class PracticeResultReview {
  constructor({
    practiceId,
    studentId,
    practiceType,
    submittedAt,
    timeTakenSeconds,
    questionsCorrect,
    totalQuestions,
    score,
    questions,
  } = {}) {
    this.practiceId = requireText(practiceId, "practiceId");
    this.studentId = requireText(studentId, "studentId");
    this.practiceType = requireText(practiceType, "practiceType");
    this.submittedAt = normalizeDate(submittedAt);
    this.timeTakenSeconds = Number(timeTakenSeconds);
    this.questionsCorrect = Number(questionsCorrect);
    this.totalQuestions = Number(totalQuestions);
    this.score = Number(score);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("At least one reviewed question is required.");
    }

    this.questions = Object.freeze(questions.map(normalizeQuestion));

    if (
      !Number.isInteger(this.timeTakenSeconds)
      || this.timeTakenSeconds < 0
    ) {
      throw new Error("timeTakenSeconds must be a non-negative integer.");
    }

    if (
      !Number.isInteger(this.questionsCorrect)
      || this.questionsCorrect < 0
    ) {
      throw new Error("questionsCorrect must be a non-negative integer.");
    }

    if (
      !Number.isInteger(this.totalQuestions)
      || this.totalQuestions !== this.questions.length
    ) {
      throw new Error("totalQuestions must equal the reviewed question count.");
    }

    if (!Number.isFinite(this.score) || this.score < 0 || this.score > 100) {
      throw new Error("score must be between 0 and 100.");
    }

    const correctCount = this.questions.filter(
      (question) => question.isCorrect,
    ).length;

    if (correctCount !== this.questionsCorrect) {
      throw new Error("questionsCorrect does not match reviewed questions.");
    }

    Object.freeze(this);
  }
}

module.exports = {
  PracticeResultReview,
};
