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
  constructor({language, practiceId} = {}) {
    this.language = requireNonEmptyString(language, "language");
    this.practiceId = requireNonEmptyString(practiceId, "practiceId");

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

class SyllabusTopic {
  constructor({
    id,
    topicName,
    subtopics = {},
    preAssessmentPractices = {},
  }) {
    this.id = requireNonEmptyString(id, "topic id");
    this.topicName = requireNonEmptyString(topicName, "topicName");
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
  createSyllabusLanguageKey,
  Syllabus,
  SyllabusTopic,
  SyllabusTopicPreAssessmentPractice,
};
