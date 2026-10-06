const completionProcessingStatuses = Object.freeze({
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
});

const completionProcessingStages = Object.freeze({
  ASSESSING: "assessing",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed",
});

const completionProcessingOutcomes = Object.freeze({
  PRACTICE_GENERATED: "practice-generated",
  FRAMEWORK_COMPLETED: "framework-completed",
  PRACTICE_NOT_ASSESSED: "practice-not-assessed",
});

function requireDocumentId(value, fieldName) {
  const id = String(value ?? "").trim();

  if (!id) {
    throw new Error(`${fieldName} is required.`);
  }

  if (id.includes("/")) {
    throw new Error(`${fieldName} must not contain a slash.`);
  }

  return id;
}

function normalizeProcessingIdentity({
  studentId,
  practiceId,
  eventId,
} = {}) {
  return Object.freeze({
    studentId: requireDocumentId(studentId, "studentId"),
    practiceId: requireDocumentId(practiceId, "practiceId"),
    eventId: requireDocumentId(eventId, "eventId"),
  });
}

function normalizeNullableDocumentId(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return requireDocumentId(value, fieldName);
}

function requireValue(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

module.exports = {
  completionProcessingOutcomes,
  completionProcessingStages,
  completionProcessingStatuses,
  normalizeNullableDocumentId,
  normalizeProcessingIdentity,
  requireValue,
};
