function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeDate(value) {
  const dateValue = value && typeof value.toDate === "function"
    ? value.toDate()
    : value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error("dateCompleted must be a valid date.");
  }

  return date;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return number;
}

function normalizeStudentAnswers(studentAnswers, totalQuestions) {
  if (
    !studentAnswers ||
    typeof studentAnswers !== "object" ||
    Array.isArray(studentAnswers)
  ) {
    throw new Error("studentAnswers must be an object.");
  }

  const entries = Object.entries(studentAnswers);

  if (entries.length !== totalQuestions) {
    throw new Error("studentAnswers count must equal totalQuestions.");
  }

  return Object.freeze(Object.fromEntries(entries.map(
    ([questionIdValue, answer], index) => {
      const questionId = requireIdentifier(
        questionIdValue,
        `studentAnswers[${index}].questionId`,
      );

      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        throw new Error(`studentAnswers.${questionId} must be an object.`);
      }

      if (typeof answer.isCorrect !== "boolean") {
        throw new Error(
          `studentAnswers.${questionId}.isCorrect must be a boolean.`,
        );
      }

      return [questionId, Object.freeze({
        selectedOption: requireIdentifier(
          answer.selectedOption,
          `studentAnswers.${questionId}.selectedOption`,
        ).toLowerCase(),
        correctAnswer: requireIdentifier(
          answer.correctAnswer,
          `studentAnswers.${questionId}.correctAnswer`,
        ).toLowerCase(),
        isCorrect: answer.isCorrect,
      })];
    }),
  ));
}

class StudentPracticeCompletion {
  constructor({
    studentId,
    practiceId,
    dateCompleted,
    questionsCorrect,
    totalQuestions,
    score,
    timeTakenSeconds,
    studentAnswers,
  } = {}) {
    this.studentId = requireIdentifier(studentId, "studentId");
    this.practiceId = requireIdentifier(practiceId, "practiceId");
    this.dateCompleted = normalizeDate(dateCompleted);
    this.questionsCorrect = normalizeNonNegativeInteger(
      questionsCorrect,
      "questionsCorrect",
    );
    this.totalQuestions = normalizeNonNegativeInteger(
      totalQuestions,
      "totalQuestions",
    );
    this.timeTakenSeconds = normalizeNonNegativeInteger(
      timeTakenSeconds,
      "timeTakenSeconds",
    );
    this.score = Number(score);

    if (this.totalQuestions < 1) {
      throw new Error("totalQuestions must be a positive integer.");
    }

    if (this.questionsCorrect > this.totalQuestions) {
      throw new Error("questionsCorrect cannot exceed totalQuestions.");
    }

    const expectedScore = Math.round(
      (this.questionsCorrect / this.totalQuestions) * 10000,
    ) / 100;

    if (!Number.isFinite(this.score) || this.score !== expectedScore) {
      throw new Error(`score must equal ${expectedScore}.`);
    }

    this.studentAnswers = normalizeStudentAnswers(
      studentAnswers,
      this.totalQuestions,
    );

    const countedCorrectAnswers = Object.values(this.studentAnswers)
      .filter((answer) => answer.isCorrect).length;

    if (countedCorrectAnswers !== this.questionsCorrect) {
      throw new Error("questionsCorrect does not match studentAnswers.");
    }

    Object.freeze(this);
  }
}

module.exports = {
  StudentPracticeCompletion,
};
