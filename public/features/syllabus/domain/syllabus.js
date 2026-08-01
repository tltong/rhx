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
    practiceId
  } = {}) {
    this.language = requireText(language, "language");
    this.practiceId = requireText(practiceId, "practiceId");
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

export class SyllabusTopic {
  constructor({
    id = null,
    topicName,
    subtopics = {},
    preAssessmentPractices = {}
  }) {
    this.id = id;
    this.topicName = topicName;
    this.subtopics = subtopics;
    this.preAssessmentPractices = normalizePreAssessmentPractices(
      preAssessmentPractices
    );
  }

  update({
    topicName,
    subtopics,
    preAssessmentPractices
  }) {
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

  assignPreAssessmentPractice(language, practiceId) {
    const assignment = new SyllabusTopicPreAssessmentPractice({
      language,
      practiceId
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
    });

    return this;
  }
}
