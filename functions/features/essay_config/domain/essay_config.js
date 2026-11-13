const {normalizeConfiguration: normalizeLegacy} = require("../../essay_question_generator/domain/essay_question_generator_config");
const LEVELS = ["primary", "secondary"], STANDARDS = [1, 2, 3, 4, 5, 6];
function fail(message, code = "invalid-argument") {return Object.assign(new Error(message), {code});}
function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail(name + " must be an object.");
  return value;
}
function text(value, name, max = 16000) {
  if (typeof value !== "string" || value.length > max) throw fail(name + " must be text of at most " + max + " characters.");
  return value.trim();
}
function documentId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value) || /^__.*__$/.test(value)) throw fail("Invalid essay type document ID.");
  return value;
}
function gradeDocumentId(level, standard) {
  if (!LEVELS.includes(level) || !STANDARDS.includes(standard)) throw fail("Select a valid level and grade.");
  return level + "_" + standard;
}
function defaultEssayTypes() {
  return [
    ["normalEssay", "Normal essay", "Set a standalone essay-writing task with a clear subject and purpose."],
    ["finishTheStory", "Finish the story", "Provide a short, unfinished story opening. Ask the student to continue it and write an ending. Do not supply the continuation or ending."],
    ["replyToEmail", "Reply to an email", "Provide an incoming email, including its sender and questions or requests. Ask the student to write a reply addressing them. Do not supply the reply."],
    ["writeLetter", "Write a letter", "Specify the recipient, purpose and appropriate formal or informal context. Ask the student to write the letter. Do not supply a model letter."],
    ["fourFrameStory", "Write a story from four pictures", "Give brief context. Plan four ordered events and depict them in one image with four frames, read top-left, top-right, bottom-left, bottom-right. Ask the student to write a story following that sequence, adding their own details. Do not give a complete story."],
  ].map(([id, name, llmInstructions]) => ({id, name, llmInstructions, gradeInstructions: {},
    pictureRequirement: id === "fourFrameStory" ? "required" : "optional", pictureFrameCount: id === "fourFrameStory" ? 4 : 1}));
}
function normalizeEssayType(input) {
  record(input, "Essay type");
  const id = documentId(input.id), name = text(input.name, "Essay type name", 200);
  if (!name) throw fail("An essay type name is required.");
  if (!["optional", "required"].includes(input.pictureRequirement)) throw fail("Choose optional or required pictures.");
  if (!Number.isInteger(input.pictureFrameCount) || input.pictureFrameCount < 1 || input.pictureFrameCount > 12) throw fail("Picture frame count must be from 1 to 12.");
  if (input.pictureFrameCount > 1 && input.pictureRequirement !== "required") throw fail("A multi-frame story requires a picture.");
  const gradeInstructions = {};
  for (const [key, value] of Object.entries(record(input.gradeInstructions ?? {}, "Type grade instructions"))) {
    if (!/^(primary|secondary)_[1-6]$/.test(key)) throw fail("Invalid grade reference in type instructions.");
    gradeInstructions[key] = text(value, "Type grade instructions");
  }
  return {id, name, llmInstructions: text(input.llmInstructions ?? "", "Type instructions"), gradeInstructions,
    pictureRequirement: input.pictureRequirement, pictureFrameCount: input.pictureFrameCount};
}
function normalizeGradeConfig(input, types) {
  record(input, "Grade configuration"); gradeDocumentId(input.level, input.standard);
  const legacy = normalizeLegacy({gradeInstructions: {[input.level]: {[input.standard]: input.additionalLlmInstructions ?? ""}},
    gradeWordCountRequirements: {[input.level]: {[input.standard]: input.wordCountRequirement ?? {minWords: null}}},
    gradeSupport: {[input.level]: {[input.standard]: {helpingWordsEnabled: input.helpingWordsEnabled ?? false, helpingWordCount: input.helpingWordCount ?? 5}}}});
  if (!Array.isArray(input.essayTypes)) throw fail("Grade essayTypes must be a list of references.");
  const seen = new Set();
  const essayTypes = input.essayTypes.map(ref => {
    record(ref, "Essay type reference");
    if (Object.keys(ref).some(key => !["essayTypeId", "pictureEnabled"].includes(key))) throw fail("Unsupported essay type reference field.");
    const id = documentId(ref.essayTypeId), type = types.find(item => item.id === id);
    if (!type) throw fail("The referenced essay type does not exist: " + id);
    if (seen.has(id)) throw fail("An essay type can only be listed once per grade."); seen.add(id);
    if (typeof ref.pictureEnabled !== "boolean") throw fail("pictureEnabled must be a boolean.");
    if (type.pictureRequirement === "required" && !ref.pictureEnabled) throw fail(type.name + " requires a picture.");
    return {essayTypeId: id, pictureEnabled: ref.pictureEnabled};
  });
  const {helpingWordsEnabled, helpingWordCount} = legacy.gradeSupport[input.level][input.standard];
  return {level: input.level, standard: input.standard, additionalLlmInstructions: legacy.gradeInstructions[input.level][input.standard],
    wordCountRequirement: legacy.gradeWordCountRequirements[input.level][input.standard], helpingWordsEnabled, helpingWordCount, essayTypes};
}
function fromLegacyConfiguration(input = {}) {
  const legacy = normalizeLegacy({...input}), gradeSettings = {};
  for (const level of LEVELS) {
    gradeSettings[level] = {};
    for (const standard of STANDARDS) {
      const {pictureEnabled, helpingWordsEnabled, helpingWordCount} = legacy.gradeSupport[level][standard];
      gradeSettings[level][standard] = {level, standard, additionalLlmInstructions: legacy.gradeInstructions[level][standard],
        wordCountRequirement: legacy.gradeWordCountRequirements[level][standard], helpingWordsEnabled, helpingWordCount,
        essayTypes: [{essayTypeId: "normalEssay", pictureEnabled}]};
    }
  }
  return {schemaVersion: 1, version: 0, additionalLlmInstructions: legacy.additionalLlmInstructions,
    difficultyInstructions: legacy.difficultyInstructions, essayTypes: defaultEssayTypes(), gradeSettings,
    updatedAt: input.updatedAt ?? null, updatedBy: input.updatedBy ?? null};
}
function normalizeEssayConfiguration(input) {
  record(input, "Essay configuration");
  if (!Array.isArray(input.essayTypes) || input.essayTypes.length < 1 || input.essayTypes.length > 100) throw fail("Configure from 1 to 100 essay types.");
  const essayTypes = input.essayTypes.map(normalizeEssayType);
  if (new Set(essayTypes.map(type => type.id)).size !== essayTypes.length) throw fail("Essay type IDs must be unique.");
  const gradeSettings = {};
  for (const level of LEVELS) {
    gradeSettings[level] = {};
    for (const standard of STANDARDS) {
      const grade = input.gradeSettings?.[level]?.[standard];
      if (!grade || grade.level !== level || grade.standard !== standard) throw fail("A configuration is required for every level and grade.");
      gradeSettings[level][standard] = normalizeGradeConfig(grade, essayTypes);
    }
  }
  const legacy = normalizeLegacy({...input});
  return {schemaVersion: 1, additionalLlmInstructions: legacy.additionalLlmInstructions,
    difficultyInstructions: legacy.difficultyInstructions, essayTypes, gradeSettings};
}
// Compatibility projection for existing practice and assessment consumers; never stored twice.
function generatorConfiguration(configuration) {
  const input = configuration?.essayTypes ? configuration : fromLegacyConfiguration(configuration ?? {});
  const result = {...input, gradeInstructions: {}, gradeWordCountRequirements: {}, gradeSupport: {}};
  for (const level of LEVELS) {
    result.gradeInstructions[level] = {}; result.gradeWordCountRequirements[level] = {}; result.gradeSupport[level] = {};
    for (const standard of STANDARDS) {
      const grade = input.gradeSettings[level][standard];
      result.gradeInstructions[level][standard] = grade.additionalLlmInstructions;
      result.gradeWordCountRequirements[level][standard] = grade.wordCountRequirement;
      result.gradeSupport[level][standard] = {pictureEnabled: grade.essayTypes.find(ref => ref.essayTypeId === "normalEssay")?.pictureEnabled ?? false,
        helpingWordsEnabled: grade.helpingWordsEnabled, helpingWordCount: grade.helpingWordCount};
    }
  }
  return result;
}
function applyLegacyConfiguration(current, input) {
  const legacy = normalizeLegacy({...input}), updated = JSON.parse(JSON.stringify(current));
  updated.additionalLlmInstructions = legacy.additionalLlmInstructions; updated.difficultyInstructions = legacy.difficultyInstructions;
  for (const level of LEVELS) for (const standard of STANDARDS) {
    const grade = updated.gradeSettings[level][standard], support = legacy.gradeSupport[level][standard];
    grade.additionalLlmInstructions = legacy.gradeInstructions[level][standard];
    grade.wordCountRequirement = legacy.gradeWordCountRequirements[level][standard];
    grade.helpingWordsEnabled = support.helpingWordsEnabled; grade.helpingWordCount = support.helpingWordCount;
    const ref = grade.essayTypes.find(item => item.essayTypeId === "normalEssay");
    if (ref) ref.pictureEnabled = support.pictureEnabled;
  }
  return updated;
}
function resolveEssayType(configuration, criteria, {random = () => 0} = {}) {
  const config = configuration?.essayTypes ? configuration : fromLegacyConfiguration(configuration ?? {});
  const grade = config.gradeSettings[criteria.level]?.[criteria.standard];
  if (!grade) throw fail("The grade is not configured.", "failed-precondition");
  const refs = grade.essayTypes;
  const ref = criteria.essayTypeId ? refs.find(item => item.essayTypeId === criteria.essayTypeId) : refs[Math.floor(random() * refs.length)];
  if (!ref) throw fail("This essay type is not available for the selected grade.", "failed-precondition");
  const type = config.essayTypes.find(item => item.id === ref.essayTypeId);
  if (!type) throw fail("The configured essay type no longer exists.", "failed-precondition");
  if (type.pictureRequirement === "required" && !ref.pictureEnabled) throw fail("This essay type requires a picture.", "failed-precondition");
  return {type, grade, settings: {pictureEnabled: ref.pictureEnabled, helpingWordsEnabled: grade.helpingWordsEnabled, helpingWordCount: grade.helpingWordCount}};
}
function questionMatchesConfiguration(question, configuration) {
  try {
    const {type, settings} = resolveEssayType(configuration, {...question, essayTypeId: question.essayTypeId ?? "normalEssay"});
    if (type.pictureRequirement === "required" && question.support?.pictureStatus !== "ready") return false;
    if (question.essayType && (question.essayType.pictureRequirement !== type.pictureRequirement || question.essayType.pictureFrameCount !== type.pictureFrameCount)) return false;
    if (type.pictureFrameCount > 1 && question.storyFrames?.length !== type.pictureFrameCount) return false;
    const saved = question.support?.settings;
    return !saved ? !settings.pictureEnabled && !settings.helpingWordsEnabled
      : saved.pictureEnabled === settings.pictureEnabled && saved.helpingWordsEnabled === settings.helpingWordsEnabled
        && (!settings.helpingWordsEnabled || saved.helpingWordCount === settings.helpingWordCount);
  } catch {return false;}
}
module.exports = {LEVELS, STANDARDS, fail, documentId, gradeDocumentId, defaultEssayTypes, normalizeEssayType,
  normalizeGradeConfig, normalizeEssayConfiguration, fromLegacyConfiguration, generatorConfiguration, applyLegacyConfiguration, resolveEssayType, questionMatchesConfiguration};
