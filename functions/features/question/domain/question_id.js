function normalizeQuestionId(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("questionId must be a non-empty string.");
  }

  const questionId = value.trim();
  if (
    questionId.includes("/")
    || questionId === "."
    || questionId === ".."
    || /^__.*__$/.test(questionId)
    || new TextEncoder().encode(questionId).length > 1500
  ) {
    throw new Error("questionId must be a valid Firestore document ID.");
  }

  return questionId;
}

module.exports = { normalizeQuestionId };
