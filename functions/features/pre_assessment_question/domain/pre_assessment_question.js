const {
  practiceTypes,
} = require("../../../schema/practice_schema");

const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function requireText(value, fieldName) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function optionalText(value) {
  return normalizeText(value);
}

function optionalId(value) {
  const normalizedValue = normalizeText(value);

  return normalizedValue || null;
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("options must be an object.");
  }

  return Object.fromEntries(
    QUESTION_OPTION_KEYS.map((optionKey) => [
      optionKey,
      requireText(options[optionKey], `options.${optionKey}`),
    ]),
  );
}

function normalizePreAssessmentQuestionOption(
  value,
  fieldName = "selectedOption",
) {
  const option = requireText(value, fieldName).toLowerCase();

  if (!QUESTION_OPTION_KEYS.includes(option)) {
    throw new Error(`${fieldName} must be a, b, c, or d.`);
  }

  return option;
}

function normalizeHasDiagram(value) {
  if (typeof value !== "boolean") {
    throw new Error("hasDiagram must be a boolean.");
  }

  return value;
}

function normalizePreAssessmentQuestionGroup(
  value = practiceTypes.PRE_ASSESSMENT,
) {
  const group = requireText(value, "group").toLowerCase();

  if (group !== practiceTypes.PRE_ASSESSMENT) {
    throw new Error(`group must be ${practiceTypes.PRE_ASSESSMENT}.`);
  }

  return group;
}

class PreAssessmentQuestion {
  constructor({
    id = null,
    syllabusId,
    topicId,
    questionText,
    options,
    correctAnswer,
    group = practiceTypes.PRE_ASSESSMENT,
    explanation = "",
    hasDiagram = false,
    svg = "",
    difficulty,
    language,
    specialInstruction = "",
  } = {}) {
    this.id = optionalId(id);
    this.syllabusId = requireText(syllabusId, "syllabusId");
    this.topicId = requireText(topicId, "topicId");
    this.questionText = requireText(questionText, "questionText");
    this.options = normalizeOptions(options);
    this.correctAnswer = normalizePreAssessmentQuestionOption(
      correctAnswer,
      "correctAnswer",
    );
    this.group = normalizePreAssessmentQuestionGroup(group);
    this.explanation = optionalText(explanation);
    this.hasDiagram = normalizeHasDiagram(hasDiagram);
    this.svg = this.hasDiagram ? requireText(svg, "svg") : "";
    this.difficulty = requireText(difficulty, "difficulty");
    this.language = requireText(language, "language");
    this.specialInstruction = optionalText(specialInstruction);
  }
}

module.exports = {
  PreAssessmentQuestion,
  normalizePreAssessmentQuestionOption,
};
