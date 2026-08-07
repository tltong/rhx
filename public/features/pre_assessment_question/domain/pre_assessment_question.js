import {
  practiceTypes
} from "../../../config/firebase/practice_schema.js?v=20260730-pre-assessment-question";

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
      requireText(options[optionKey], `options.${optionKey}`)
    ])
  );
}

export function normalizePreAssessmentQuestionOption(
  value,
  fieldName = "selectedOption"
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

export function normalizePreAssessmentQuestionGroup(
  value = practiceTypes.PRE_ASSESSMENT
) {
  const group = requireText(value, "group").toLowerCase();

  if (group !== practiceTypes.PRE_ASSESSMENT) {
    throw new Error(
      `group must be ${practiceTypes.PRE_ASSESSMENT}.`
    );
  }

  return group;
}

/**
 * @typedef {Object} PreAssessmentQuestionInput
 * @property {string} [id]
 * @property {string} syllabusId
 * @property {string} topicId
 * @property {string} questionText
 * @property {{a: string, b: string, c: string, d: string}} options
 * @property {string} correctAnswer
 * @property {string} [group]
 * @property {string} [explanation]
 * @property {boolean} [hasDiagram]
 * @property {string} [svg]
 * @property {string} difficulty
 * @property {string} language
 * @property {string} [specialInstruction]
 */

export class PreAssessmentQuestion {
  /** @param {PreAssessmentQuestionInput} input */
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
    specialInstruction = ""
  } = {}) {
    this.id = optionalId(id);
    this.syllabusId = requireText(syllabusId, "syllabusId");
    this.topicId = requireText(topicId, "topicId");
    this.questionText = requireText(questionText, "questionText");
    this.options = normalizeOptions(options);
    this.correctAnswer = normalizePreAssessmentQuestionOption(
      correctAnswer,
      "correctAnswer"
    );
    this.group = normalizePreAssessmentQuestionGroup(group);
    this.explanation = optionalText(explanation);
    this.hasDiagram = normalizeHasDiagram(hasDiagram);
    this.svg = this.hasDiagram ? requireText(svg, "svg") : "";
    this.difficulty = requireText(difficulty, "difficulty");
    this.language = requireText(language, "language");
    this.specialInstruction = optionalText(specialInstruction);
  }

  update(changes = {}) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("changes must be an object.");
    }

    const updatedQuestion = new PreAssessmentQuestion({
      ...this,
      ...changes,
      id: this.id
    });

    Object.assign(this, updatedQuestion);

    return this;
  }
}
