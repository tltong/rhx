const SUBJECT_ASSESSMENT_CONFIGS_COLLECTION = "subjectAssessmentConfigs";
const SUBJECT_ASSESSMENT_CONFIG_LANGUAGES = "languages";
const SUBJECT_ASSESSMENT_SETTINGS_COLLECTION = "subjectAssessmentSettings";
const SUBJECT_ASSESSMENT_SETTINGS_DOCUMENT = "config";
const SUBJECT_ASSESSMENT_QUESTION_TYPES = Object.freeze(["normal", "essay", "fillInTheBlanks"]);
const SUBJECT_ASSESSMENT_DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);

const subjectAssessmentConfigSchema = {
  collection: "subjectAssessmentConfigs/{syllabusId}/languages",
  documentId: "{normalizedSyllabusLanguage}",
  description: "One standalone subject assessment configuration per syllabus and language.",
  fields: {
    syllabusId: "string",
    language: "string; canonical syllabus language",
    languageKey: "string; normalized using createSyllabusLanguageKey",
    version: "positive integer; incremented on each save",
    topics: {
      type: "array",
      minimumItems: 1,
      items: {
        topicId: "string; unique topic belonging to this syllabus",
        questionType: "normal|essay|fillInTheBlanks; derived from the topic format, never overridden",
        totalCount: "positive integer; questions for normal/essay, whole passages for fillInTheBlanks",
        difficultyCounts: {easy: "nonnegative integer", medium: "nonnegative integer", hard: "nonnegative integer"},
      },
      validation: "Each topic's difficulty counts sum exactly to totalCount.",
    },
    createdBy: "string; administrator UID",
    createdAt: "timestamp",
    updatedBy: "string; administrator UID",
    updatedAt: "timestamp",
  },
};

const subjectAssessmentSettingsSchema = {
  collection: SUBJECT_ASSESSMENT_SETTINGS_COLLECTION, documentId: SUBJECT_ASSESSMENT_SETTINGS_DOCUMENT,
  description: "One global repeat policy for every subject, grade and language; legacy interval-only settings remain valid.",
  fields: {repeatMode: "interval|none; omitted in legacy interval settings", intervalDays: "positive safe integer for interval mode; null for no repeat",
    version: "positive safe integer; incremented on each save", createdBy: "administrator UID", createdAt: "timestamp",
    updatedBy: "administrator UID", updatedAt: "timestamp"},
};

export {SUBJECT_ASSESSMENT_CONFIGS_COLLECTION, SUBJECT_ASSESSMENT_CONFIG_LANGUAGES,
  SUBJECT_ASSESSMENT_SETTINGS_COLLECTION, SUBJECT_ASSESSMENT_SETTINGS_DOCUMENT,
  SUBJECT_ASSESSMENT_QUESTION_TYPES, SUBJECT_ASSESSMENT_DIFFICULTIES, subjectAssessmentConfigSchema, subjectAssessmentSettingsSchema};
