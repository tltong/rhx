function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function requireEnumValue(value, values, name) {
  const normalizedValue = requireNonEmptyString(value, name).toLowerCase();

  if (!Object.values(values).includes(normalizedValue)) {
    throw new Error(`${name} must be one of: ${Object.values(values).join(", ")}.`);
  }

  return normalizedValue;
}

export class GuardianStudentLink {
  static Relationships = Object.freeze({
    PARENT: "parent",
    TEACHER: "teacher",
    GUARDIAN: "guardian"
  });

  static States = Object.freeze({
    ACTIVE: "active",
    INACTIVE: "inactive"
  });

  constructor({
    id = null,
    guardianId,
    studentId,
    relationship,
    state = GuardianStudentLink.States.ACTIVE,
    linkedAt = null,
    updatedAt = null
  }) {
    this.id = id === null ? null : requireNonEmptyString(id, "id");
    this.guardianId = requireNonEmptyString(guardianId, "guardianId");
    this.studentId = requireNonEmptyString(studentId, "studentId");
    this.relationship = requireEnumValue(
      relationship,
      GuardianStudentLink.Relationships,
      "relationship"
    );
    this.state = requireEnumValue(state, GuardianStudentLink.States, "state");
    this.linkedAt = linkedAt;
    this.updatedAt = updatedAt;
  }

  updateRelationship(relationship, updatedAt = new Date()) {
    this.relationship = requireEnumValue(
      relationship,
      GuardianStudentLink.Relationships,
      "relationship"
    );
    this.updatedAt = updatedAt;

    return this;
  }

  setState(state, updatedAt = new Date()) {
    this.state = requireEnumValue(state, GuardianStudentLink.States, "state");
    this.updatedAt = updatedAt;

    return this;
  }

  activate(updatedAt = new Date()) {
    return this.setState(GuardianStudentLink.States.ACTIVE, updatedAt);
  }

  deactivate(updatedAt = new Date()) {
    return this.setState(GuardianStudentLink.States.INACTIVE, updatedAt);
  }
}

export const guardianStudentRelationships = GuardianStudentLink.Relationships;
export const guardianStudentLinkStates = GuardianStudentLink.States;
