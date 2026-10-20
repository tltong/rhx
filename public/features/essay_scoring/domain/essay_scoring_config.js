import {ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES} from "../../../config/firebase/essay_scoring_schema.js?v=20261020-scoring-config-v1";
import {DEFAULT_ESSAY_MARKING_INSTRUCTIONS} from "../config/essay_scoring_prompt_template.js?v=20261020-scoring-config-v1";

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(name + " must be an object.");
  return value;
}
function knownKeys(value, keys, name) {
  requireRecord(value, name);
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error(name + " contains an unsupported key.");
  return value;
}
function instruction(value, name, fallback = "") {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(name + " must be a string.");
  return value.trim();
}
function requireAdministratorUid(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A trusted administrator UID is required.");
  return value.trim();
}
function normalizeConfiguration(input) {
  requireRecord(input, "Essay scoring configuration");
  const markingInstructions = instruction(input.markingInstructions, "markingInstructions", DEFAULT_ESSAY_MARKING_INSTRUCTIONS);
  if (!markingInstructions) throw new Error("Base marking instructions must not be blank.");
  const levels = knownKeys(input.gradeInstructions === undefined ? {} : input.gradeInstructions, ESSAY_SCORING_LEVELS, "gradeInstructions");
  return {
    markingInstructions,
    additionalLlmInstructions: instruction(input.additionalLlmInstructions, "additionalLlmInstructions"),
    gradeInstructions: Object.fromEntries(ESSAY_SCORING_LEVELS.map(level => {
      const grades = knownKeys(levels[level] === undefined ? {} : levels[level], ESSAY_SCORING_GRADES.map(String), "gradeInstructions." + level);
      return [level, Object.fromEntries(ESSAY_SCORING_GRADES.map(grade =>
        [String(grade), instruction(grades[grade], "gradeInstructions." + level + "." + grade)]))];
    })),
  };
}
function createDefaultConfiguration() {return normalizeConfiguration({});}
class EssayScoringConfig {
  constructor(input) {
    Object.assign(this, normalizeConfiguration(input));
    const date = input.updatedAt instanceof Date ? input.updatedAt : input.updatedAt?.toDate?.();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("updatedAt must be a valid timestamp.");
    this.updatedAt = new Date(date.getTime());
    this.updatedBy = requireAdministratorUid(input.updatedBy);
    Object.values(this.gradeInstructions).forEach(Object.freeze);
    Object.freeze(this.gradeInstructions);
    Object.freeze(this);
  }
}
export {normalizeConfiguration, createDefaultConfiguration, requireAdministratorUid, EssayScoringConfig};
