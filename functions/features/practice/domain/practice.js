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

function normalizeHasDiagram(value) {
  if (typeof value !== "boolean") {
    throw new Error("hasDiagram must be a boolean.");
  }

  return value;
}

/**
 * @typedef {Object} PracticeQuestionInput
 * @property {string} syllabusId
 * @property {string} topicId
 * @property {string} [language] Required for assessment practices.
 * @property {boolean} [hasDiagram] Required for assessment practices.
 * @property {string} questionId
 */

class PracticeQuestionReference {
  /** @param {PracticeQuestionInput} input */
  constructor({
    syllabusId,
    topicId,
    language,
    hasDiagram,
    questionId,
  } = {}, practiceType) {
    const normalizedPracticeType = normalizePracticeType(practiceType);

    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.topicId = requireIdentifier(topicId, "topicId");

    if (normalizedPracticeType === practiceTypes.ASSESSMENT) {
      this.language = requireIdentifier(language, "language");
      this.hasDiagram = normalizeHasDiagram(hasDiagram);
    }

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

    const normalizedType = normalizePracticeType(type);
    const normalizedQuestions = questions.map((question) =>
      new PracticeQuestionReference(question, normalizedType),
    );
    const questionKeys = new Set();

    normalizedQuestions.forEach((question) => {
      const keyParts = [
        question.syllabusId,
        question.topicId,
      ];

      if (normalizedType === practiceTypes.ASSESSMENT) {
        keyParts.push(
          question.language,
          question.hasDiagram ? "withDiagram" : "withoutDiagram",
        );
      }

      const key = [...keyParts, question.questionId].join("/");

      if (questionKeys.has(key)) {
        throw new Error(`Duplicate question reference: ${key}.`);
      }

      questionKeys.add(key);
    });

    this.id = optionalIdentifier(id);
    this.type = normalizedType;
    this.questions = Object.freeze(normalizedQuestions);
    this.dateGenerated = normalizeDate(dateGenerated);
  }
}

module.exports = {
  Practice,
  PracticeQuestionReference,
};
