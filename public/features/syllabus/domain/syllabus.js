import {preAssessmentPracticeTypes} from "../../../config/firebase/syllabuses_schema.js?v=20261018-preassessment-essay-v1";

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

export function createSyllabusLanguageKey(language) {
  return requireText(language, "language")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.\/\[\]*`]/g, "_");
}

export class SyllabusTopicPreAssessmentPractice {
  constructor({
    language,
    practiceId,
    practiceType = preAssessmentPracticeTypes.NORMAL
  } = {}) {
    this.language = requireText(language, "language");
    this.practiceId = requireText(practiceId, "practiceId");
    if (!Object.values(preAssessmentPracticeTypes).includes(practiceType)) throw new Error("practiceType must be normal or essay.");
    this.practiceType = practiceType;
  }
}

function normalizePreAssessmentPractices(preAssessmentPractices = {}) {
  if (
    !preAssessmentPractices
    || typeof preAssessmentPractices !== "object"
    || Array.isArray(preAssessmentPractices)
  ) {
    throw new Error("preAssessmentPractices must be an object.");
  }

  return Object.fromEntries(
    Object.values(preAssessmentPractices).map((value) => {
      const assignment = value instanceof SyllabusTopicPreAssessmentPractice
        ? value
        : new SyllabusTopicPreAssessmentPractice(value);

      return [createSyllabusLanguageKey(assignment.language), assignment];
    })
  );
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

export class SyllabusTopic {
  constructor({
    id = null,
    topicName,
    pausable = true,
    subtopics = {},
    assessmentFrameworkIds = {},
    preAssessmentPractices = {}
  }) {
    this.id = id;
    this.topicName = topicName;
    this.pausable = requireBoolean(pausable, "pausable");
    this.assessmentFrameworkIds = normalizeTopicFrameworkIds(assessmentFrameworkIds);
    this.subtopics = subtopics;
    this.preAssessmentPractices = normalizePreAssessmentPractices(
      preAssessmentPractices
    );
  }

  update({
    topicName,
    pausable,
    subtopics,
    assessmentFrameworkIds,
    preAssessmentPractices
  }) {
    if (assessmentFrameworkIds !== undefined) this.assessmentFrameworkIds = normalizeTopicFrameworkIds(assessmentFrameworkIds);
    if (pausable !== undefined) {
      this.pausable = requireBoolean(pausable, "pausable");
    }

    if (topicName !== undefined) {
      this.topicName = topicName;
    }

    if (subtopics !== undefined) {
      this.subtopics = subtopics;
    }

    if (preAssessmentPractices !== undefined) {
      this.preAssessmentPractices = normalizePreAssessmentPractices(
        preAssessmentPractices
      );
    }

    return this;
  }

  assignPreAssessmentPractice(language, practiceId, practiceType = preAssessmentPracticeTypes.NORMAL) {
    const assignment = new SyllabusTopicPreAssessmentPractice({
      language,
      practiceId,
      practiceType
    });
    const languageKey = createSyllabusLanguageKey(assignment.language);

    this.preAssessmentPractices = {
      ...this.preAssessmentPractices,
      [languageKey]: assignment
    };

    return assignment;
  }

  getPreAssessmentPractice(language) {
    const languageKey = createSyllabusLanguageKey(language);

    return this.preAssessmentPractices[languageKey] || null;
  }

  listPreAssessmentPractices() {
    return Object.values(this.preAssessmentPractices);
  }

  removePreAssessmentPractice(language) {
    const languageKey = createSyllabusLanguageKey(language);
    const nextAssignments = { ...this.preAssessmentPractices };

    delete nextAssignments[languageKey];
    this.preAssessmentPractices = nextAssignments;

    return this;
  }
}

export class Syllabus {
  constructor({
    id = null,
    country,
    level,
    year,
    subject,
    languages = [],
    active = false,
    assessmentFrameworkId = null,
    topics = []
  }) {
    this.id = id;
    this.country = country;
    this.level = level;
    this.year = year;
    this.subject = subject;
    this.languages = languages;
    this.active = active;
    this.assessmentFrameworkId = assessmentFrameworkId;
    this.topics = topics.map((topic) => (
      topic instanceof SyllabusTopic ? topic : new SyllabusTopic(topic)
    ));
  }

  update({
    country,
    level,
    year,
    subject,
    languages,
    active,
    assessmentFrameworkId,
    topics
  }) {
    if (country !== undefined) {
      this.country = country;
    }

    if (level !== undefined) {
      this.level = level;
    }

    if (year !== undefined) {
      this.year = year;
    }

    if (subject !== undefined) {
      this.subject = subject;
    }

    if (languages !== undefined) {
      this.languages = languages;
    }

    if (active !== undefined) {
      this.active = active;
    }

    if (assessmentFrameworkId !== undefined) {
      this.assessmentFrameworkId = assessmentFrameworkId;
    }

    if (topics !== undefined) {
      this.topics = topics.map((topic) => (
        topic instanceof SyllabusTopic ? topic : new SyllabusTopic(topic)
      ));
    }

    return this;
  }

  addLanguage(language) {
    const selectedLanguage = String(language || "").trim();

    if (!selectedLanguage) {
      throw new Error("language is required.");
    }

    const languageExists = this.languages.some(
      (item) => String(item).trim().toLowerCase() === selectedLanguage.toLowerCase()
    );

    if (!languageExists) {
      this.languages = [...this.languages, selectedLanguage];
    }

    return this;
  }

  deleteLanguage(language) {
    const selectedLanguage = String(language || "").trim();

    if (!selectedLanguage) {
      throw new Error("language is required.");
    }

    this.languages = this.languages.filter(
      (item) => String(item).trim().toLowerCase() !== selectedLanguage.toLowerCase()
    );
    this.topics.forEach((topic) => {
      topic.removePreAssessmentPractice(selectedLanguage);
      const nextFrameworks = {...topic.assessmentFrameworkIds};
      delete nextFrameworks[createSyllabusLanguageKey(selectedLanguage)];
      topic.assessmentFrameworkIds = normalizeTopicFrameworkIds(nextFrameworks);
    });

    return this;
  }
}

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

export {normalizeTopicFrameworkIds, resolveTopicAssessmentFrameworkId};
