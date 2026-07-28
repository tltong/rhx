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

class SyllabusTopic {
  constructor({ id, topicName, subtopics = {} }) {
    this.id = requireNonEmptyString(id, "topic id");
    this.topicName = requireNonEmptyString(topicName, "topicName");
    this.subtopics = normalizeSubtopics(subtopics);

    Object.freeze(this);
  }
}

class Syllabus {
  constructor({
    id,
    assessmentFrameworkId = null,
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
  Syllabus,
  SyllabusTopic,
};
