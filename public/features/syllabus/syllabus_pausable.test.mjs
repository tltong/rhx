import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";

import {SyllabusTopic} from "./domain/syllabus.js";
import {
  createSyllabusRecord,
  getSyllabusById,
  isTopicPausable,
  updateSyllabusRecord,
  assignTopicPreAssessmentPractice
} from "./syllabus_module.js";

const documents = new Map();
const writes = [];
let generatedId = 0;
const originalFirebase = globalThis.firebase;
const syllabusData = {
  country: "Malaysia",
  level: "primary",
  year: 4,
  subject: "Mathematics",
  languages: ["English"],
  active: true
};
const topicPath = (id) => `syllabuses/syllabus-1/topics/${id}`;

function snapshot(path) {
  return {
    id: path.split("/").at(-1),
    exists: documents.has(path),
    data: () => documents.get(path)
  };
}

const db = {
  collection(collectionPath) {
    return {
      doc(id = `generated-${++generatedId}`) {
        const path = `${collectionPath}/${id}`;
        return {
          id,
          path,
          async get() {
            return snapshot(path);
          },
          async set(data, options) {
            writes.push({path, data, options});
            documents.set(path, structuredClone(options?.merge
              ? {...documents.get(path), ...data}
              : data));
          },
          async delete() {
            documents.delete(path);
          }
        };
      },
      async get() {
        const prefix = `${collectionPath}/`;
        return {
          docs: [...documents.keys()]
            .filter((path) => path.startsWith(prefix)
              && !path.slice(prefix.length).includes("/"))
            .map(snapshot)
        };
      }
    };
  }
};

globalThis.firebase = {
  apps: [],
  initializeApp: () => ({firestore: () => db}),
  firestore: () => db
};
after(() => {
  if (originalFirebase === undefined) {
    delete globalThis.firebase;
  } else {
    globalThis.firebase = originalFirebase;
  }
});
beforeEach(() => {
  documents.clear();
  writes.length = 0;
  documents.set("syllabuses/syllabus-1", {...syllabusData});
  documents.set(topicPath("topic-true"), {topicName: "Fractions", pausable: true});
  documents.set(topicPath("topic-false"), {topicName: "Geometry", pausable: false});
  documents.set(topicPath("topic-legacy"), {topicName: "Algebra"});
});

test("web syllabus API returns true, false and the legacy default without writing", async () => {
  assert.equal(await isTopicPausable("syllabus-1", "topic-true"), true);
  assert.equal(await isTopicPausable("syllabus-1", "topic-false"), false);
  assert.equal(await isTopicPausable("syllabus-1", "topic-legacy"), true);
  assert.equal(await isTopicPausable(" syllabus-1 ", " topic-false "), false);
  assert.deepEqual(writes, []);
});

test("web syllabus API rejects missing IDs, syllabuses and topics", async () => {
  await assert.rejects(() => isTopicPausable("", "topic-true"), /syllabusId is required/);
  await assert.rejects(() => isTopicPausable("syllabus-1", ""), /topicId is required/);
  await assert.rejects(() => isTopicPausable("missing", "topic-true"), /Syllabus could not be found/);
  await assert.rejects(() => isTopicPausable("syllabus-1", "missing"), /Syllabus topic could not be found/);
  assert.deepEqual(writes, []);
});

test("creating a syllabus persists explicit false and the default for new topics", async () => {
  const syllabus = await createSyllabusRecord({
    ...syllabusData,
    topics: [
      {topicName: "Fractions", pausable: false},
      {topicName: "Geometry"}
    ]
  });
  assert.equal(await isTopicPausable(syllabus.id, syllabus.topics[0].id), false);
  assert.equal(await isTopicPausable(syllabus.id, syllabus.topics[1].id), true);
  assert.equal(documents.get(`syllabuses/${syllabus.id}/topics/${syllabus.topics[0].id}`).pausable,
    false);
});

test("saving syllabus changes preserves false and writes a default for legacy topics", async () => {
  const syllabus = await getSyllabusById("syllabus-1");
  await updateSyllabusRecord(syllabus, {subject: "Updated Mathematics"});
  assert.equal(documents.get(topicPath("topic-false")).pausable, false);
  assert.equal(documents.get(topicPath("topic-true")).pausable, true);
  assert.equal(documents.get(topicPath("topic-legacy")).pausable, true);
  assert.equal(await isTopicPausable("syllabus-1", "topic-false"), false);
});

test("saving an individual topic preserves pausable alongside pre-assessment changes", async () => {
  await assignTopicPreAssessmentPractice("syllabus-1", "topic-false", "English", "practice-1");
  const record = documents.get(topicPath("topic-false"));
  assert.equal(record.pausable, false);
  assert.equal(record.preAssessmentPractices.english.practiceId, "practice-1");
});

test("topic updates change pausable independently and persist through syllabus updates", async () => {
  const syllabus = await getSyllabusById("syllabus-1");
  const topic = syllabus.topics.find((item) => item.id === "topic-true");
  topic.update({pausable: false});
  topic.update({topicName: "Updated Fractions"});
  assert.equal(topic.pausable, false);
  await updateSyllabusRecord(syllabus, {topics: syllabus.topics});
  assert.equal(await isTopicPausable("syllabus-1", "topic-true"), false);
  topic.update({pausable: true});
  assert.equal(topic.pausable, true);
});

test("malformed boolean values are rejected instead of being coerced", async () => {
  for (const pausable of ["false", 0, 1, null]) {
    assert.throws(() => new SyllabusTopic({topicName: "Fractions", pausable}),
      /pausable must be a boolean/);
    await assert.rejects(() => createSyllabusRecord({
      ...syllabusData,
      topics: [{topicName: "Fractions", pausable}]
    }), /pausable must be a boolean/);
  }
  const topic = new SyllabusTopic({topicName: "Fractions", pausable: false});
  assert.throws(() => topic.update({pausable: "true"}), /pausable must be a boolean/);
  assert.equal(topic.pausable, false);
  assert.deepEqual(writes, []);
});
