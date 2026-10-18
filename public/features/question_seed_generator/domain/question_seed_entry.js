import {QUESTION_SEED_VERTICALS, QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES} from "../../../config/firebase/question_seed_generator_schema.js?v=20261017-seed-association-order-v1";
import {requireRecord} from "./question_seed_generator_config.js?v=20261017-seed-association-order-v1";

function requireVertical(value) {
  if (!Object.values(QUESTION_SEED_VERTICALS).includes(value)) throw new Error("vertical must be theme, setting or type.");
  return value;
}

function normalizeValue(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Each question seed value must be a nonempty string.");
  return value.trim().replace(/\s+/gu, " ");
}

function entryKey(entry) {
  return normalizeValue(typeof entry === "string" ? entry : entry?.value).normalize("NFKC").toLowerCase();
}

function normalizeAssociations(value, {requireAssigned = false} = {}) {
  requireRecord(value, "associations");
  const result = {};
  for (const level of Object.keys(value)) {
    if (!Object.values(QUESTION_SEED_LEVELS).includes(level)) throw new Error("Association levels must be primary or secondary.");
  }
  for (const level of Object.values(QUESTION_SEED_LEVELS)) {
    if (!Object.hasOwn(value, level)) continue;
    if (!Array.isArray(value[level])) throw new Error("Association grades must be arrays.");
    const grades = Array.from(value[level], grade => {
      if (!QUESTION_SEED_GRADES.includes(grade)) throw new Error("Association grades must be integers from 1 to 6.");
      return grade;
    });
    if (new Set(grades).size !== grades.length) throw new Error("Association grades must be unique.");
    if (grades.length) result[level] = grades.sort((a, b) => a - b);
  }
  if (requireAssigned && !Object.keys(result).length) throw new Error("Select at least one level and grade.");
  return result;
}

function normalizeEntry(entry, {allowLegacy = false} = {}) {
  if (allowLegacy && typeof entry === "string") return {value: normalizeValue(entry), associations: {}};
  requireRecord(entry, "Question seed entry");
  return {value: normalizeValue(entry.value), associations: normalizeAssociations(entry.associations)};
}

function normalizeEntries(entries, options) {
  if (!Array.isArray(entries)) throw new Error("entries must be an array of question seed objects.");
  const keys = new Set();
  return Array.from(entries, entry => {
    const normalized = normalizeEntry(entry, options);
    const key = entryKey(normalized);
    if (keys.has(key)) throw new Error("entries must not contain duplicate values (ignoring case and whitespace).");
    keys.add(key);
    return normalized;
  });
}

function normalizeEntriesInput(input) {
  requireRecord(input, "Question seed entries");
  return {vertical: requireVertical(input.vertical), entries: normalizeEntries(input.entries)};
}

function normalizeRemovalInput(input) {
  requireRecord(input, "Question seed removal");
  const vertical = requireVertical(input.vertical);
  if (!Array.isArray(input.entries) || !input.entries.length) throw new Error("Select at least one question seed value to remove.");
  const entries = Array.from(input.entries, normalizeValue);
  if (new Set(entries.map(entryKey)).size !== entries.length) throw new Error("Removal values must be unique.");
  return {vertical, entries};
}

function normalizeEntryInput(input) {
  requireRecord(input, "Question seed entry input");
  return {vertical: requireVertical(input.vertical), entry: normalizeEntry(input.entry)};
}

function normalizeScope(input, {required = false} = {}) {
  requireRecord(input, "Question seed selection");
  if (input.level === undefined && input.grade === undefined && !required) return {};
  if (input.level === undefined || input.grade === undefined) throw new Error("level and grade must be supplied together.");
  if (!Object.values(QUESTION_SEED_LEVELS).includes(input.level)) throw new Error("level must be primary or secondary.");
  if (!QUESTION_SEED_GRADES.includes(input.grade)) throw new Error("grade must be an integer from 1 to 6.");
  return {level: input.level, grade: input.grade};
}

function normalizeEntriesQuery(input, options) {
  const scope = normalizeScope(input, options);
  return {vertical: requireVertical(input.vertical), ...scope};
}

function matchesScope(entry, scope) {
  return scope.level === undefined || entry.associations[scope.level]?.includes(scope.grade) === true;
}

function normalizeGenerationInput(input) {
  requireRecord(input, "Question seed generation input");
  const vertical = requireVertical(input.vertical);
  const associations = input.associations === undefined ? {} : normalizeAssociations(input.associations);
  if (input.seed !== undefined && typeof input.seed !== "string") throw new Error("seed must be a string when provided.");
  if (input.save !== undefined && typeof input.save !== "boolean") throw new Error("save must be a boolean when provided.");
  if (input.useHighLevelSeed !== undefined && typeof input.useHighLevelSeed !== "boolean") throw new Error("useHighLevelSeed must be a boolean when provided.");
  return {vertical, associations, seed: input.seed?.trim() || "", save: input.save ?? true,
    useHighLevelSeed: input.useHighLevelSeed ?? true};
}

function normalizeGeneratedEntry(response, associations) {
  if (typeof response === "string") {
    try { response = JSON.parse(response); }
    catch { throw new Error("Question seed LLM response must be valid JSON."); }
  }
  requireRecord(response, "Question seed LLM response");
  if (response.entry === null) {
    throw Object.assign(new Error("No distinct suitable question seed entry is available for this vertical."), {code: "question-seed-exhausted"});
  }
  // Associations come from validated caller input, never from LLM-supplied metadata.
  return {value: normalizeValue(response.entry), associations: normalizeAssociations(associations)};
}

function pickRandomEntry(entries, vertical, random = Math.random, scope = {}) {
  requireVertical(vertical);
  const eligible = normalizeEntries(entries).filter(entry => matchesScope(entry, scope));
  if (!eligible.length) {
    throw new Error("No question seed entries are available for " + vertical
      + (scope.level ? " at " + scope.level + " grade " + scope.grade : "") + ".");
  }
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Random value must be in [0, 1).");
  return eligible[Math.floor(value * eligible.length)].value;
}

export {
  requireVertical, normalizeValue, entryKey, normalizeAssociations, normalizeEntry, normalizeEntries,
  normalizeEntriesInput, normalizeRemovalInput, normalizeEntryInput, normalizeScope, normalizeEntriesQuery,
  matchesScope, normalizeGenerationInput, normalizeGeneratedEntry, pickRandomEntry,
};
