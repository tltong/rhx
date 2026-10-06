const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMPLETION_PROCESSING_SUBCOLLECTION,
  studentPracticeSchema,
} = require("./student_practice_schema");

test("student practice schema defines completion processing records", () => {
  assert.equal(COMPLETION_PROCESSING_SUBCOLLECTION, "completionProcessing");
  assert.deepEqual(
    studentPracticeSchema.subcollections.completionProcessing,
    {
      collection: "completionProcessing",
      documentId: "[practice_id]",
      fields: {
        status: "string",
        stage: "string",
        eventId: "string",
        startedAt: "timestamp",
        updatedAt: "timestamp",
        completedAt: {type: "timestamp", nullable: true},
        generatedPracticeId: {type: "string", nullable: true},
        outcome: {type: "string", nullable: true},
        errorCode: {type: "string", nullable: true},
      },
    },
  );
});
