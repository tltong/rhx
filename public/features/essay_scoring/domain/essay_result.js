function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}

function requireIdentifier(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(name + " is required.");
  const id = value.trim();
  if (id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)
      || new TextEncoder().encode(id).length > 1500) {
    throw new Error(name + " is not a valid document identifier.");
  }
  return id;
}

function requireAnswer(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("answer must be a nonempty string.");
  }
  // Corrections refer to this exact text, so do not trim or reformat the answer.
  return value;
}

function normalizeScoringInput(input) {
  requireRecord(input, "Essay scoring input");
  return Object.freeze({
    questionId: requireIdentifier(input.questionId, "questionId"),
    answer: requireAnswer(input.answer),
  });
}

function normalizeResultReference(input) {
  requireRecord(input, "Essay result reference");
  return Object.freeze({
    studentId: requireIdentifier(input.studentId, "studentId"),
    questionId: requireIdentifier(input.questionId, "questionId"),
  });
}

function normalizeAssessment(input, answer, {allowMissingReviewComment = false} = {}) {
  requireRecord(input, "Essay assessment");
  requireAnswer(answer);
  if (typeof input.score !== "number" || !Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    throw new Error("score must be a finite number between 0 and 100.");
  }
  if (!(allowMissingReviewComment && input.reviewComment === undefined)
      && (typeof input.reviewComment !== "string" || !input.reviewComment.trim())) {
    throw new Error("reviewComment must be a nonempty string.");
  }
  if (!Array.isArray(input.corrections)) throw new Error("corrections must be an array.");
  const corrections = input.corrections.map((entry, index) => {
    requireRecord(entry, "corrections[" + index + "]");
    if (typeof entry.originalText !== "string" || !entry.originalText.length
        || !answer.includes(entry.originalText)) {
      throw new Error("Each correction originalText must be an exact, nonempty excerpt from the answer.");
    }
    if (typeof entry.correctedText !== "string") throw new Error("Each correction correctedText must be a string.");
    if (typeof entry.explanation !== "string" || !entry.explanation.trim()) {
      throw new Error("Each correction explanation must be a nonempty string.");
    }
    return Object.freeze({
      originalText: entry.originalText, correctedText: entry.correctedText, explanation: entry.explanation.trim(),
    });
  });
  return Object.freeze({score: input.score,
    ...(input.reviewComment === undefined ? {} : {reviewComment: input.reviewComment.trim()}),
    corrections: Object.freeze(corrections)});
}

function parseAssessment(response, answer) {
  let data = response;
  if (typeof data === "string") {
    try {data = JSON.parse(data);}
    catch {throw new Error("Essay scoring LLM response must be valid JSON.");}
  }
  return normalizeAssessment(data, answer);
}

function normalizeResultInput(input, options) {
  const reference = normalizeResultReference(input);
  const answer = requireAnswer(input.answer);
  return Object.freeze({...reference, answer, ...normalizeAssessment(input, answer, options)});
}

function readEssayResult(data, reference) {
  requireRecord(data, "Stored essay result");
  const scoredAt = data.scoredAt instanceof Date ? data.scoredAt : data.scoredAt?.toDate?.();
  if (!(scoredAt instanceof Date) || !Number.isFinite(scoredAt.getTime())) {
    throw new Error("scoredAt must be a valid timestamp.");
  }
  return Object.freeze({
    // Results saved before overall reviews were introduced remain readable.
    ...normalizeResultInput({...data, ...normalizeResultReference(reference)}, {allowMissingReviewComment: true}),
    scoredAt: new Date(scoredAt.getTime()),
  });
}

export {normalizeScoringInput, normalizeResultReference, normalizeAssessment, parseAssessment, normalizeResultInput, readEssayResult};

