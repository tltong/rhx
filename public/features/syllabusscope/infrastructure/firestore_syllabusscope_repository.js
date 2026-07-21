import { SyllabusScope } from "../domain/syllabusscope.js";
import { SyllabusScopeRepository } from "../domain/syllabusscope_repository.js";
import {
  SYLLABUS_SCOPE_COLLECTION,
  syllabusScopeGradeNumbers,
  syllabusScopeLevelTypes
} from "../../../config/firebase/syllabusscope_schema.js";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const LEVEL_TYPES = new Set(syllabusScopeLevelTypes);
const GRADE_NUMBERS = new Set(syllabusScopeGradeNumbers);

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

function normalizeLanguages(languages = []) {
  if (!Array.isArray(languages)) {
    throw new Error("languages must be an array.");
  }

  const normalizedLanguages = [];
  const languageKeys = new Set();

  languages.forEach((language) => {
    const normalizedLanguage = requireNonEmptyString(language, "language");
    const languageKey = normalizedLanguage.toLowerCase();

    if (!languageKeys.has(languageKey)) {
      languageKeys.add(languageKey);
      normalizedLanguages.push(normalizedLanguage);
    }
  });

  return normalizedLanguages;
}

function normalizeLevels(levels = {}) {
  const source = requireObject(levels, "levels");
  const normalizedLevels = {};

  Object.entries(source).forEach(([levelType, grades]) => {
    if (!LEVEL_TYPES.has(levelType)) {
      throw new Error(`level type must be one of: ${syllabusScopeLevelTypes.join(", ")}.`);
    }

    const gradeSource = requireObject(grades, `levels.${levelType}`);
    const normalizedGrades = {};

    Object.entries(gradeSource).forEach(([gradeNumber, enabled]) => {
      if (!GRADE_NUMBERS.has(gradeNumber)) {
        throw new Error(`grade number must be one of: ${syllabusScopeGradeNumbers.join(", ")}.`);
      }

      normalizedGrades[gradeNumber] = Boolean(enabled);
    });

    normalizedLevels[levelType] = normalizedGrades;
  });

  return normalizedLevels;
}

function getCountryName(data) {
  if (typeof data.country === "string" && data.country.trim() !== "") {
    return data.country.trim();
  }

  if (typeof data.id === "string" && data.id.trim() !== "") {
    return data.id.trim();
  }

  return null;
}

function getLevels(data) {
  if (data.levels !== undefined) {
    return normalizeLevels(data.levels || {});
  }

  const levels = {};

  syllabusScopeLevelTypes.forEach((levelType) => {
    if (data[levelType] === undefined) {
      return;
    }

    const grades = requireObject(data[levelType], levelType);
    const normalizedGrades = {};

    Object.entries(grades).forEach(([gradeNumber, enabled]) => {
      if (GRADE_NUMBERS.has(gradeNumber)) {
        normalizedGrades[gradeNumber] = Boolean(enabled);
      }
    });

    if (Object.keys(normalizedGrades).length > 0) {
      levels[levelType] = normalizedGrades;
    }
  });

  return normalizeLevels(levels);
}

function toSyllabusScope(data) {
  if (!data) {
    return null;
  }

  const country = getCountryName(data);

  if (!country) {
    return null;
  }

  return new SyllabusScope({
    id: data.id,
    country,
    languages: normalizeLanguages(data.languages || []),
    levels: getLevels(data)
  });
}

function toSyllabusScopeRecord(syllabusScope) {
  return {
    country: requireNonEmptyString(syllabusScope.country, "country"),
    languages: normalizeLanguages(syllabusScope.languages || []),
    levels: normalizeLevels(syllabusScope.levels || {})
  };
}

export class FirestoreSyllabusScopeRepository extends SyllabusScopeRepository {
  async getById(syllabusScopeId) {
    const data = await readDocument(
      SYLLABUS_SCOPE_COLLECTION,
      syllabusScopeId
    );

    return toSyllabusScope(data);
  }

  async findByCountry(country) {
    const selectedCountry = requireNonEmptyString(country, "country");
    const syllabusScopes = await readCollection(
      SYLLABUS_SCOPE_COLLECTION,
      (collection) => collection.where("country", "==", selectedCountry).limit(1)
    );

    return toSyllabusScope(syllabusScopes[0] || null);
  }

  async list() {
    const syllabusScopes = await readCollection(SYLLABUS_SCOPE_COLLECTION);

    return syllabusScopes
      .map((data) => {
        try {
          return toSyllabusScope(data);
        } catch (error) {
          console.warn("Skipping invalid syllabus scope document.", data?.id, error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((first, second) => first.country.localeCompare(second.country));
  }

  async save(syllabusScope) {
    await writeDocument(
      SYLLABUS_SCOPE_COLLECTION,
      syllabusScope.id,
      toSyllabusScopeRecord(syllabusScope),
      { merge: false }
    );

    return syllabusScope;
  }

  async delete(syllabusScopeId) {
    await deleteDocument(SYLLABUS_SCOPE_COLLECTION, syllabusScopeId);
  }
}
