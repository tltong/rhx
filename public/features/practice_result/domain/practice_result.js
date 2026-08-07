const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeOption(value, fieldName) {
  const option = String(value ?? "").trim().toLowerCase();

  if (!QUESTION_OPTION_KEYS.includes(option)) {
    throw new Error(`${fieldName} must be a, b, c, or d.`);
  }

  return option;
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

function normalizeNonNegativeInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return number;
}

export function calculatePracticeScore(questionsCorrect, totalQuestions) {
  if (!Number.isInteger(questionsCorrect) || questionsCorrect < 0) {
    throw new Error("questionsCorrect must be a non-negative integer.");
  }

  if (!Number.isInteger(totalQuestions) || totalQuestions < 1) {
    throw new Error("totalQuestions must be a positive integer.");
  }

  if (questionsCorrect > totalQuestions) {
    throw new Error("questionsCorrect cannot exceed totalQuestions.");
  }

  return Math.round((questionsCorrect / totalQuestions) * 10000) / 100;
}

function normalizeAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("answers must be an object.");
  }

  const entries = Object.entries(answers);

  if (entries.length === 0) {
    throw new Error("At least one answer is required.");
  }

  return Object.freeze(Object.fromEntries(entries.map(
    ([questionIdValue, answer], index) => {
      const questionId = requireIdentifier(
        questionIdValue,
        `answers[${index}].questionId`
      );

      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        throw new Error(`answers.${questionId} must be an object.`);
      }

      const selectedOption = normalizeOption(
        answer.selectedOption,
        `answers.${questionId}.selectedOption`
      );
      const correctAnswer = normalizeOption(
        answer.correctAnswer,
        `answers.${questionId}.correctAnswer`
      );

      if (typeof answer.isCorrect !== "boolean") {
        throw new Error(`answers.${questionId}.isCorrect must be a boolean.`);
      }

      if (answer.isCorrect !== (selectedOption === correctAnswer)) {
        throw new Error(`answers.${questionId}.isCorrect is inconsistent.`);
      }

      return [questionId, Object.freeze({
        selectedOption,
        correctAnswer,
        isCorrect: answer.isCorrect
      })];
    }
  )));
}

/**
 * @typedef {Object} PracticeResultInput
 * @property {string} practiceId
 * @property {string} studentId
 * @property {Date|string|number} submittedAt
 * @property {number} timeTakenSeconds
 * @property {number} questionsCorrect
 * @property {number} totalQuestions
 * @property {number} score
 * @property {Object<string, {
 *   selectedOption: string,
 *   correctAnswer: string,
 *   isCorrect: boolean
 * }>} answers
 */

export class PracticeResult {
  /** @param {PracticeResultInput} input */
  constructor({
    practiceId,
    studentId,
    submittedAt,
    timeTakenSeconds,
    questionsCorrect,
    totalQuestions,
    score,
    answers
  } = {}) {
    this.practiceId = requireIdentifier(practiceId, "practiceId");
    this.studentId = requireIdentifier(studentId, "studentId");
    this.submittedAt = normalizeDate(submittedAt);
    this.timeTakenSeconds = normalizeNonNegativeInteger(
      timeTakenSeconds,
      "timeTakenSeconds"
    );
    this.questionsCorrect = normalizeNonNegativeInteger(
      questionsCorrect,
      "questionsCorrect"
    );
    this.totalQuestions = normalizeNonNegativeInteger(
      totalQuestions,
      "totalQuestions"
    );
    this.answers = normalizeAnswers(answers);

    if (this.totalQuestions < 1) {
      throw new Error("totalQuestions must be a positive integer.");
    }

    if (Object.keys(this.answers).length !== this.totalQuestions) {
      throw new Error("answers count must equal totalQuestions.");
    }

    const countedCorrectAnswers = Object.values(this.answers)
      .filter((answer) => answer.isCorrect).length;

    if (countedCorrectAnswers !== this.questionsCorrect) {
      throw new Error("questionsCorrect does not match answers.");
    }

    const expectedScore = calculatePracticeScore(
      this.questionsCorrect,
      this.totalQuestions
    );
    const normalizedScore = Number(score);

    if (!Number.isFinite(normalizedScore) || normalizedScore !== expectedScore) {
      throw new Error(`score must equal ${expectedScore}.`);
    }

    this.score = normalizedScore;

    Object.freeze(this);
  }
}
