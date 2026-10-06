import assert from "node:assert/strict";
import test from "node:test";

test("watchDocument maps snapshots and returns Firestore unsubscribe", async () => {
  let snapshotHandler = null;
  let errorHandler = null;
  let unsubscribed = false;
  const documentReference = {
    onSnapshot(onSnapshot, onError) {
      snapshotHandler = onSnapshot;
      errorHandler = onError;
      return () => {
        unsubscribed = true;
      };
    }
  };
  const firestore = {
    collection(collectionPath) {
      assert.equal(collectionPath, "students/student-1/processing");
      return {
        doc(documentId) {
          assert.equal(documentId, "practice-1");
          return documentReference;
        }
      };
    }
  };
  const app = {firestore: () => firestore};

  globalThis.firebase = {
    apps: [],
    initializeApp() {
      this.apps.push(app);
      return app;
    },
    firestore() {
      return firestore;
    }
  };

  const {watchDocument} = await import(
    `./firebase_ops.js?watch-test=${Date.now()}`
  );
  const changes = [];
  const errors = [];
  const unsubscribe = watchDocument(
    "students/student-1/processing",
    "practice-1",
    (record) => changes.push(record),
    (error) => errors.push(error),
    {includeId: false}
  );

  snapshotHandler({
    exists: true,
    id: "practice-1",
    data: () => ({status: "completed"})
  });
  assert.deepEqual(changes, [{status: "completed"}]);

  const expectedError = new Error("listener failed");
  errorHandler(expectedError);
  assert.deepEqual(errors, [expectedError]);

  unsubscribe();
  assert.equal(unsubscribed, true);
  delete globalThis.firebase;
});
