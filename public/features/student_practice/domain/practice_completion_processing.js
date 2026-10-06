export const completionProcessingStatuses = Object.freeze({
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
});

export const completionProcessingStages = Object.freeze({
  ASSESSING: "assessing",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed"
});

const validStatuses = new Set(Object.values(completionProcessingStatuses));
const validStages = new Set(Object.values(completionProcessingStages));

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

export function normalizeCompletionProcessingIdentity({
  studentId,
  practiceId
} = {}) {
  return Object.freeze({
    studentId: requireDocumentId(studentId, "studentId"),
    practiceId: requireDocumentId(practiceId, "practiceId")
  });
}

export function normalizeCompletionProcessingRecord(record) {
  if (record === null) {
    return null;
  }

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Completion processing record is invalid.");
  }

  const status = String(record.status ?? "").trim();
  const stage = String(record.stage ?? "").trim();

  if (!validStatuses.has(status)) {
    throw new Error("Completion processing status is invalid.");
  }

  if (!validStages.has(stage)) {
    throw new Error("Completion processing stage is invalid.");
  }

  return Object.freeze({
    status,
    stage,
    eventId: String(record.eventId ?? "").trim() || null,
    startedAt: record.startedAt ?? null,
    updatedAt: record.updatedAt ?? null,
    completedAt: record.completedAt ?? null,
    generatedPracticeId:
      String(record.generatedPracticeId ?? "").trim() || null,
    outcome: String(record.outcome ?? "").trim() || null,
    errorCode: String(record.errorCode ?? "").trim() || null
  });
}
