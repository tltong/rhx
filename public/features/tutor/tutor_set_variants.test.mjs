import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {FirestoreTutorMiniQuestionSetRepository as WebRepository} from "./infrastructure/firestore_tutor_mini_question_set_repository.js";
import {tutorSetPath as webPath} from "./infrastructure/tutor_set_path.js";

const require = createRequire(import.meta.url);
const {FirestoreTutorMiniQuestionSetRepository: BackendRepository} = require(
  "../../../functions/features/tutor/infrastructure/firestore_tutor_mini_question_set_repository.js"
);
const {tutorSetPath: backendPath} = require("../../../functions/features/tutor/infrastructure/tutor_set_path.js");
const {tutorSetDocumentId} = require("../../../functions/features/tutor/infrastructure/tutor_set_document_id.js");
const reference = {questionId: "original-question", miniQuestionCount: 3, language: "English"};
const generatedAt = new Date("2026-10-14T00:00:00Z");
const configUpdatedAt = new Date("2026-10-13T00:00:00Z");

function record(changes = {}) {
  const selected = {...reference, ...changes};
  return {...selected, configUpdatedAt, generatedAt, miniQuestions: Array.from(
    {length: selected.miniQuestionCount}, (_, index) => ({
      sequence: index + 1, questionText: "Step " + (index + 1) + "?",
      expectedAnswer: "10", acceptedAnswers: ["ten"], answerExplanation: "Add the values.",
    }),
  )};
}
function path(input = reference) {
  const {collectionPath, documentId} = backendPath(input);
  return collectionPath + "/" + documentId;
}
function harness(Repository, options = {}) {
  const documents = new Map();
  const reads = [];
  const writes = [];
  const creates = [];
  const repository = new Repository({
    readDocument: async (collection, id) => {
      const key = collection + "/" + id;
      reads.push(key);
      return structuredClone(documents.get(key) ?? null);
    },
    writeDocument: async (collection, id, data, writeOptions) => {
      assert.equal(writeOptions.merge, false);
      const key = collection + "/" + id;
      writes.push(key);
      if (!options.omitSave) documents.set(key, structuredClone(data));
    },
    createDocumentIfAbsent: async (collection, id, data) => {
      const key = collection + "/" + id;
      creates.push(key);
      if (options.onCreate) await options.onCreate(documents, key);
      if (documents.has(key)) throw Object.assign(new Error("Already exists"), {code: "already-exists"});
      if (options.createError) throw options.createError;
      documents.set(key, structuredClone(data));
    },
    serverTimestamp: () => new Date("2026-10-15T00:00:00Z"),
  });
  return {repository, documents, reads, writes, creates};
}

for (const [layer, Repository] of [["backend", BackendRepository], ["web", WebRepository]]) {
  test(layer + ": count and language variants coexist and only the selected variant is replaced", async () => {
    const h = harness(Repository);
    for (const miniQuestionCount of [3, 6]) {
      for (const language of ["English", "Bahasa Melayu"]) {
        await h.repository.save(record({miniQuestionCount, language}));
      }
    }
    assert.equal(h.documents.size, 4);
    const before = new Map(structuredClone([...h.documents]));
    const replacement = record();
    replacement.miniQuestions[0].expectedAnswer = "20";
    await h.repository.save(replacement);
    assert.equal((await h.repository.get(reference)).miniQuestions[0].expectedAnswer, "20");
    for (const [key, saved] of before) {
      if (key !== path()) assert.deepEqual(h.documents.get(key), saved);
    }
    assert.equal(h.reads.at(-1), path());
    assert.equal(h.creates.length, 0);
  });

  test(layer + ": matching legacy sets are copied once with their timestamps and source retained", async () => {
    const h = harness(Repository);
    const legacyPath = "tutor/" + await tutorSetDocumentId(reference);
    const saved = record();
    h.documents.set(legacyPath, {...saved, studentId: "discard", questionText: "discard"});
    const migrated = await h.repository.get(reference);
    assert.deepEqual({...migrated}, saved);
    assert.deepEqual(h.documents.get(path()), saved);
    assert.equal(h.documents.has(legacyPath), true);
    assert.deepEqual(h.reads, [path(), legacyPath, path()]);
    assert.deepEqual(h.creates, [path()]);
    h.reads.length = 0;
    assert.deepEqual(await h.repository.get(reference), migrated);
    assert.deepEqual(h.reads, [path()]);
    assert.equal(h.creates.length, 1);
    assert.equal(h.writes.length, 0);
  });

  test(layer + ": legacy sets with another count are not copied into the requested variant", async () => {
    const h = harness(Repository);
    h.documents.set("tutor/" + await tutorSetDocumentId(reference), record({miniQuestionCount: 6}));
    assert.equal(await h.repository.get(reference), null);
    assert.equal(h.documents.has(path()), false);
    assert.deepEqual(h.creates, []);
  });

  test(layer + ": migration cannot overwrite a variant created by a concurrent request", async () => {
    const winner = record();
    winner.miniQuestions[0].expectedAnswer = "99";
    const h = harness(Repository, {onCreate: async (documents, key) => documents.set(key, winner)});
    h.documents.set("tutor/" + await tutorSetDocumentId(reference), record());
    assert.equal((await h.repository.get(reference)).miniQuestions[0].expectedAnswer, "99");
    assert.deepEqual(h.documents.get(path()), winner);
  });

  test(layer + ": access guards and migration failures propagate without a partial copy", async () => {
    const failure = new Error("Migration denied");
    const h = harness(Repository, {createError: failure});
    const legacyPath = "tutor/" + await tutorSetDocumentId(reference);
    h.documents.set(legacyPath, record());
    await assert.rejects(() => h.repository.get(reference, {
      beforeWrite: () => {throw new Error("Account changed");},
    }), /Account changed/);
    assert.deepEqual(h.creates, []);
    await assert.rejects(() => h.repository.get(reference), failure);
    assert.equal(h.documents.has(path()), false);
    assert.equal(h.documents.has(legacyPath), true);
  });

  test(layer + ": corrupt canonical data never falls back to a valid legacy set", async () => {
    const h = harness(Repository);
    h.documents.set("tutor/" + await tutorSetDocumentId(reference), record());
    h.documents.set(path(), record({miniQuestionCount: 6}));
    await assert.rejects(() => h.repository.get(reference), /question\/count\/language key/);
    assert.deepEqual(h.reads, [path()]);
    assert.deepEqual(h.creates, []);
  });

  test(layer + ": failed save reads cannot report an old legacy set as successful generation", async () => {
    const h = harness(Repository, {omitSave: true});
    h.documents.set("tutor/" + await tutorSetDocumentId(reference), record());
    await assert.rejects(() => h.repository.save(record()), /Saved tutor mini question set could not be read/);
    assert.deepEqual(h.reads, [path()]);
    assert.deepEqual(h.creates, []);
  });
}

test("backend and web paths preserve original IDs and encode language keys without collisions", () => {
  const keys = new Set();
  for (const language of ["English", "english", "Bahasa Melayu", "中文", "..", "a/b", "a%2Fb", "__reserved__", "a_b"]) {
    const input = {...reference, language};
    const selected = backendPath(input);
    assert.deepEqual(webPath(input), selected);
    assert.equal(selected.collectionPath, "tutor/original-question/counts/3/languages");
    assert.equal(decodeURIComponent(selected.documentId), language);
    assert.equal(selected.documentId.includes("/"), false);
    assert.equal(/^__.*__$/.test(selected.documentId), false);
    assert.equal(keys.has(selected.documentId), false);
    keys.add(selected.documentId);
  }
  for (const buildPath of [backendPath, webPath]) {
    for (const miniQuestionCount of [undefined, null, 0, -1, 1.2, "3", Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => buildPath({...reference, miniQuestionCount}), /miniQuestionCount/);
    }
    assert.throws(() => buildPath({...reference, language: "中".repeat(200)}), /Encoded language is too long/);
    assert.throws(() => buildPath({...reference, language: "\uD800"}), /valid Unicode/);
    assert.notEqual(path(reference), path({...reference, miniQuestionCount: 6}));
  }
});
