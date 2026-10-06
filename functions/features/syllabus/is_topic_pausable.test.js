const assert = require("node:assert/strict");
const {after, beforeEach, mock, test} = require("node:test");
const firebaseOps = require("../../utils/firebase/firebase_ops");
const {SyllabusTopic} = require("./domain/syllabus");

const documents = new Map();
mock.method(firebaseOps, "readDocument", async (collectionPath, id) => {
  const data = documents.get(`${collectionPath}/${id}`);
  return data ? {...data, id} : null;
});
mock.method(firebaseOps, "readCollection", async (collectionPath) => {
  const prefix = `${collectionPath}/`;
  return [...documents]
    .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
    .map(([path, data]) => ({...data, id: path.slice(prefix.length)}));
});
const {isTopicPausable, getSyllabusById} = require("./syllabus_module");
after(() => mock.restoreAll());
beforeEach(() => {
  documents.clear();
  documents.set("syllabuses/syllabus-1", {
    country: "Malaysia",
    level: "primary",
    year: 4,
    subject: "Mathematics",
    languages: ["English"]
  });
  documents.set("syllabuses/syllabus-1/topics/topic-true",
    {topicName: "Fractions", pausable: true});
  documents.set("syllabuses/syllabus-1/topics/topic-false",
    {topicName: "Geometry", pausable: false});
  documents.set("syllabuses/syllabus-1/topics/topic-legacy", {topicName: "Algebra"});
});

test("server syllabus API returns true, false and the legacy default", async () => {
  const before = [...documents];
  assert.equal(await isTopicPausable("syllabus-1", "topic-true"), true);
  assert.equal(await isTopicPausable("syllabus-1", "topic-false"), false);
  assert.equal(await isTopicPausable("syllabus-1", "topic-legacy"), true);
  assert.equal(await isTopicPausable(" syllabus-1 ", " topic-false "), false);
  assert.deepEqual([...documents], before);
  const syllabus = await getSyllabusById("syllabus-1");
  assert.equal(syllabus.topics.find((topic) => topic.id === "topic-false").pausable, false);
});

test("server syllabus API rejects missing IDs, syllabuses and topics", async () => {
  await assert.rejects(() => isTopicPausable("", "topic-true"), /syllabusId is required/);
  await assert.rejects(() => isTopicPausable("syllabus-1", ""), /topicId is required/);
  await assert.rejects(() => isTopicPausable("missing", "topic-true"), /Syllabus could not be found/);
  await assert.rejects(() => isTopicPausable("syllabus-1", "missing"), /Syllabus topic could not be found/);
});

test("server rejects malformed pausable values instead of coercing them", async () => {
  for (const pausable of ["false", 0, 1, null]) {
    assert.throws(() => new SyllabusTopic({id: "topic-1", topicName: "Fractions", pausable}),
      /pausable must be a boolean/);
    documents.set("syllabuses/syllabus-1/topics/topic-true", {topicName: "Fractions", pausable});
    await assert.rejects(() => isTopicPausable("syllabus-1", "topic-true"), /pausable must be a boolean/);
  }
});
