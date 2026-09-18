const {
  guardianStudentLinkStates,
  guardianStudentRelationships,
} = require("../../../schema/guardian_student_link_schema");

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function requireEnum(value, fieldName, allowedValues) {
  const normalizedValue = requireText(value, fieldName).toLowerCase();

  if (!Object.values(allowedValues).includes(normalizedValue)) {
    throw new Error(
      `${fieldName} must be one of: ${Object.values(allowedValues).join(", ")}.`,
    );
  }

  return normalizedValue;
}

class GuardianStudentLink {
  constructor({
    id = null,
    guardianId,
    studentId,
    relationship,
    state,
    linkedAt = null,
    updatedAt = null,
  }) {
    this.id = id === null ? null : requireText(id, "id");
    this.guardianId = requireText(guardianId, "guardianId");
    this.studentId = requireText(studentId, "studentId");
    this.relationship = requireEnum(
      relationship,
      "relationship",
      guardianStudentRelationships,
    );
    this.state = requireEnum(
      state,
      "state",
      guardianStudentLinkStates,
    );
    this.linkedAt = linkedAt;
    this.updatedAt = updatedAt;
  }

  get isActive() {
    return this.state === guardianStudentLinkStates.ACTIVE;
  }
}

module.exports = {
  GuardianStudentLink,
  guardianStudentLinkStates,
  guardianStudentRelationships,
};
