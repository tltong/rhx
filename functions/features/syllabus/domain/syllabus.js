const {preAssessmentPracticeTypes} = require("../../../schema/syllabuses_schema");

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();

  return stringValue === "" ? null : stringValue;
}

function normalizeYear(value) {
  const year = Number(value);

  if (!Number.isInteger(year) || year < 1) {
    throw new Error("year must be a positive integer.");
  }

  return year;
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

  return Object.freeze(normalizedLanguages);
}

function normalizeSubtopics(subtopics = {}) {
  if (
    subtopics === null ||
    typeof subtopics !== "object" ||
    Array.isArray(subtopics)
  ) {
    throw new Error("subtopics must be an object.");
  }

  const normalizedSubtopics = {};

  Object.entries(subtopics).forEach(([subtopicId, subtopicName]) => {
    const normalizedId = requireNonEmptyString(subtopicId, "subtopicId");
    normalizedSubtopics[normalizedId] = requireNonEmptyString(
      subtopicName,
      `subtopics.${normalizedId}`,
    );
  });

  return Object.freeze(normalizedSubtopics);
}

function createSyllabusLanguageKey(language) {
  return requireNonEmptyString(language, "language")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.\/\[\]*`]/g, "_");
}

class SyllabusTopicPreAssessmentPractice {
  constructor({language, practiceId, practiceType = preAssessmentPracticeTypes.NORMAL} = {}) {
    this.language = requireNonEmptyString(language, "language");
    this.practiceId = requireNonEmptyString(practiceId, "practiceId");
    if (!Object.values(preAssessmentPracticeTypes).includes(practiceType)) throw new Error("practiceType must be normal or essay.");
    this.practiceType = practiceType;

    Object.freeze(this);
  }
}

function normalizePreAssessmentPractices(preAssessmentPractices = {}) {
  if (
    preAssessmentPractices === null ||
    typeof preAssessmentPractices !== "object" ||
    Array.isArray(preAssessmentPractices)
  ) {
    throw new Error("preAssessmentPractices must be an object.");
  }

  const normalizedPractices = {};

  Object.values(preAssessmentPractices).forEach((practice) => {
    const assignment = practice instanceof SyllabusTopicPreAssessmentPractice
      ? practice
      : new SyllabusTopicPreAssessmentPractice(practice);
    const languageKey = createSyllabusLanguageKey(assignment.language);

    if (normalizedPractices[languageKey]) {
      throw new Error(
        `Duplicate pre-assessment practice language: ${assignment.language}.`,
      );
    }

    normalizedPractices[languageKey] = assignment;
  });

  return Object.freeze(normalizedPractices);
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

class SyllabusTopic {
  constructor({
    id,
    topicName,
    pausable = true,
    subtopics = {},
    assessmentFrameworkIds = {},
    preAssessmentPractices = {},
  }) {
    this.id = requireNonEmptyString(id, "topic id");
    this.topicName = requireNonEmptyString(topicName, "topicName");
    this.pausable = requireBoolean(pausable, "pausable");
    this.assessmentFrameworkIds = normalizeTopicFrameworkIds(assessmentFrameworkIds);
    this.subtopics = normalizeSubtopics(subtopics);
    this.preAssessmentPractices = normalizePreAssessmentPractices(
      preAssessmentPractices,
    );

    Object.freeze(this);
  }

  getPreAssessmentPractice(language) {
    return this.preAssessmentPractices[
      createSyllabusLanguageKey(language)
    ] || null;
  }

  listPreAssessmentPractices() {
    return Object.values(this.preAssessmentPractices);
  }
}

class Syllabus {
  constructor({
    id,
    assessmentFrameworkId = null,
    active = false,
    country,
    languages = [],
    level,
    subject,
    year,
    topics = [],
  }) {
    if (!Array.isArray(topics)) {
      throw new Error("topics must be an array.");
    }

    this.id = requireNonEmptyString(id, "syllabus id");
    this.assessmentFrameworkId = optionalString(assessmentFrameworkId);
    this.active = active === true;
    this.country = requireNonEmptyString(country, "country");
    this.languages = normalizeLanguages(languages);
    this.level = requireNonEmptyString(level, "level");
    this.subject = requireNonEmptyString(subject, "subject");
    this.year = normalizeYear(year);
    this.topics = Object.freeze(
      topics.map((topic) =>
        topic instanceof SyllabusTopic ? topic : new SyllabusTopic(topic),
      ),
    );

    Object.freeze(this);
  }
}

module.exports = {
  normalizeTopicFrameworkIds, resolveTopicAssessmentFrameworkId,
  createSyllabusLanguageKey,
  Syllabus,
  SyllabusTopic,
  SyllabusTopicPreAssessmentPractice,
};

function normalizeTopicFrameworkIds(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("assessmentFrameworkIds must be a map.");
  const result = {};
  for (const [language, value] of Object.entries(input)) {
    const key = createSyllabusLanguageKey(language);
    if (typeof value !== "string" || !value.trim() || value.includes("/") || [".", ".."].includes(value.trim())) throw new Error("assessmentFrameworkIds must contain valid framework IDs.");
    if (Object.hasOwn(result, key)) throw new Error("Duplicate framework language key.");
    Object.defineProperty(result, key, {value: value.trim(), enumerable: true});
  }
  return Object.freeze(result);
}

function resolveTopicAssessmentFrameworkId(syllabus, {topicId, language} = {}) {
  const topic = syllabus?.topics?.find(item => item.id === topicId);
  if (!topic) throw new Error("Topic does not belong to the syllabus.");
  const overrides = normalizeTopicFrameworkIds(topic.assessmentFrameworkIds);
  if (language && syllabus.languages?.length && !syllabus.languages.some(value => createSyllabusLanguageKey(value) === createSyllabusLanguageKey(language))) throw new Error("Language is not available for the syllabus.");
  if (!language && Object.keys(overrides).length) throw new Error("Language is required to resolve a topic framework override.");
  const key = language ? createSyllabusLanguageKey(language) : null;
  const id = (key && Object.hasOwn(overrides, key) ? overrides[key] : null) || syllabus.assessmentFrameworkId;
  return id || null;
}
