import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETION_PROCESSING_SUBCOLLECTION,
  studentPracticeSchema
} from "./student_practice_schema.js";

test("web schema defines completion processing records", () => {
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
        errorCode: {type: "string", nullable: true}
      }
    }
  );
});
