const {ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES} = require("../../../schema/essay_question_generator_schema");


function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}
function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(name + " must be a nonempty string.");
  return value.trim();
}
function instruction(value, name) {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error(name + " must be a string.");
  return value.trim();
}
function requireKnownKeys(value, keys, name) {
  requireRecord(value, name);
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error(name + " contains an unsupported key.");
  return value;
}
function normalizeWordCountRequirement(value) {
  const requirement = requireKnownKeys(value === undefined ? {} : value, ["minWords"], "wordCountRequirement");
  const minWords = requirement.minWords === undefined ? null : requirement.minWords;
  if (minWords !== null && (!Number.isSafeInteger(minWords) || minWords < 1)) {
    throw new Error("minWords must be a positive safe integer or null.");
  }
  return {minWords};
}
function normalizeConfiguration(input) {
  requireRecord(input, "Essay question generator configuration");
  const levels = Object.values(ESSAY_QUESTION_LEVELS);
  const standards = ESSAY_QUESTION_STANDARDS.map(String);
  const difficulties = Object.values(ESSAY_QUESTION_DIFFICULTIES);
  const gradeInput = requireKnownKeys(input.gradeInstructions === undefined ? {} : input.gradeInstructions, levels, "gradeInstructions");
  const gradeInstructions = Object.fromEntries(levels.map(level => {
    const grades = requireKnownKeys(gradeInput[level] === undefined ? {} : gradeInput[level], standards, "gradeInstructions." + level);
    return [level, Object.fromEntries(standards.map(standard =>
      [standard, instruction(grades[standard], "gradeInstructions." + level + "." + standard)]))];
  }));
  const difficultyInput = requireKnownKeys(input.difficultyInstructions === undefined ? {} : input.difficultyInstructions, difficulties, "difficultyInstructions");
  const wordCountInput = requireKnownKeys(input.gradeWordCountRequirements === undefined ? {} : input.gradeWordCountRequirements,
    levels, "gradeWordCountRequirements");
  const gradeWordCountRequirements = Object.fromEntries(levels.map(level => {
    const grades = requireKnownKeys(wordCountInput[level] === undefined ? {} : wordCountInput[level], standards,
      "gradeWordCountRequirements." + level);
    return [level, Object.fromEntries(standards.map(standard => [standard, normalizeWordCountRequirement(grades[standard])]))];
  }));
  return {
    additionalLlmInstructions: instruction(input.additionalLlmInstructions, "additionalLlmInstructions"),
    gradeInstructions,
    gradeWordCountRequirements,
    difficultyInstructions: Object.fromEntries(difficulties.map(difficulty =>
      [difficulty, instruction(difficultyInput[difficulty], "difficultyInstructions." + difficulty)])),
  };
}
function createDefaultConfiguration() {return normalizeConfiguration({});}
function requireAdministratorUid(value) {return requireText(value, "updatedBy");}
function requireDate(value, name) {
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error(name + " must be a valid timestamp.");
  return new Date(date.getTime());
}
class EssayQuestionGeneratorConfig {
  constructor(input) {
    Object.assign(this, normalizeConfiguration(input));
    this.updatedAt = requireDate(input.updatedAt, "updatedAt");
    this.updatedBy = requireAdministratorUid(input.updatedBy);
    for (const grades of Object.values(this.gradeInstructions)) Object.freeze(grades);
    Object.freeze(this.gradeInstructions);
    for (const grades of Object.values(this.gradeWordCountRequirements)) {
      Object.values(grades).forEach(Object.freeze);
      Object.freeze(grades);
    }
    Object.freeze(this.gradeWordCountRequirements);
    Object.freeze(this.difficultyInstructions);
    Object.freeze(this);
  }
}


module.exports = {requireRecord, requireText, requireDate, requireAdministratorUid, normalizeWordCountRequirement, normalizeConfiguration, createDefaultConfiguration, EssayQuestionGeneratorConfig};
