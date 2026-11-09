import {createSyllabusLanguageKey} from "../../syllabus/domain/syllabus.js?v=20261108-subject-assessment-config-v1";
import {SUBJECT_ASSESSMENT_QUESTION_TYPES, SUBJECT_ASSESSMENT_DIFFICULTIES} from "../../../config/firebase/subject_assessment_config_schema.js?v=20261109-assessment-repeat-policy-v1";

function configurationError(message, code = "invalid-argument") {
  return Object.assign(new Error(message), {code});
}

function requireDocumentId(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || [".", ".."].includes(value.trim())) {
    throw configurationError(`${name} must be a valid document ID.`);
  }
  return value.trim();
}

function requireScope(input) {
  const syllabusId = requireDocumentId(input?.syllabusId, "syllabusId");
  if (typeof input?.language !== "string" || !input.language.trim()) throw configurationError("Select a syllabus language.");
  const language = input.language.trim();
  const languageKey = requireDocumentId(createSyllabusLanguageKey(language), "languageKey");
  return {syllabusId, language, languageKey};
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw configurationError(`${label} must be ${minimum ? "a positive" : "a nonnegative"} whole number.`);
  }
  return value;
}

function requireTopicAllocation(input) {
  const topicId = requireDocumentId(input?.topicId, "topicId");
  const totalCount = requireInteger(input.totalCount, "Total count", 1);
  const difficultyCounts = Object.fromEntries(SUBJECT_ASSESSMENT_DIFFICULTIES.map(difficulty => [
    difficulty, requireInteger(input.difficultyCounts?.[difficulty], `${difficulty[0].toUpperCase() + difficulty.slice(1)} count`),
  ]));
  const sum = Object.values(difficultyCounts).reduce((total, count) => total + count, 0);
  if (!Number.isSafeInteger(sum) || sum !== totalCount) {
    throw configurationError("Easy, medium, and hard counts must add up to the total.");
  }
  if (input.questionType !== undefined && !SUBJECT_ASSESSMENT_QUESTION_TYPES.includes(input.questionType)) {
    throw configurationError("Unknown topic question format.");
  }
  return {topicId, ...(input.questionType === undefined ? {} : {questionType: input.questionType}), totalCount, difficultyCounts};
}

function requireConfigurationInput(input) {
  const scope = requireScope(input);
  const expectedVersion = requireInteger(input.expectedVersion, "Expected configuration version");
  if (!Array.isArray(input.topics) || input.topics.length === 0) throw configurationError("Select at least one topic.");
  const topics = input.topics.map(requireTopicAllocation);
  if (new Set(topics.map(topic => topic.topicId)).size !== topics.length) throw configurationError("Select each topic only once.");
  return {...scope, topics, expectedVersion};
}

function requireRepeatPolicy(input) {
  const repeatMode = input?.repeatMode === undefined ? "interval" : input.repeatMode;
  if (repeatMode === "none") {
    if (input.intervalDays !== undefined && input.intervalDays !== null) throw configurationError("No repeat must not include an interval in days.");
    return {repeatMode, intervalDays: null};
  }
  if (repeatMode !== "interval") throw configurationError("Choose a repeat interval or no repeat.");
  return {repeatMode, intervalDays: requireInteger(input?.intervalDays, "Assessment interval in days", 1)};
}

function requireSettingsInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some(key => !["repeatMode", "intervalDays", "expectedVersion"].includes(key))) {
    throw configurationError("Provide only the global repeat policy and expected settings version.");
  }
  return {...requireRepeatPolicy(input),
    expectedVersion: requireInteger(input.expectedVersion, "Expected settings version")};
}

function readSettings(data) {
  if (!data) return null;
  requireInteger(data.version, "Settings version", 1);
  return {...readConfiguration(data), ...requireRepeatPolicy(data)};
}

function canonicalScope(input, syllabus) {
  const scope = requireScope(input);
  if (!syllabus) throw configurationError("The syllabus could not be found.", "not-found");
  const language = syllabus.languages?.find(item => createSyllabusLanguageKey(item) === scope.languageKey);
  if (!language) throw configurationError("The language is not available for this syllabus.");
  return {...scope, language};
}

function topicOption(topicId, topic, framework) {
  const questionType = framework ? framework.frameworkType ?? "normal" : null;
  const valid = SUBJECT_ASSESSMENT_QUESTION_TYPES.includes(questionType);
  return {topicId, topicName: topic?.topicName || topicId, questionType: valid ? questionType : null,
    error: !topic ? "This topic no longer belongs to the syllabus. Deselect it before saving."
      : !valid ? "Set this topic's format in Syllabus Admin before including it." : null};
}

function resolveAllocations(allocations, options) {
  const byId = new Map(options.map(topic => [topic.topicId, topic]));
  return allocations.map(allocation => {
    const topic = byId.get(allocation.topicId);
    if (!topic?.questionType || topic.error) throw configurationError(topic?.error || "A selected topic no longer belongs to the syllabus.", "failed-precondition");
    if (allocation.questionType !== undefined && allocation.questionType !== topic.questionType) {
      throw configurationError(`The format of ${topic.topicName} changed. Reload the configuration and review its counts.`, "failed-precondition");
    }
    return {...allocation, questionType: topic.questionType};
  });
}

function readConfiguration(data) {
  if (!data) return null;
  return {...data, createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
    updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt};
}

export {configurationError, requireDocumentId, requireScope, requireTopicAllocation,
  requireConfigurationInput, requireRepeatPolicy, requireSettingsInput, readSettings, canonicalScope, topicOption, resolveAllocations, readConfiguration};
