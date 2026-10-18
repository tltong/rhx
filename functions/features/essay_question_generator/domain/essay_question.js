const {ESSAY_QUESTION_GENERATOR_COLLECTION, ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES} = require("../../../schema/essay_question_generator_schema");
const {requireRecord, requireText, requireDate, normalizeWordCountRequirement} = require("./essay_question_generator_config");


function normalizeDifficulty(value) {
  if (!Object.values(ESSAY_QUESTION_DIFFICULTIES).includes(value)) throw new Error("difficulty must be easy, medium or hard.");
  return value;
}
function languageDocumentId(language) {
  const id = encodeURIComponent(requireText(language, "language"));
  if (id === "." || id === ".." || /^__.*__$/.test(id)) throw new Error("language is not a valid document identifier.");
  return id;
}
function normalizeCriteria(input, {requireDifficulty = false} = {}) {
  requireRecord(input, "Essay question criteria");
  if (!Object.values(ESSAY_QUESTION_LEVELS).includes(input.level)) throw new Error("level must be primary or secondary.");
  if (!ESSAY_QUESTION_STANDARDS.includes(input.standard)) throw new Error("standard must be an integer from 1 to 6.");
  const language = requireText(input.language, "language");
  languageDocumentId(language);
  const criteria = {level: input.level, standard: input.standard, language};
  if (requireDifficulty || input.difficulty !== undefined) criteria.difficulty = normalizeDifficulty(input.difficulty);
  return criteria;
}
function normalizeGenerationInput(input) {
  const criteria = normalizeCriteria(input, {requireDifficulty: true});
  if (input.save !== undefined && typeof input.save !== "boolean") throw new Error("save must be a boolean when provided.");
  return {...criteria, seed: requireText(input.seed, "seed"), save: input.save ?? true};
}
function normalizeDraftInput(input) {
  return {...normalizeCriteria(input, {requireDifficulty: true}),
    questionId: normalizeQuestionId(input.questionId),
    questionText: requireText(input.questionText, "questionText"),
    seedUsed: requireText(input.seedUsed, "seedUsed"),
    wordCountRequirement: Object.freeze(normalizeWordCountRequirement(input.wordCountRequirement))};
}
function normalizeQuestionId(value) {
  const id = requireText(value, "questionId");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("questionId is invalid.");
  return id;
}
function questionCollectionPath(input) {
  const {level, standard, language} = normalizeCriteria(input);
  return ESSAY_QUESTION_GENERATOR_COLLECTION + "/" + level + "/standards/" + standard
    + "/languages/" + languageDocumentId(language) + "/questions";
}
function scopeFromQuestionPath(path, questionId) {
  if (typeof path !== "string") throw new Error("Stored essay question index is invalid.");
  const parts = path.split("/");
  if (parts.length !== 8 || parts[0] !== ESSAY_QUESTION_GENERATOR_COLLECTION
      || parts[2] !== "standards" || parts[4] !== "languages" || parts[6] !== "questions"
      || parts[7] !== normalizeQuestionId(questionId)) throw new Error("Stored essay question index is invalid.");
  const scope = normalizeCriteria({level: parts[1], standard: Number(parts[3]), language: decodeURIComponent(parts[5])});
  if (questionCollectionPath(scope) + "/" + questionId !== path) throw new Error("Stored essay question index is invalid.");
  return scope;
}
function normalizeGeneratedQuestion(response) {
  if (typeof response === "string") {
    try {response = JSON.parse(response);}
    catch {throw new Error("Essay question LLM response must be valid JSON.");}
  }
  requireRecord(response, "Essay question LLM response");
  return {questionText: requireText(response.questionText, "questionText")};
}
function readQuestion(data, scope, questionId) {
  requireRecord(data, "Stored essay question");
  return Object.freeze({
    questionId: normalizeQuestionId(questionId), ...normalizeCriteria(scope),
    difficulty: normalizeDifficulty(data.difficulty),
    questionText: requireText(data.questionText, "questionText"),
    seedUsed: requireText(data.seedUsed, "seedUsed"),
    wordCountRequirement: Object.freeze(normalizeWordCountRequirement(data.wordCountRequirement)),
    generatedAt: requireDate(data.generatedAt, "generatedAt"),
  });
}
function encodeCursor(criteria, afterId) {
  return encodeURIComponent(JSON.stringify({v: 1, criteria: normalizeCriteria(criteria), after: normalizeQuestionId(afterId)}));
}
function decodeCursor(cursor, criteria) {
  if (cursor === undefined || cursor === null) return null;
  let value;
  try {value = JSON.parse(decodeURIComponent(requireText(cursor, "cursor")));}
  catch {throw new Error("cursor is invalid.");}
  requireRecord(value, "cursor");
  if (value.v !== 1 || JSON.stringify(value.criteria) !== JSON.stringify(normalizeCriteria(criteria))) {
    throw new Error("cursor does not match the essay question search criteria.");
  }
  return normalizeQuestionId(value.after);
}
function normalizeListInput(input) {
  const criteria = normalizeCriteria(input);
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit >= Number.MAX_SAFE_INTEGER) {
    throw new Error("limit must be a positive safe integer.");
  }
  decodeCursor(input.cursor, criteria);
  return {...criteria, limit: input.limit, cursor: input.cursor ?? null};
}


module.exports = {normalizeDifficulty, languageDocumentId, normalizeCriteria, normalizeGenerationInput, normalizeDraftInput, normalizeQuestionId, questionCollectionPath, scopeFromQuestionPath, normalizeGeneratedQuestion, readQuestion, encodeCursor, decodeCursor, normalizeListInput};
