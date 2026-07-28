const {
  practiceTypes,
} = require("../../../schema/practice_schema");

const PRACTICE_TYPE_VALUES = new Set(Object.values(practiceTypes));

function optionalIdentifier(value) {
  const identifier = String(value ?? "").trim();

  return identifier || null;
}

function requireIdentifier(value, fieldName) {
  const identifier = optionalIdentifier(value);

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizePracticeType(value) {
  const type = String(value ?? "").trim().toLowerCase();

  if (!PRACTICE_TYPE_VALUES.has(type)) {
    throw new Error(
      `type must be one of: ${[...PRACTICE_TYPE_VALUES].join(", ")}.`,
    );
  }

  return type;
}

function normalizeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("dateGenerated must be a valid date.");
  }

  return date;
}

/**
 * @typedef {Object} PracticeQuestionInput
 * @property {string} syllabusId
 * @property {string} topicId
 * @property {string} questionId
 */

class PracticeQuestionReference {
  /** @param {PracticeQuestionInput} input */
  constructor({
    syllabusId,
    topicId,
    questionId,
  } = {}) {
    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.topicId = requireIdentifier(topicId, "topicId");
    this.questionId = requireIdentifier(questionId, "questionId");

    Object.freeze(this);
  }
}

/**
 * @typedef {Object} PracticeInput
 * @property {string} type
 * @property {PracticeQuestionInput[]} questions
 */

class Practice {
  constructor({
    id = null,
    type,
    questions,
    dateGenerated = new Date(),
  } = {}) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("At least one question is required.");
    }

    const normalizedQuestions = questions.map((question) =>
      question instanceof PracticeQuestionReference
        ? question
        : new PracticeQuestionReference(question),
    );
    const questionKeys = new Set();

    normalizedQuestions.forEach((question) => {
      const key = [
        question.syllabusId,
        question.topicId,
        question.questionId,
      ].join("/");

      if (questionKeys.has(key)) {
        throw new Error(`Duplicate question reference: ${key}.`);
      }

      questionKeys.add(key);
    });

    this.id = optionalIdentifier(id);
    this.type = normalizePracticeType(type);
    this.questions = Object.freeze(normalizedQuestions);
    this.dateGenerated = normalizeDate(dateGenerated);
  }
}

module.exports = {
  Practice,
  PracticeQuestionReference,
};
