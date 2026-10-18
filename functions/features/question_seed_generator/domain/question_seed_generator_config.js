const {DEFAULT_QUESTION_GENERATION_SEED} = require("../../../schema/question_seed_generator_schema");

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}

function normalizeConfiguration(input) {
  requireRecord(input, "Question seed generator configuration");
  if (typeof input.generationSeed !== "string") throw new Error("generationSeed must be a string.");
  if (typeof input.additionalLlmInstructions !== "string") {
    throw new Error("additionalLlmInstructions must be a string.");
  }
  return {
    generationSeed: input.generationSeed.trim() || DEFAULT_QUESTION_GENERATION_SEED,
    additionalLlmInstructions: input.additionalLlmInstructions.trim(),
  };
}

function requireAdministratorUid(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("updatedBy must be an administrator UID.");
  }
  return value.trim();
}

class QuestionSeedGeneratorConfig {
  constructor(input) {
    Object.assign(this, normalizeConfiguration(input));
    const date = input.updatedAt instanceof Date ? input.updatedAt : input.updatedAt?.toDate?.();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error("updatedAt must be a valid timestamp.");
    }
    this.updatedAt = new Date(date.getTime());
    this.updatedBy = requireAdministratorUid(input.updatedBy);
    Object.freeze(this);
  }
}

module.exports = {QuestionSeedGeneratorConfig, normalizeConfiguration, requireAdministratorUid, requireRecord};
