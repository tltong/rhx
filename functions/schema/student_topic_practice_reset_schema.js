const STUDENT_PRACTICE_RESETS_COLLECTION = "studentPracticeResets";
const studentTopicPracticeResetSchema = {
  collection: STUDENT_PRACTICE_RESETS_COLLECTION, documentId: "[studentId]",
  fields: {activeResetId: "string|null", activeTopicKey: "string|null", lastResetId: "string (optional)", topics: "map of topic key to {revision, resetAt}"},
  subcollections: {requests: {documentId: "[resetId]", fields: {
    syllabusId: "string", topicId: "string", requestedBy: "string",
    status: "running|failed|completed", stage: "planning|deleting|recalculating|completed",
    plannedCounts: "map", deletedCounts: "map", protectedEssayResults: "number",
    warnings: "string[]", totalSteps: "number",
    subjectReadiness: "number|null (on completion)", subjectReliability: "number|null (on completion)",
    leaseToken: "string", leaseUntil: "timestamp", updatedAt: "timestamp", error: "string|null",
  }, subcollections: {steps: {documentId: "[chunkNumber]", fields: {done: "boolean", operations: "array"}}}}},
};
module.exports = {STUDENT_PRACTICE_RESETS_COLLECTION, studentTopicPracticeResetSchema};
