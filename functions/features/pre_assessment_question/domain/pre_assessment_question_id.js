function normalizePreAssessmentQuestionId(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("questionId must be a non-empty string.");
  }
  const id = value.trim();
  if (id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)
      || new TextEncoder().encode(id).length > 1500) {
    throw new Error("questionId must be a valid Firestore document ID.");
  }
  return id;
}

module.exports = {normalizePreAssessmentQuestionId};
