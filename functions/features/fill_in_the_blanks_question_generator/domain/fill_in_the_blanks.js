const TYPE = "fillInTheBlanks";
const LEVELS = ["primary", "secondary"];
const DIFFICULTIES = ["easy", "medium", "hard"];
function problem(message, code = "invalid-argument") {return Object.assign(new Error(message), {code});}
function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw problem(name + " must be an object.");
  return value;
}
function text(value, name, maximum = 20000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw problem(name + " must be nonempty text of at most " + maximum + " characters.");
  return value.trim();
}
function id(value, name = "ID") {
  const result = text(value, name, 128);
  if (["__proto__", "prototype", "constructor"].includes(result) || !/^[\p{L}\p{N}_-]+$/u.test(result)) throw problem(name + " is invalid.");
  return result;
}
function integer(value, name, maximum = 100) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw problem(name + " must be an integer from 1 to " + maximum + ".");
  return value;
}
function scope(input) {
  record(input, "Passage criteria");
  const language = text(input.language, "language", 80).normalize("NFKC").toLowerCase();
  return {syllabusId: id(input.syllabusId, "syllabusId"), topicId: id(input.topicId, "topicId"), language};
}
function languageKey(language) {return text(language, "language", 80).normalize("NFKC").toLowerCase().replace(/\s+/g, "_").replace(/[.\/\[\]*`]/g, "_");}
function passageCollection(input) {
  const s = scope(input);
  return `fillInTheBlanksQuestions/${s.syllabusId}/topics/${s.topicId}/languages/${languageKey(s.language)}/passages`;
}
function wordCount(value) {return String(value).trim().split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length;}
function isChineseLanguage(value) {
  const language = String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/_/g, "-");
  return /^zh(?:-|$)/u.test(language) || /^(?:chinese|mandarin)(?:$|[\s(-])/u.test(language)
    || /^(?:simplified|traditional)\s+chinese(?:$|[\s(])/u.test(language)
    || /^(?:中文|华文|華文|华语|華語|汉语|漢語|普通话|普通話|简体中文|簡體中文|繁体中文|繁體中文)(?:$|[\s(])/u.test(language);
}
function characterCount(value) {
  return [...String(value).normalize("NFKC")].filter(character => /[\p{L}\p{N}]/u.test(character)).length;
}
function answerLengthUnit(language, question = {}) {
  return isChineseLanguage(language) || question.requiredCharacterCount !== undefined ? "characters" : "words";
}
function answerLength(value, language, question) {
  return answerLengthUnit(language, question) === "characters" ? characterCount(value) : wordCount(value);
}
function requiredAnswerLength(question, language) {
  if (answerLengthUnit(language, question) === "words") return question.requiredWordCount;
  if (Number.isSafeInteger(question.requiredCharacterCount) && question.requiredCharacterCount > 0) return question.requiredCharacterCount;
  return typeof question.correctAnswer === "string" ? characterCount(question.correctAnswer) : null;
}
function normalisePassageAnswerLengths(passage) {
  if (!passage || !isChineseLanguage(passage.language)) return passage;
  return {...passage, questions: (passage.questions ?? []).map(question => typeof question.correctAnswer === "string"
    ? {...question, requiredCharacterCount: characterCount(question.correctAnswer)} : {...question})};
}
function normaliseAnswer(value, language) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return normalized.replace(/\s+/gu, isChineseLanguage(language) ? "" : " ");
}
function parseJson(value) {
  if (typeof value !== "string") return record(value, "LLM response");
  try {return record(JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")), "LLM response");}
  catch {throw problem("The LLM did not return valid structured content.", "invalid-llm-response");}
}
function normaliseConfig(input = {}) {
  record(input, "Generator configuration");
  const gradeSettings = {};
  for (const level of LEVELS) {
    gradeSettings[level] = {};
    for (let grade = 1; grade <= 6; grade++) {
      const settings = input.gradeSettings?.[level]?.[grade] ?? {};
      if (settings.imageEnabled !== undefined && typeof settings.imageEnabled !== "boolean") throw problem("imageEnabled must be a boolean.");
      gradeSettings[level][grade] = {questionsPerPassage: integer(settings.questionsPerPassage ?? 5, "questionsPerPassage"),
        imageEnabled: settings.imageEnabled ?? false, additionalLlmInstructions: String(settings.additionalLlmInstructions ?? "").slice(0, 20000)};
    }
  }
  const history = input.summaryHistory ?? {mode: "recent", count: 20};
  if (!["recent", "all"].includes(history.mode)) throw problem("Summary history mode must be recent or all.");
  return {additionalLlmInstructions: String(input.additionalLlmInstructions ?? "").slice(0, 20000), gradeSettings,
    difficultyInstructions: Object.fromEntries(DIFFICULTIES.map(difficulty => [difficulty, String(input.difficultyInstructions?.[difficulty] ?? "").slice(0, 20000)])),
    summaryHistory: {mode: history.mode, count: integer(history.count ?? 20, "summaryHistory.count", 1000000)}};
}
function generationCriteria(input) {
  const result = {...scope(input), level: input.level, grade: integer(input.grade ?? input.standard, "grade", 6), difficulty: input.difficulty};
  if (!LEVELS.includes(result.level)) throw problem("School level must be primary or secondary.");
  if (!DIFFICULTIES.includes(result.difficulty)) throw problem("Difficulty must be easy, medium or hard.");
  return result;
}
function validateGenerated(raw, settings, language) {
  const value = parseJson(raw), passageText = text(value.passageText, "passageText"), summary = text(value.summary, "summary", 160);
  if (!Array.isArray(value.questions) || value.questions.length !== settings.questionsPerPassage) throw problem("The generated passage has the wrong number of blanks.", "invalid-llm-response");
  const ids = new Set(), questions = value.questions.map((question, index) => {
    record(question, "Blank question");
    const questionId = id(question.questionId, "questionId");
    if (ids.has(questionId)) throw problem("Duplicate blank ID.", "invalid-llm-response");
    ids.add(questionId);
    const correctAnswer = text(question.correctAnswer, "correctAnswer", 1000);
    // Derive both kinds of length from the model answer rather than trusting an LLM miscount.
    const requiredWordCount = wordCount(correctAnswer);
    const chinese = isChineseLanguage(language), count = chinese ? characterCount(correctAnswer) : requiredWordCount;
    if (count < 1 || count > 30) throw problem("Question " + (index + 1) + " must have a model answer containing 1 to 30 " + (chinese ? "characters" : "words") + ".", "invalid-llm-response");
    return {questionId, position: index + 1, requiredWordCount, ...(chinese ? {requiredCharacterCount: count} : {}), correctAnswer};
  });
  const tokens = [...passageText.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1]);
  if (tokens.length !== questions.length || tokens.some((key, index) => key !== questions[index].questionId)
      || passageText.replace(/\{\{[^{}]+\}\}/g, "").includes("{{")) throw problem("Passage blank markers do not match its questions in order.", "invalid-llm-response");
  return {passageText, summary, questions, imagePrompt: settings.imageEnabled && typeof value.imagePrompt === "string"
    && value.imagePrompt.trim() && value.imagePrompt.length <= 8000 ? value.imagePrompt.trim() : null};
}
function validateAnswers(questions, input, language) {
  record(input, "answers");
  const ids = new Set(questions.map(question => question.questionId));
  if (Object.keys(input).some(key => !ids.has(key))) throw problem("An answer references a question outside this passage.");
  return Object.fromEntries(questions.map(question => {
    const value = input[question.questionId] ?? "";
    if (typeof value !== "string" || value.length > 1000) throw problem("Each answer must be text of at most 1000 characters.");
    if (value.trim()) {
      const required = requiredAnswerLength(question, language), unit = answerLengthUnit(language, question);
      if (required === null) throw problem("This Chinese passage needs refreshed character counts. Reload the question after its metadata is updated.", "failed-precondition");
      if (answerLength(value, language, question) !== required) throw problem("Question " + question.position + " requires " + required + (unit === "characters" ? " character(s)." : " word(s)."));
    }
    return [question.questionId, value];
  }));
}
function validateAlternativeMarks(raw, unmatched) {
  const result = parseJson(raw);
  if (!Array.isArray(result.answers) || result.answers.length !== unmatched.length) throw problem("Alternative marking returned an incomplete result.", "invalid-llm-response");
  const expected = new Set(unmatched.map(question => question.questionId)), marks = {};
  for (const answer of result.answers) {
    if (!answer || !expected.delete(answer.questionId) || typeof answer.isCorrect !== "boolean") throw problem("Alternative marking returned an invalid result.", "invalid-llm-response");
    marks[answer.questionId] = answer.isCorrect;
  }
  return marks;
}
function publicPassage(passage) {
  const {answers, draft, leaseToken, ...result} = passage;
  return {...result, questions: (passage.questions ?? []).map(({correctAnswer, ...question}) => question)};
}
module.exports = {TYPE, LEVELS, DIFFICULTIES, problem, record, text, id, integer, scope, languageKey,
  passageCollection, wordCount, isChineseLanguage, characterCount, answerLengthUnit, answerLength, requiredAnswerLength, normalisePassageAnswerLengths, normaliseAnswer, parseJson, normaliseConfig, generationCriteria,
  validateGenerated, validateAnswers, validateAlternativeMarks, publicPassage};
