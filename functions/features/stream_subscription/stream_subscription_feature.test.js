const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SubscribeStudentToStream,
} = require("./application/subscribe_student_to_stream");
const {
  StreamSubscription,
} = require("./domain/stream_subscription");
const {
  FirestoreStreamSubscriptionRepository,
} = require(
  "./infrastructure/firestore_stream_subscription_repository",
);
const streamSubscriptionModule = require("./stream_subscription_module");

test("stream subscription module exposes the web API surface", () => {
  assert.deepEqual(Object.keys(streamSubscriptionModule).sort(), [
    "getStudentStreamSubscription",
    "subscribeStudentToStream",
    "unsubscribeStudentFromStream",
  ]);
});

test("subscribe validates the stream and saves the association", async () => {
  let savedSubscription = null;
  const useCase = new SubscribeStudentToStream({
    streamSubscriptionRepository: {
      save: async (subscription) => {
        savedSubscription = subscription;
      },
    },
    getStreamById: async (streamId) => ({id: streamId}),
  });

  const subscription = await useCase.execute("student-1", "stream-1");

  assert.ok(subscription instanceof StreamSubscription);
  assert.equal(subscription.studentId, "student-1");
  assert.equal(subscription.streamId, "stream-1");
  assert.equal(savedSubscription, subscription);
});

test("subscribe rejects an unknown stream without writing", async () => {
  let saveCalled = false;
  const useCase = new SubscribeStudentToStream({
    streamSubscriptionRepository: {
      save: async () => {
        saveCalled = true;
      },
    },
    getStreamById: async () => null,
  });

  await assert.rejects(
    useCase.execute("student-1", "missing-stream"),
    /could not be found/,
  );
  assert.equal(saveCalled, false);
});

test("repository stores the stream under the student document ID", async () => {
  const writes = [];
  const repository = new FirestoreStreamSubscriptionRepository({
    writeDocument: async (...args) => writes.push(args),
  });
  const subscription = new StreamSubscription({
    studentId: "student-1",
    streamId: "stream-1",
  });

  assert.equal(await repository.save(subscription), subscription);
  assert.deepEqual(writes, [[
    "streamSubscriptions",
    "student-1",
    {streamId: "stream-1"},
    {merge: false},
  ]]);
});

test("repository reads and deletes a student subscription", async () => {
  const deletes = [];
  const repository = new FirestoreStreamSubscriptionRepository({
    readDocument: async () => ({streamId: "stream-1"}),
    deleteDocument: async (...args) => deletes.push(args),
  });

  const subscription = await repository.getByStudentId("student-1");
  await repository.delete("student-1");

  assert.deepEqual(subscription, new StreamSubscription({
    studentId: "student-1",
    streamId: "stream-1",
  }));
  assert.deepEqual(deletes, [["streamSubscriptions", "student-1"]]);
});
