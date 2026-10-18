function requireIdentifier(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(name + " is required.");
  const id = value.trim();
  if (id.includes("/") || [".", ".."].includes(id) || /^__.*__$/.test(id)
      || new TextEncoder().encode(id).length > 1500) throw new Error(name + " is invalid.");
  return id;
}

function normalizeGenerationRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Essay generation input must be an object.");
  return Object.freeze({
    studentId: requireIdentifier(input.studentId, "studentId"),
    completedEssayPracticeId: requireIdentifier(input.completedEssayPracticeId, "completedEssayPracticeId"),
  });
}

function themeKey(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("The essay theme must be a nonempty string.");
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function questionCriteria(question) {
  if (!question || !["primary", "secondary"].includes(question.level)
      || !Number.isInteger(question.standard) || question.standard < 1 || question.standard > 6
      || typeof question.language !== "string" || !question.language.trim()) {
    throw new Error("The source essay question has invalid level, grade or language.");
  }
  return {level: question.level, standard: question.standard, language: question.language.trim(), difficulty: "medium"};
}

function normalizeDraft(draft, criteria, seed) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)
      || typeof draft.questionId !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(draft.questionId)
      || typeof draft.questionText !== "string" || !draft.questionText.trim()
      || Object.keys(criteria).some(key => draft[key] !== criteria[key])
      || themeKey(draft.seedUsed) !== themeKey(seed)) throw new Error("The generated essay draft does not match the requested question.");
  const minWords = draft.wordCountRequirement?.minWords ?? null;
  if (minWords !== null && (!Number.isSafeInteger(minWords) || minWords < 1)) throw new Error("The essay minimum word count is invalid.");
  return {questionId: draft.questionId, ...criteria, questionText: draft.questionText.trim(),
    seedUsed: draft.seedUsed.trim(), wordCountRequirement: {minWords}};
}

function generationError(code, message) {return Object.assign(new Error(message), {code});}

export {requireIdentifier, normalizeGenerationRequest, themeKey, questionCriteria, normalizeDraft, generationError};
