function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class SyllabusSubscription {
  constructor({studentId, syllabusId, language} = {}) {
    this.studentId = requireIdentifier(studentId, "studentId");
    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.language = requireIdentifier(language, "language");
  }
}

module.exports = {
  SyllabusSubscription,
};
