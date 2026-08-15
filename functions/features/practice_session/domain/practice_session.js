const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function normalizeOption(value, fieldName = "selectedOption") {
  const option = requireText(value, fieldName).toLowerCase();

  if (!QUESTION_OPTION_KEYS.includes(option)) {
    throw new Error(`${fieldName} must be a, b, c, or d.`);
  }

  return option;
}

function normalizeDate(value, fieldName) {
  const dateValue = value && typeof value.toDate === "function"
    ? value.toDate()
    : value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("question options must be an object.");
  }

  return Object.freeze(Object.fromEntries(
    QUESTION_OPTION_KEYS.map((key) => [
      key,
      requireText(options[key], `options.${key}`),
    ]),
  ));
}

class PracticeSessionQuestion {
  constructor({
    id,
    syllabusId,
    topicId,
    questionText,
    options,
    hasDiagram = false,
    svg = "",
    difficulty,
    language,
  } = {}) {
    this.id = requireIdentifier(id, "question.id");
    this.syllabusId = requireIdentifier(syllabusId, "question.syllabusId");
    this.topicId = requireIdentifier(topicId, "question.topicId");
    this.questionText = requireText(questionText, "question.questionText");
    this.options = normalizeOptions(options);

    if (typeof hasDiagram !== "boolean") {
      throw new Error("question.hasDiagram must be a boolean.");
    }

    this.hasDiagram = hasDiagram;
    this.svg = hasDiagram ? requireText(svg, "question.svg") : "";
    this.difficulty = requireText(difficulty, "question.difficulty");
    this.language = requireText(language, "question.language");

    Object.freeze(this);
  }
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("At least one practice question is required.");
  }

  const questionIds = new Set();
  const normalizedQuestions = questions.map((question) =>
    question instanceof PracticeSessionQuestion
      ? question
      : new PracticeSessionQuestion(question),
  );

  normalizedQuestions.forEach((question) => {
    if (questionIds.has(question.id)) {
      throw new Error(`Duplicate practice question ID: ${question.id}.`);
    }

    questionIds.add(question.id);
  });

  return Object.freeze(normalizedQuestions);
}

function normalizeAnswers(answers, questions) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("answers must be an object.");
  }

  const questionIds = new Set(questions.map((question) => question.id));

  return Object.freeze(Object.fromEntries(
    Object.entries(answers).map(([questionIdValue, selectedOption]) => {
      const questionId = requireIdentifier(questionIdValue, "questionId");

      if (!questionIds.has(questionId)) {
        throw new Error(`Question ${questionId} is not in this session.`);
      }

      return [questionId, normalizeOption(
        selectedOption,
        `answers.${questionId}`,
      )];
    }),
  ));
}

class PracticeSession {
  constructor({
    practiceId,
    studentId,
    practiceType,
    questions,
    answers = {},
    startedAt = new Date(),
    submitted = false,
  } = {}) {
    this.practiceId = requireIdentifier(practiceId, "practiceId");
    this.studentId = requireIdentifier(studentId, "studentId");
    this.practiceType = requireIdentifier(practiceType, "practiceType");
    this.questions = normalizeQuestions(questions);
    this.answers = normalizeAnswers(answers, this.questions);
    this.startedAt = normalizeDate(startedAt, "startedAt");

    if (typeof submitted !== "boolean") {
      throw new Error("submitted must be a boolean.");
    }

    this.submitted = submitted;

    Object.freeze(this);
  }

  answerQuestion(questionIdValue, selectedOption) {
    if (this.submitted) {
      throw new Error("The practice session has already been submitted.");
    }

    const questionId = requireIdentifier(questionIdValue, "questionId");

    if (!this.questions.some((question) => question.id === questionId)) {
      throw new Error(`Question ${questionId} is not in this session.`);
    }

    return new PracticeSession({
      ...this,
      answers: {
        ...this.answers,
        [questionId]: normalizeOption(selectedOption),
      },
    });
  }

  isComplete() {
    return Object.keys(this.answers).length === this.questions.length;
  }

  toResultSubmission(completedAt = new Date()) {
    if (this.submitted) {
      throw new Error("The practice session has already been submitted.");
    }

    if (!this.isComplete()) {
      throw new Error("An answer is required for every practice question.");
    }

    const completionDate = normalizeDate(completedAt, "completedAt");
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((completionDate.getTime() - this.startedAt.getTime()) / 1000),
    );

    return {
      practiceId: this.practiceId,
      studentId: this.studentId,
      timeTakenSeconds,
      answers: this.questions.map((question) => ({
        questionId: question.id,
        selectedOption: this.answers[question.id],
      })),
    };
  }

  markSubmitted() {
    return new PracticeSession({
      ...this,
      submitted: true,
    });
  }
}

module.exports = {
  PracticeSession,
  PracticeSessionQuestion,
};
