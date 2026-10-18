function identifier(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || [".", ".."].includes(value.trim())
      || /^__.*__$/.test(value.trim()) || new TextEncoder().encode(value.trim()).length > 1500) throw resetError("invalid-argument", name + " must be a valid document ID.");
  return value.trim();
}
function resetScope(input) {
  return {studentId: identifier(input?.studentId, "studentId"), syllabusId: identifier(input?.syllabusId, "syllabusId"),
    topicId: identifier(input?.topicId, "topicId")};
}
function topicKey({syllabusId, topicId}) {
  const key = encodeURIComponent(JSON.stringify([syllabusId, topicId]));
  if (new TextEncoder().encode(key).length > 1500) throw resetError("invalid-argument", "Syllabus/topic identifiers are too long.");
  return key;
}
function resetError(code, message) {return Object.assign(new Error(message), {code});}
module.exports = {identifier, resetScope, topicKey, resetError};
