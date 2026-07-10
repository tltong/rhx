import {
  SYLLABUS_SCOPE_COLLECTION,
  syllabusScopeGradeNumbers,
  syllabusScopeLevelTypes,
  syllabusScopeSchema
} from "../config/firebase/syllabusscope_schema.js?v=20260711-skip-empty-levels";
import {
  createDocument,
  deleteDocument,
  readCollection,
  readDocument,
  updateDocument
} from "../utils/firebase/firebase_ops.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object.`);
  }

  return value;
}

function normalizeCountry(country) {
  return requireNonEmptyString(country, "country");
}

function normalizeCountryDocumentId(country) {
  return normalizeCountry(country)
    .replace(/\s+/g, "_")
    .replace(/\//g, "-");
}

function normalizeLevelType(levelType) {
  const normalized = requireNonEmptyString(levelType, "levelType").toLowerCase();

  if (!syllabusScopeLevelTypes.includes(normalized)) {
    throw new Error(`levelType must be one of: ${syllabusScopeLevelTypes.join(", ")}.`);
  }

  return normalized;
}

function normalizeGradeId(gradeId, name) {
  const rawId = requireNonEmptyString(gradeId, name);
  const legacyMatch = rawId.match(/^grade_(\d+)$/);
  const normalized = legacyMatch ? legacyMatch[1] : rawId;

  if (!syllabusScopeGradeNumbers.includes(normalized)) {
    throw new Error(`${name} must be one of: ${syllabusScopeGradeNumbers.join(", ")}.`);
  }

  return normalized;
}

function normalizeGradeMap(gradeMap = {}, levelType) {
  const source = requireObject(gradeMap, `${levelType} grades`);
  const normalized = {};

  Object.entries(source).forEach(([gradeId, isSelected]) => {
    const id = normalizeGradeId(gradeId, `${levelType} grade id`);

    if (isSelected) {
      normalized[id] = true;
    }
  });

  return normalized;
}

function normalizeLevels(levels = {}) {
  const source = requireObject(levels, "levels");
  const normalized = {};

  Object.entries(source).forEach(([levelType, grades]) => {
    const type = normalizeLevelType(levelType);
    const normalizedGrades = normalizeGradeMap(grades, type);

    if (Object.keys(normalizedGrades).length > 0) {
      normalized[type] = normalizedGrades;
    }
  });

  return normalized;
}

function buildSyllabusScopeData({ country, levels = {} } = {}) {
  const data = {
    country: normalizeCountry(country)
  };
  const normalizedLevels = normalizeLevels(levels);

  if (Object.keys(normalizedLevels).length > 0) {
    data.levels = normalizedLevels;
  }

  return data;
}

function normalizeReadScope(scope) {
  if (!scope) {
    return scope;
  }

  if (scope.levels) {
    return scope;
  }

  const levels = {};

  syllabusScopeLevelTypes.forEach((levelType) => {
    if (scope[levelType]) {
      levels[levelType] = scope[levelType];
    }
  });

  return Object.keys(levels).length > 0
    ? { ...scope, levels }
    : scope;
}

function buildSyllabusScopeUpdates(updates = {}) {
  requireObject(updates, "updates");

  const allowedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "country")) {
    allowedUpdates.country = normalizeCountry(updates.country);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "levels")) {
    allowedUpdates.levels = normalizeLevels(updates.levels);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid syllabus scope updates were provided.");
  }

  return allowedUpdates;
}

export function getSyllabusScopeSchema() {
  return syllabusScopeSchema;
}

export function getSyllabusScopeLevelTypes() {
  return [...syllabusScopeLevelTypes];
}

export function getSyllabusScopeGradeNumbers() {
  return [...syllabusScopeGradeNumbers];
}

export function buildSyllabusScopeDocumentId(country) {
  return normalizeCountryDocumentId(country);
}

export async function createSyllabusScope(scopeData = {}) {
  const data = buildSyllabusScopeData(scopeData);
  const documentId = buildSyllabusScopeDocumentId(data.country);

  await createDocument(SYLLABUS_SCOPE_COLLECTION, data, documentId);

  return readSyllabusScope(data.country);
}

export async function readSyllabusScope(country) {
  const scope = await readDocument(
    SYLLABUS_SCOPE_COLLECTION,
    buildSyllabusScopeDocumentId(country)
  );

  return normalizeReadScope(scope);
}

export async function readSyllabusScopes(buildQuery = null) {
  const scopes = await readCollection(SYLLABUS_SCOPE_COLLECTION, buildQuery);

  return scopes.map(normalizeReadScope);
}

export async function writeSyllabusScope(scopeData = {}) {
  const data = buildSyllabusScopeData(scopeData);
  const documentId = buildSyllabusScopeDocumentId(data.country);

  await createDocument(SYLLABUS_SCOPE_COLLECTION, data, documentId);

  return readSyllabusScope(data.country);
}

export async function updateSyllabusScope(country, updates = {}) {
  const documentId = buildSyllabusScopeDocumentId(country);
  const data = buildSyllabusScopeUpdates(updates);

  await updateDocument(SYLLABUS_SCOPE_COLLECTION, documentId, data);

  return readSyllabusScope(country);
}

export async function deleteSyllabusScope(country) {
  const documentId = buildSyllabusScopeDocumentId(country);

  await deleteDocument(SYLLABUS_SCOPE_COLLECTION, documentId);

  return {
    id: documentId,
    deleted: true
  };
}

export default {
  getSyllabusScopeSchema,
  getSyllabusScopeLevelTypes,
  getSyllabusScopeGradeNumbers,
  buildSyllabusScopeDocumentId,
  createSyllabusScope,
  readSyllabusScope,
  readSyllabusScopes,
  writeSyllabusScope,
  updateSyllabusScope,
  deleteSyllabusScope
};
