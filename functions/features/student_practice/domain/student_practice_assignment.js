const {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION,
} = require("../../../schema/student_practice_schema");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

/**
 * @typedef {Object} StudentPracticeAssignmentInput
 * @property {string} studentId
 * @property {string} practiceId
 */

class StudentPracticeAssignment {
  /** @param {StudentPracticeAssignmentInput} input */
  constructor({
    studentId,
    practiceId,
  } = {}) {
    this.studentId = requireIdentifier(studentId, "studentId");
    this.practiceId = requireIdentifier(practiceId, "practiceId");
    this.path = [
      STUDENT_PRACTICES_COLLECTION,
      this.studentId,
      ASSIGNED_PRACTICES_SUBCOLLECTION,
      this.practiceId,
    ].join("/");

    Object.freeze(this);
  }
}

module.exports = {
  StudentPracticeAssignment,
};
