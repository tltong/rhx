const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestorePracticeCompletionProcessingRepository,
} = require("./firestore_practice_completion_processing_repository");

function createRepository(existing = null) {
  const writes = [];
  const documentReference = {id: "practice-1"};
  const repository = new FirestorePracticeCompletionProcessingRepository({
    getDocumentRef(collectionPath, documentId) {
      assert.equal(
        collectionPath,
        "studentPractices/student-1/completionProcessing",
      );
      assert.equal(documentId, "practice-1");
      return documentReference;
    },
    getFirestoreDb() {
      return {
        async runTransaction(operation) {
          return operation({
            async get(reference) {
              assert.equal(reference, documentReference);
              return existing
                ? {exists: true, data: () => existing}
                : {exists: false, data: () => undefined};
            },
            set(reference, data, options) {
              writes.push({reference, data, options});
            },
          });
        },
      };
    },
    serverTimestamp() {
      return "server-time";
    },
  });

  return {repository, writes};
}

const IDENTITY = Object.freeze({
  studentId: "student-1",
  practiceId: "practice-1",
  eventId: "event-1",
});

test("markProcessing creates the assessing status record", async () => {
  const {repository, writes} = createRepository();
  const result = await repository.markProcessing(IDENTITY);

  assert.equal(result.shouldProcess, true);
  assert.deepEqual(writes, [{
    reference: {id: "practice-1"},
    data: {
      status: "processing",
      stage: "assessing",
      eventId: "event-1",
      startedAt: "server-time",
      updatedAt: "server-time",
      completedAt: null,
      generatedPracticeId: null,
      outcome: null,
      errorCode: null,
    },
    options: {merge: true},
  }]);
});

test("markCompleted records the generated practice", async () => {
  const {repository, writes} = createRepository({
    status: "processing",
    stage: "generating",
    startedAt: "start-time",
  });

  await repository.markCompleted({
    ...IDENTITY,
    generatedPracticeId: "practice-2",
    outcome: "practice-generated",
  });

  assert.deepEqual(writes[0].data, {
    status: "completed",
    stage: "completed",
    eventId: "event-1",
    startedAt: "start-time",
    updatedAt: "server-time",
    completedAt: "server-time",
    generatedPracticeId: "practice-2",
    outcome: "practice-generated",
    errorCode: null,
  });
});

test("a completed record cannot regress to processing", async () => {
  const {repository, writes} = createRepository({
    status: "completed",
    stage: "completed",
  });
  const result = await repository.markProcessing(IDENTITY);

  assert.equal(result.shouldProcess, false);
  assert.equal(result.changed, false);
  assert.deepEqual(writes, []);
});
