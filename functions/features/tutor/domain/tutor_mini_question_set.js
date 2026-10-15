const {requireMiniQuestionCount} = require("./tutor_config");

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(name + " must be a nonempty string.");
  }
  return value.trim();
}

function normalizeTutorSetReference(input) {
  requireRecord(input, "Tutor mini question set reference");
  const questionId = requireText(input.questionId, "questionId");
  if (questionId.includes("/") || questionId === "." || questionId === ".."
      || /^__.*__$/.test(questionId) || new TextEncoder().encode(questionId).length > 1500) {
    throw new Error("questionId must be a valid Firestore document ID.");
  }
  const language = requireText(input.language, "language");
  if (new TextEncoder().encode(language).length > 1500) {
    throw new Error("language is too long.");
  }
  toTutorLanguageDocumentId(language);
  return {questionId, language, ...(input.miniQuestionCount === undefined ? {}
    : {miniQuestionCount: requireMiniQuestionCount(input.miniQuestionCount)})};
}

function toTutorLanguageDocumentId(language) {
  let id;
  try { id = encodeURIComponent(language).replace(/\./g, "%2E").replace(/_/g, "%5F"); }
  catch { throw new Error("language must contain valid Unicode."); }
  if (id.length > 1500) throw new Error("Encoded language is too long for a Firestore document ID.");
  return id;
}

function normalizeTutorSetVariantReference(input) {
  return {...normalizeTutorSetReference(input),
    miniQuestionCount: requireMiniQuestionCount(input.miniQuestionCount)};
}

function normalizeTutorResponse(response, {language, miniQuestionCount}) {
  requireMiniQuestionCount(miniQuestionCount);
  if (typeof response === "string") {
    try { response = JSON.parse(response); }
    catch { throw new Error("Tutor LLM response must be valid JSON."); }
  }
  requireRecord(response, "Tutor LLM response");
  if (requireText(response.language, "Tutor response language") !== language) {
    throw new Error("Tutor LLM response language must match the requested language.");
  }
  if (!Array.isArray(response.miniQuestions) || response.miniQuestions.length !== miniQuestionCount) {
    throw new Error("Tutor LLM response must contain exactly " + miniQuestionCount + " mini questions.");
  }
  return Object.freeze(response.miniQuestions.map((entry, index) => {
    const name = "miniQuestions[" + index + "]";
    requireRecord(entry, name);
    if (entry.sequence !== index + 1) {
      throw new Error(name + ".sequence must be the consecutive integer " + (index + 1) + ".");
    }
    if (!Array.isArray(entry.acceptedAnswers)) {
      throw new Error(name + ".acceptedAnswers must be an array.");
    }
    return Object.freeze({
      sequence: entry.sequence,
      questionText: requireText(entry.questionText, name + ".questionText"),
      expectedAnswer: requireText(entry.expectedAnswer, name + ".expectedAnswer"),
      acceptedAnswers: Object.freeze(entry.acceptedAnswers.map(
        (answer, answerIndex) => requireText(answer, name + ".acceptedAnswers[" + answerIndex + "]"),
      )),
      answerExplanation: requireText(entry.answerExplanation, name + ".answerExplanation"),
    });
  }));
}

function requireTimestamp(value, name) {
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error(name + " must be a valid timestamp.");
  }
  return new Date(date.getTime());
}

function normalizeTutorSetInput(input) {
  const reference = normalizeTutorSetVariantReference(input);
  const miniQuestionCount = requireMiniQuestionCount(input.miniQuestionCount);
  return {
    ...reference,
    miniQuestionCount,
    miniQuestions: normalizeTutorResponse(input, {...reference, miniQuestionCount}),
    configUpdatedAt: requireTimestamp(input.configUpdatedAt, "configUpdatedAt"),
  };
}

class TutorMiniQuestionSet {
  constructor(input) {
    Object.assign(this, normalizeTutorSetInput(input));
    this.generatedAt = requireTimestamp(input.generatedAt, "generatedAt");
    Object.freeze(this);
  }
}

module.exports = {TutorMiniQuestionSet, normalizeTutorSetReference, normalizeTutorSetVariantReference, toTutorLanguageDocumentId, normalizeTutorResponse, normalizeTutorSetInput};
