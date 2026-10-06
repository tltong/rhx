import assert from "node:assert/strict";
import test from "node:test";

import {
  FirestorePracticeCompletionProcessingRepository
} from "./firestore_practice_completion_processing_repository.js";

test("web repository watches the student's processing document", () => {
  const calls = [];
  const changes = [];
  const errors = [];
  const unsubscribe = () => {};
  const repository = new FirestorePracticeCompletionProcessingRepository({
    watchDocumentOperation(...args) {
      calls.push(args);
      return unsubscribe;
    }
  });
  const result = repository.watch({
    studentId: "student-1",
    practiceId: "practice-1",
    onChange: (record) => changes.push(record),
    onError: (error) => errors.push(error)
  });

  assert.equal(result, unsubscribe);
  assert.equal(
    calls[0][0],
    "studentPractices/student-1/completionProcessing"
  );
  assert.equal(calls[0][1], "practice-1");
  assert.deepEqual(calls[0][4], {includeId: false});

  calls[0][2]({
    status: "processing",
    stage: "generating",
    generatedPracticeId: null
  });
  assert.equal(changes[0].status, "processing");
  assert.equal(changes[0].stage, "generating");
  assert.equal(Object.isFrozen(changes[0]), true);
  assert.deepEqual(errors, []);
});

test("web repository reports malformed processing records", () => {
  let snapshotHandler = null;
  const errors = [];
  const repository = new FirestorePracticeCompletionProcessingRepository({
    watchDocumentOperation(path, id, onSnapshot) {
      snapshotHandler = onSnapshot;
      return () => {};
    }
  });

  repository.watch({
    studentId: "student-1",
    practiceId: "practice-1",
    onChange() {
      throw new Error("must not be called");
    },
    onError: (error) => errors.push(error)
  });
  snapshotHandler({status: "unknown", stage: "unknown"});

  assert.match(errors[0].message, /status is invalid/);
});
