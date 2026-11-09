const SUBJECT_ASSESSMENT_GENERATIONS = "subjectAssessmentGenerations";
const subjectAssessmentGenerationSchema = {
  collection: SUBJECT_ASSESSMENT_GENERATIONS, documentId: "{requestId}",
  fields: {studentId: "string", syllabusId: "string", language: "string", assessmentId: "string; reserved once",
    configurationSnapshot: "immutable configuration", contextSnapshot: "frozen level/grade/subject", status: "queued|generating|completed|failed", createdBy: "string",
    entryPoint: "student|absent for administrator generation", clientRequestId: "student-only idempotency token", generationRequest: "integer; worker request/continuation number",
    origin: "student|subscription; student queue only", subscriptionKey: "Firestore subscription creation seconds:nanoseconds; ties work to one subscription",
    startedAt: "timestamp", updatedAt: "timestamp", completedAt: "timestamp|null", progress: "{prepared,total,reused,generated}",
    leaseToken: "string|null; server/admin only", leaseUntil: "timestamp|null", errorCode: "string|null", errorMessage: "string|null"},
  subcollections: {items: {documentId: "{position}", fields: {item: "selected content with protected marking",
    draft: "generated pool draft|null", pooled: "boolean"}}},
  studentLock: "subjectAssessmentGenerations/_locks/students/{studentId}; renewable lease serializes student generation",
  studentSubjectState: {path: "subjectAssessmentGenerations/_students/students/{studentId}/subjects/{syllabusId}",
    description: "Protected coordination, atomically updated by start/submission/publication. Never readable or writable by students.",
    fields: {studentId: "string", syllabusId: "string", activeGenerationId: "string|null", lastSubmittedAt: "timestamp|null",
      lastSubmittedAssessmentId: "string|null", updatedAt: "timestamp",
      cleanup: "{id,status:pending|running|completed,requestedBy,requestedAt,completedAt?,leaseToken,leaseUntil,planReady?}; blocks writes until cleanup completes"},
    subcollections: {unsubscriptions: "{requestId}: cleanupId, requestedBy, createdAt; durable retry receipts",
      cleanupItems: "SHA-256(cleanupId,kind,targetId): cleanupId,kind:generation|assessment,targetId; resumable recursive-delete manifest"}},
  preview: "In-memory only; no job, pool, draft, image-asset, assessment or usage writes.",
};
export {SUBJECT_ASSESSMENT_GENERATIONS, subjectAssessmentGenerationSchema};
