function requireId(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")
      || [".", ".."].includes(value.trim()) || /^__.*__$/.test(value.trim())
      || new TextEncoder().encode(value.trim()).length > 1500) {
    throw new Error(name + " must be a valid document identifier.");
  }
  return value.trim();
}
function normalizeEssayPractice(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Essay practice input must be an object.");
  return {essayQuestionId: requireId(input.essayQuestionId, "essayQuestionId")};
}
function readEssayPractice(data, id) {
  return Object.freeze({id: requireId(id, "practiceId"), ...normalizeEssayPractice(data)});
}

module.exports = {requireId, normalizeEssayPractice, readEssayPractice};

