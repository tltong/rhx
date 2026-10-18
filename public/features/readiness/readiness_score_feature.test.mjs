import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./readiness_module.js";
import * as webSchema from "../../config/firebase/student_readiness_schema.js";
import {CalculateReadinessScore as WebCalculator} from "./application/calculate_readiness_score.js";

const require = createRequire(import.meta.url);
const backendSchema = require("../../../functions/schema/student_readiness_schema.js");
const {CalculateReadinessScore: BackendCalculator} = require("../../../functions/features/readiness/application/calculate_readiness_score.js");
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
const scope = {studentId: "student-1", syllabusId: "math", topicId: "fractions"};
const topicPath = "studentReadiness/student-1/syllabuses/math/topics/fractions";
const historyPath = topicPath + "/history";
const subjectPath = "studentReadiness/student-1/syllabuses/math";
const subjectHistoryPath = subjectPath + "/history";
const baseTime = new Date("2026-10-06T12:00:00Z");
const documents = new Map();
const reads = [];
const batches = [];
const queries = [];
const reliabilityWrites = [];
let sequence = 0;
let commitSequence = 0;
let readFailure = null;
let readFailurePath = null;
let commitFailure = null;
let afterCommit = null;
const auth = {currentUser: {uid: "student-1", email: "student@example.com"}};

function snapshot(path) {
  const data = documents.get(path);
  return {id: path.split("/").at(-1), exists: documents.has(path), data: () => data};
}

function reference(path) {
  return {
    path, id: path.split("/").at(-1),
    collection: name => collection(path + "/" + name),
    async get() {
      reads.push(path);
      if (readFailure && (!readFailurePath || readFailurePath === path)) throw readFailure;
      return snapshot(path);
    }
  };
}

function collection(path, ordering = null, filters = [], after = null, limit = Infinity) {
  return {
    doc(id = "entry-" + String(++sequence).padStart(4, "0")) {
      return reference(path + "/" + id);
    },
    orderBy(field, direction) {
      queries.push({path, field, direction});
      return collection(path, {field, direction}, filters, after, limit);
    },
    where: (field, operator, value) => collection(path, ordering, [...filters, [field, value]], after, limit),
    startAfter: id => collection(path, ordering, filters, id, limit),
    limit: value => collection(path, ordering, filters, after, value),
    async get() {
      reads.push(path);
      if (readFailure && (!readFailurePath || readFailurePath === path)) throw readFailure;
      let paths = [...documents.keys()].filter((key) => (
        key.startsWith(path + "/") && key.slice(path.length + 1).split("/").length === 1
      ));
      paths = paths.filter(key => filters.every(([field, value]) => documents.get(key)[field] === value));
      if (ordering && (ordering.field === "__name__" || typeof ordering.field !== "string")) paths.sort();
      else if (ordering) {
        paths = paths.sort((first, second) => {
          const a = documents.get(first)[ordering.field];
          const b = documents.get(second)[ordering.field];
          const difference = a.toDate().getTime() - b.toDate().getTime()
            || (a.nanoseconds || 0) - (b.nanoseconds || 0);
          return ordering.direction === "desc" ? -difference : difference;
        });
      }
      if (after) paths = paths.filter(key => key.split("/").at(-1) > after);
      paths = paths.slice(0, limit);
      return {docs: paths.map(snapshot)};
    }
  };
}

const db = {
  collection,
  doc: reference,
  async runTransaction(operation) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const observed = [];
      const writes = this.batch();
      let hasWrites = false;
      const result = await operation({
        async get(ref) {
          const result = await ref.get();
          observed.push([ref.path, result.data()]);
          return result;
        },
        set(ref, data, options) {
          hasWrites = true;
          writes.set(ref, data, options);
        }
      });
      if (observed.some(([path, data]) => documents.get(path) !== data)) continue;
      if (hasWrites) await writes.commit();
      return result;
    }
    throw new Error("Transaction conflict");
  },
  batch() {
    const writes = [];
    return {
      set(ref, data, options) { writes.push({path: ref.path, data, options}); },
      async commit() {
        if (commitFailure) throw commitFailure;
        const committedAt = new Date(baseTime.getTime() + (++commitSequence * 1000));
        // Model Firestore's atomic commit and server timestamp resolution.
        const next = new Map(documents);
        for (const {path, data, options} of writes) {
          const resolved = Object.fromEntries(Object.entries(data).map(([key, value]) => [
            key, key === "updatedAt" || key === "savedAt" ? {toDate: () => committedAt} : value
          ]));
          next.set(path, options?.merge ? {...next.get(path), ...resolved} : resolved);
        }
        documents.clear();
        for (const [path, data] of next) documents.set(path, data);
        batches.push(writes);
        await afterCommit?.();
      }
    };
  }
};
const firestore = () => db;
firestore.FieldPath = {documentId: () => "__name__"};
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {
  firestore: () => db,
  auth: () => auth,
  functions() { throw new Error("Score APIs must not invoke Firebase callables."); }
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};

backendOps.getDocumentRef = (path, id) => reference(path + "/" + id);
backendOps.getCollectionRef = collection;
backendOps.getFirestoreDb = () => db;
backendOps.readDocument = async (path, id) => {
  const result = await reference(path + "/" + id).get();
  return result.exists ? {...result.data(), id: result.id} : null;
};
backendOps.readCollection = async (path, buildQuery) => {
  const ref = collection(path);
  const result = await (buildQuery ? buildQuery(ref) : ref).get();
  return result.docs.map((doc) => ({...doc.data(), id: doc.id}));
};
backendOps.readCollectionIds = async (path) => (await collection(path).get()).docs.map((doc) => doc.id);
backendOps.writeDocument = async (path, id, data, options) => {
  const documentPath = path + "/" + id;
  assert.ok(documentPath.startsWith("reliability/"), "This fixture only supports reliability document writes.");
  const resolved = {...data, updatedAt: {toDate: () => new Date(baseTime.getTime() + reliabilityWrites.length * 1000)}};
  documents.set(documentPath, options?.merge ? {...documents.get(documentPath), ...resolved} : resolved);
  reliabilityWrites.push({path: documentPath, data, options});
  return {path: documentPath, id};
};
const backend = require("../../../functions/features/readiness/readiness_module.js");

function seedConfig(changes = {}) {
  documents.set("readinessConfigs/default", {
    difficultyWeights: {easy: 0.75, medium: 1, hard: 1.75},
    numberOfPractices: 5, preAssessmentWeight: 1,
    updatedAt: {toDate: () => baseTime}, updatedBy: "admin-1",
    ...changes
  });
}

function seedSyllabus(syllabusId = "math", topicIds = ["fractions", "algebra"]) {
  documents.set("syllabuses/" + syllabusId, {
    country: "Malaysia", level: "Primary", year: 1, subject: syllabusId,
    languages: ["English"], active: true
  });
  for (const topicId of topicIds) {
    documents.set("syllabuses/" + syllabusId + "/topics/" + topicId, {topicName: topicId});
  }
}

function seedTopicScore(topicId, score, {studentId = "student-1", syllabusId = "math"} = {}) {
  documents.set("studentReadiness/" + studentId + "/syllabuses/" + syllabusId + "/topics/" + topicId, {
    score, updatedAt: {toDate: () => baseTime}
  });
}

function seedEssay(id, {score = 80, difficulty = "medium", minute = 1, graded = true,
  studentId = scope.studentId, syllabusId = scope.syllabusId, topicId = scope.topicId, resultAnswer = "My essay."} = {}) {
  const questionId = "essay-question-" + id, date = new Date(baseTime.getTime() + minute * 60000);
  documents.set("studentEssayPractices/" + studentId + "/completedEssayPractices/" + id, {
    essayQuestionId: questionId, syllabusId, topicId, assignedAt: baseTime, completedAt: date,
    essayText: "My essay.", timeTakenSeconds: 60,
  });
  const path = "essayQuestionGenerator/primary/standards/3/languages/English/questions/" + questionId;
  documents.set("essayQuestionGenerator/questionIndex/entries/" + questionId, {documentPath: path});
  documents.set(path, {questionText: "Write an essay.", difficulty, seedUsed: "Friendship", generatedAt: date});
  if (graded) documents.set("essayResults/" + studentId + "/questions/" + questionId, {
    answer: resultAnswer, score, reviewComment: "Your ideas are clear. Add examples.", corrections: [], scoredAt: date,
  });
}

function seedPractice(id, {
  studentId = scope.studentId, syllabusId = scope.syllabusId, topicId = scope.topicId,
  difficulty = "Medium", type = "assessment", score = 80, minute = 1,
  totalQuestions = 10, questionsCorrect = score / 10
} = {}) {
  const date = new Date(baseTime.getTime() + minute * 60000);
  const answers = {};
  const questions = [];
  for (let index = 0; index < totalQuestions; index++) {
    const questionId = id + "-q" + index;
    questions.push({syllabusId, topicId, questionId,
      ...(type === "assessment" ? {language: "English", hasDiagram: false} : {})
    });
    answers[questionId] = {
      selectedOption: index < questionsCorrect ? "a" : "b",
      correctAnswer: "a", isCorrect: index < questionsCorrect
    };
    if (type === "assessment") {
      documents.set("questions/" + syllabusId + "/topics/" + topicId
        + "/languages/english/diagramGroups/withoutDiagram/questionItems/" + questionId, {
        syllabusId, topicId, questionText: "Example question", options: {a: "A", b: "B", c: "C", d: "D"},
        correctAnswer: "a", group: "assessment", language: "English", hasDiagram: false, difficulty
      });
    }
  }
  documents.set("practices/" + id, {type, dateGenerated: {toDate: () => date}, questions});
  documents.set("studentPractices/" + studentId + "/completedPractices/" + id, {
    score, questionsCorrect, totalQuestions, dateCompleted: {toDate: () => date},
    timeTakenSeconds: 60, studentAnswers: answers
  });
}

beforeEach(() => {
  documents.clear(); reads.length = 0; batches.length = 0; queries.length = 0;
  reliabilityWrites.length = 0;
  sequence = 0; commitSequence = 0;
  readFailure = null; readFailurePath = null; commitFailure = null; afterCommit = null;
  auth.currentUser = {uid: "student-1", email: "student@example.com"};
  seedConfig();
});
after(() => {
  Object.assign(backendOps, originalBackendOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

test("score schemas match in backend and web and keep latest and history records separate", () => {
  assert.deepEqual(webSchema.studentReadinessSchema, backendSchema.studentReadinessSchema);
  const topic = webSchema.studentReadinessSchema.subcollections.syllabuses.subcollections.topics;
  assert.deepEqual(topic.fields, {score: {type: "number", minimum: 0}, updatedAt: "timestamp"});
  assert.deepEqual(topic.subcollections.history.fields, {
    score: {type: "number", minimum: 0}, savedAt: "timestamp",
    practiceId: {type: "string", optional: true, references: "practices/{practiceId} or studentEssayPractices/{studentId}/completedEssayPractices/{practiceId}"},
    practiceType: {type: "string", enum: ["normal", "essay"], optional: true},
  });
  const subject = webSchema.studentReadinessSchema.subcollections.syllabuses;
  assert.deepEqual(subject.fields, topic.fields);
  assert.deepEqual(subject.subcollections.history.fields, topic.subcollections.history.fields);
  assert.equal(subject.subcollections.history.documentId, "[auto_generated_id_or_practice_key]");
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": readiness averages the latest graded normal and essay practices using configured difficulty weights", async () => {
    seedConfig({numberOfPractices: 2});
    seedPractice("normal", {score: 40, difficulty: "Easy", minute: 1});
    seedEssay("older", {score: 80, minute: 2});
    seedEssay("latest", {score: 60, difficulty: "hard", minute: 3});
    seedEssay("wrong-answer", {score: 100, minute: 4, resultAnswer: "A different submission."});
    seedEssay("pending", {minute: 5, graded: false});
    seedEssay("other-topic", {topicId: "algebra", minute: 6});
    seedEssay("other-student", {studentId: "another", minute: 7});
    assert.equal(await api.calculateReadinessScore(scope), (60 * 1.75 + 80) / 2);
    assert.deepEqual(batches, []);
  });

  test(layer + ": essay readiness reads every page and keeps zero scores", async () => {
    seedConfig({numberOfPractices: 2});
    for (let index = 0; index < 105; index++) seedEssay("attempt-" + String(index).padStart(3, "0"), {
      score: index === 104 ? 0 : 80, minute: index,
    });
    assert.equal(await api.calculateReadinessScore(scope), 40);
    assert.equal(reads.filter(path => path === "studentEssayPractices/student-1/completedEssayPractices").length, 2);
  });

  test(layer + ": essays use difficulty weights for the first essay as well as subsequent essays", async () => {
    seedConfig({numberOfPractices: 5, preAssessmentWeight: 9, difficultyWeights: {easy: 0.75, medium: 1.25, hard: 1.75}});
    seedEssay("first", {score: 80});
    assert.equal(await api.calculateReadinessScore(scope), 100);
  });

  test(layer + ": normal and essay readiness histories with the same practice ID are independent and retry-safe", async () => {
    for (const save of [api.saveReadinessScore, api.saveSubjectReadinessScore]) {
      await save({...scope, score: 40, practiceId: "shared"});
      await save({...scope, score: 80, practiceId: "shared", practiceType: "essay"});
      await save({...scope, score: 0, practiceId: "shared", practiceType: "essay"});
    }
    for (const read of [api.getReadinessScoreHistory, api.getSubjectReadinessScoreHistory]) {
      const history = await read(scope);
      assert.equal(history.length, 2);
      assert.deepEqual(history.map(entry => [entry.id, entry.score, entry.practiceType]), [
        ["essay-shared", 80, "essay"], ["practice-shared", 40, undefined],
      ]);
    }
    assert.equal((await api.getReadinessScore(scope)).score, 80);
    assert.equal((await api.getSubjectReadinessScore(scope)).score, 80);
    for (const save of [api.saveReadinessScore, api.saveSubjectReadinessScore]) {
      await assert.rejects(() => save({...scope, score: 80, practiceId: "id", practiceType: "invalid"}), /practiceType/);
      await assert.rejects(() => save({...scope, score: 80, practiceType: "essay"}), /practiceId/);
    }
  });

  test(layer + ": subject saves atomically retain all history entries including zero and unchanged scores", async () => {
    assert.equal(await api.getSubjectReadinessScore(scope), null);
    assert.deepEqual(await api.getSubjectReadinessScoreHistory(scope), []);
    documents.delete("readinessConfigs/default");
    documents.set(subjectPath, {metadata: "preserved"});
    const first = await api.saveSubjectReadinessScore({...scope, score: 140, updatedAt: "spoofed", savedAt: "spoofed"});
    assert.equal(first.score, 140);
    assert.equal(first.updatedAt.getTime(), baseTime.getTime() + 1000);
    for (const score of [0, 0]) await api.saveSubjectReadinessScore({...scope, score});
    assert.equal((await api.getSubjectReadinessScore(scope)).score, 0);
    assert.equal(documents.get(subjectPath).metadata, "preserved");
    const history = await api.getSubjectReadinessScoreHistory(scope);
    assert.deepEqual(history.map(({score}) => score), [0, 0, 140]);
    assert.equal(new Set(history.map(({id}) => id)).size, 3);
    assert.ok(history.every(({savedAt}) => savedAt instanceof Date));
    assert.equal(batches.length, 3);
    for (const writes of batches) {
      assert.equal(writes.length, 2);
      assert.equal(writes[0].path, subjectPath);
      assert.deepEqual(writes[0].options, {merge: true});
      assert.ok(writes[1].path.startsWith(subjectHistoryPath + "/"));
      assert.deepEqual(Object.keys(writes[1].data).sort(), ["savedAt", "score"]);
      assert.strictEqual(writes[0].data.updatedAt, writes[1].data.savedAt);
    }
    assert.ok(queries.some(({path, field, direction}) => (
      path === subjectHistoryPath && field === "savedAt" && direction === "desc"
    )));
    assert.ok(!reads.some((path) => path.startsWith("syllabuses/") || path === "readinessConfigs/default"));
  });

  test(layer + ": subject records are isolated by student and syllabus and separate from topic scores", async () => {
    await api.saveReadinessScore({...scope, score: 75, practiceId: "same-completion"});
    await api.saveSubjectReadinessScore({...scope, score: 90, practiceId: "same-completion"});
    for (const variant of [{...scope, studentId: "student-2"}, {...scope, syllabusId: "science"}]) {
      assert.equal(await api.getSubjectReadinessScore(variant), null);
      assert.deepEqual(await api.getSubjectReadinessScoreHistory(variant), []);
      await api.saveSubjectReadinessScore({...variant, score: 20, practiceId: "same-completion"});
    }
    assert.equal((await api.getSubjectReadinessScore(scope)).score, 90);
    assert.deepEqual((await api.getSubjectReadinessScoreHistory(scope)).map(({score}) => score), [90]);
    assert.equal((await api.getReadinessScore(scope)).score, 75);
    assert.deepEqual((await api.getReadinessScoreHistory(scope)).map(({score}) => score), [75]);
  });

  test(layer + ": repeated subject completion saves preserve the original result and newer latest score", async () => {
    const first = await api.saveSubjectReadinessScore({...scope, score: 50, practiceId: "completion-1"});
    const newer = await api.saveSubjectReadinessScore({...scope, score: 90, practiceId: "completion-2"});
    const repeated = await api.saveSubjectReadinessScore({...scope, score: 100, practiceId: "completion-1"});
    assert.deepEqual({...repeated}, {...first});
    assert.deepEqual({...await api.getSubjectReadinessScore(scope)}, {...newer});
    const history = await api.getSubjectReadinessScoreHistory(scope);
    assert.deepEqual(history.map(({score, practiceId}) => ({score, practiceId})), [
      {score: 90, practiceId: "completion-2"}, {score: 50, practiceId: "completion-1"}
    ]);
    assert.equal(history[1].id, "practice-completion-1");
    assert.equal(batches.length, 2);
  });

  test(layer + ": concurrent subject saves for the same completion create one history entry", async () => {
    const [first, repeated] = await Promise.all([
      api.saveSubjectReadinessScore({...scope, score: 40, practiceId: "completion-1"}),
      api.saveSubjectReadinessScore({...scope, score: 90, practiceId: "completion-1"})
    ]);
    assert.deepEqual({...repeated}, {...first});
    assert.deepEqual({...await api.getSubjectReadinessScore(scope)}, {...first});
    assert.equal((await api.getSubjectReadinessScoreHistory(scope)).length, 1);
    assert.equal(batches.length, 1);
  });

  test(layer + ": failed subject batch and transaction saves preserve latest score and history", async () => {
    await api.saveSubjectReadinessScore({...scope, score: 50});
    const before = [...documents.entries()];
    commitFailure = new Error("commit failed");
    await assert.rejects(() => api.saveSubjectReadinessScore({...scope, score: 80}), /commit failed/);
    await assert.rejects(() => api.saveSubjectReadinessScore({...scope, score: 80, practiceId: "failed"}), /commit failed/);
    assert.deepEqual([...documents.entries()], before);
    assert.equal((await api.getSubjectReadinessScore(scope)).score, 50);
    assert.deepEqual((await api.getSubjectReadinessScoreHistory(scope)).map(({score}) => score), [50]);
    readFailure = new Error("read failed");
    await assert.rejects(() => api.getSubjectReadinessScore(scope), /read failed/);
    await assert.rejects(() => api.getSubjectReadinessScoreHistory(scope), /read failed/);
  });

  test(layer + ": subject storage validates identifiers, scores and source practice IDs before database access", async () => {
    for (const key of ["studentId", "syllabusId"]) {
      for (const value of [undefined, null, 42, "", " ", "injected/path", ".", ".."]) {
        const invalid = {...scope, [key]: value};
        for (const call of [
          () => api.saveSubjectReadinessScore({...invalid, score: 50}),
          () => api.getSubjectReadinessScore(invalid),
          () => api.getSubjectReadinessScoreHistory(invalid)
        ]) await assert.rejects(call, new RegExp(key));
      }
    }
    for (const score of [undefined, null, "50", true, -1, NaN, Infinity, -Infinity]) {
      await assert.rejects(() => api.saveSubjectReadinessScore({...scope, score}), /finite, non-negative/);
    }
    for (const practiceId of ["", " ", 42, "injected/path", ".", ".."]) {
      await assert.rejects(() => api.saveSubjectReadinessScore({...scope, score: 50, practiceId}), /practiceId/);
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(batches, []);
    await api.saveSubjectReadinessScore({studentId: " student-1 ", syllabusId: " math ", score: 50, practiceId: " source "});
    assert.equal((await api.getSubjectReadinessScore(scope)).score, 50);
    assert.equal((await api.getSubjectReadinessScoreHistory(scope))[0].practiceId, "source");
  });

  test(layer + ": subject reads reject malformed scores and preserve timestamp ordering in history", async () => {
    documents.set(subjectPath, {score: "50", updatedAt: baseTime});
    await assert.rejects(() => api.getSubjectReadinessScore(scope), /finite, non-negative/);
    documents.set(subjectPath, {score: 50, updatedAt: "invalid"});
    await assert.rejects(() => api.getSubjectReadinessScore(scope), /valid timestamp/);
    documents.set(subjectHistoryPath + "/a-older", {score: 10, savedAt: {toDate: () => baseTime, nanoseconds: 100}});
    documents.set(subjectHistoryPath + "/z-newer", {score: 20, savedAt: {toDate: () => baseTime, nanoseconds: 200}});
    assert.deepEqual((await api.getSubjectReadinessScoreHistory(scope)).map(({score}) => score), [20, 10]);
    documents.get(subjectHistoryPath + "/z-newer").score = -1;
    await assert.rejects(() => api.getSubjectReadinessScoreHistory(scope), /finite, non-negative/);
    assert.deepEqual(batches, []);
  });

  test(layer + ": a subject save returns its own result even when a newer save follows immediately", async () => {
    afterCommit = async () => {
      afterCommit = null;
      await api.saveSubjectReadinessScore({...scope, score: 90});
    };
    const first = await api.saveSubjectReadinessScore({...scope, score: 30});
    assert.equal(first.score, 30);
    assert.equal(first.updatedAt.getTime(), baseTime.getTime() + 1000);
    assert.equal((await api.getSubjectReadinessScore(scope)).score, 90);
    assert.deepEqual((await api.getSubjectReadinessScoreHistory(scope)).map(({score}) => score), [90, 30]);
  });

  test(layer + ": subject readiness equally averages current topics' latest scores without writes or rounding", async () => {
    seedSyllabus("math", ["fractions", "algebra", "geometry", "unscored"]);
    await api.saveReadinessScore({...scope, score: 180});
    await api.saveReadinessScore({...scope, score: 0});
    seedTopicScore("algebra", 140);
    seedTopicScore("geometry", 80);
    seedTopicScore("removed-topic", 1000);
    seedTopicScore("fractions", 1000, {studentId: "student-2"});
    seedTopicScore("fractions", 1000, {syllabusId: "science"});
    documents.delete("readinessConfigs/default");
    reads.length = 0;
    batches.length = 0;
    const before = [...documents.entries()];

    assert.equal(await api.calculateSubjectReadinessScore({studentId: "student-1", syllabusId: "math"}),
      (0 + 140 + 80) / 3);
    assert.deepEqual([...documents.entries()], before);
    assert.deepEqual(batches, []);
    assert.deepEqual([...reads].sort(), [
      "syllabuses/math", "syllabuses/math/topics",
      ...["fractions", "algebra", "geometry", "unscored"].map((topicId) => (
        "studentReadiness/student-1/syllabuses/math/topics/" + topicId
      ))
    ].sort());
  });

  test(layer + ": subject readiness distinguishes empty or unscored topics from a zero score", async () => {
    seedSyllabus("math", []);
    assert.equal(await api.calculateSubjectReadinessScore(scope), null);
    seedSyllabus("math", ["fractions", "algebra"]);
    assert.equal(await api.calculateSubjectReadinessScore(scope), null);
    // History alone is not a current saved score.
    documents.set(historyPath + "/old", {score: 100, savedAt: {toDate: () => baseTime}});
    assert.equal(await api.calculateSubjectReadinessScore(scope), null);
    seedTopicScore("fractions", 0);
    assert.equal(await api.calculateSubjectReadinessScore(scope), 0);
    assert.deepEqual(batches, []);
  });

  test(layer + ": subject readiness rereads scores and syllabus membership and permits results above 100", async () => {
    seedSyllabus("math", ["fractions"]);
    seedTopicScore("fractions", 80);
    assert.equal(await api.calculateSubjectReadinessScore(scope), 80);
    seedTopicScore("fractions", 175);
    assert.equal(await api.calculateSubjectReadinessScore(scope), 175);
    seedSyllabus("math", ["algebra"]);
    seedTopicScore("algebra", 125);
    assert.equal(await api.calculateSubjectReadinessScore(scope), 150);
    documents.delete("syllabuses/math/topics/fractions");
    assert.equal(await api.calculateSubjectReadinessScore(scope), 125);
    assert.deepEqual(batches, []);
  });

  test(layer + ": subject readiness is scoped by student and syllabus and trims identifiers", async () => {
    seedSyllabus();
    seedSyllabus("science");
    seedTopicScore("fractions", 60);
    seedTopicScore("algebra", 100);
    seedTopicScore("fractions", 20, {studentId: "student-2"});
    seedTopicScore("fractions", 40, {syllabusId: "science"});
    seedTopicScore("algebra", 10, {syllabusId: "science"});
    assert.equal(await api.calculateSubjectReadinessScore({studentId: " student-1 ", syllabusId: " math "}), 80);
    assert.equal(await api.calculateSubjectReadinessScore({studentId: "student-2", syllabusId: "math"}), 20);
    assert.equal(await api.calculateSubjectReadinessScore({studentId: "student-1", syllabusId: "science"}), 25);
    assert.deepEqual(batches, []);
  });

  test(layer + ": subject readiness validates both identifiers before database access", async () => {
    for (const key of ["studentId", "syllabusId"]) {
      for (const value of [undefined, "", " ", null, 42, "injected/path", ".", ".."]) {
        await assert.rejects(() => api.calculateSubjectReadinessScore({...scope, [key]: value}), new RegExp(key));
      }
    }
    for (const input of [undefined, null]) {
      await assert.rejects(() => api.calculateSubjectReadinessScore(input), /studentId/);
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(batches, []);
  });

  test(layer + ": subject readiness rejects missing syllabuses, failed reads and malformed saved scores", async () => {
    await assert.rejects(() => api.calculateSubjectReadinessScore(scope), (error) => error.code === "not-found");
    assert.deepEqual(reads, ["syllabuses/math"]);
    seedSyllabus();
    seedTopicScore("fractions", 80);
    readFailure = new Error("read failed");
    await assert.rejects(() => api.calculateSubjectReadinessScore(scope), /read failed/);
    readFailurePath = "studentReadiness/student-1/syllabuses/math/topics/algebra";
    await assert.rejects(() => api.calculateSubjectReadinessScore(scope), /read failed/);
    readFailure = null;
    seedTopicScore("algebra", "50");
    await assert.rejects(() => api.calculateSubjectReadinessScore(scope), /finite, non-negative/);
    seedTopicScore("algebra", 50);
    documents.get("studentReadiness/student-1/syllabuses/math/topics/algebra").updatedAt = "invalid";
    await assert.rejects(() => api.calculateSubjectReadinessScore(scope), /valid timestamp/);
    assert.deepEqual(batches, []);
  });

  test(layer + ": calculates the latest N practices of one topic with all four weights and no writes", async () => {
    seedConfig({numberOfPractices: 4, preAssessmentWeight: 2});
    seedPractice("old", {score: 10, difficulty: "Extreme", minute: 1});
    seedPractice("hard", {score: 60, difficulty: "HARD", minute: 6});
    seedPractice("medium", {score: 70, minute: 7});
    seedPractice("easy", {score: 80, difficulty: " Easy ", minute: 8});
    seedPractice("pre", {score: 90, type: "pre assessment", minute: 9});
    seedPractice("other-subject", {syllabusId: "science", minute: 10});
    seedPractice("other-topic", {topicId: "algebra", minute: 11});
    seedPractice("other-student", {studentId: "student-2", score: 100, minute: 12});
    const before = [...documents.entries()];
    assert.equal(await api.calculateReadinessScore(scope), 103.75);
    assert.deepEqual([...documents.entries()], before);
    assert.equal(reads.filter((path) => path === "readinessConfigs/default").length, 1);
    assert.ok(!reads.some((path) => path.startsWith("questions/") && path.endsWith("/old-q0")));
    assert.ok(!reads.some((path) => path.endsWith("/pre-q0")));
    assert.deepEqual(batches, []);
  });

  test(layer + ": rereads configurable practice counts and weights for each calculation", async () => {
    seedPractice("hard", {score: 60, difficulty: "Hard", minute: 6});
    seedPractice("medium", {score: 70, minute: 7});
    seedPractice("easy", {score: 80, difficulty: "Easy", minute: 8});
    seedPractice("pre", {score: 90, type: "pre assessment", minute: 9});
    seedConfig({numberOfPractices: 1, preAssessmentWeight: 2});
    assert.equal(await api.calculateReadinessScore(scope), 180);
    seedConfig({numberOfPractices: 2, preAssessmentWeight: 2});
    assert.equal(await api.calculateReadinessScore(scope), 120);
    seedConfig({numberOfPractices: 4, preAssessmentWeight: 0.5,
      difficultyWeights: {easy: 2, medium: 3, hard: 4}});
    assert.equal(await api.calculateReadinessScore(scope), 163.75);
  });

  test(layer + ": uses available practices, keeps zero distinct from no practices, and requires config", async () => {
    assert.equal(await api.calculateReadinessScore(scope), null);
    seedPractice("another-topic", {topicId: "algebra"});
    assert.equal(await api.calculateReadinessScore(scope), null);
    seedPractice("one", {score: 80, difficulty: "Easy"});
    assert.equal(await api.calculateReadinessScore(scope), 60);
    seedPractice("zero", {score: 0, minute: 2});
    seedConfig({numberOfPractices: 1});
    assert.equal(await api.calculateReadinessScore(scope), 0);
    documents.delete("readinessConfigs/default");
    await assert.rejects(() => api.calculateReadinessScore(scope), (error) => error.code === "failed-precondition");
    assert.deepEqual(batches, []);
  });

  test(layer + ": uses the completion percentage derived from correct and total answers", async () => {
    seedPractice("third", {score: 33.33, totalQuestions: 3, questionsCorrect: 1});
    assert.equal(await api.calculateReadinessScore(scope), 33.33);
    documents.get("studentPractices/student-1/completedPractices/third").score = 99;
    await assert.rejects(() => api.calculateReadinessScore(scope), /score must equal 33.33/);
  });

  test(layer + ": missing practice definitions and mixed-topic practices cannot contaminate the score", async () => {
    seedPractice("valid", {score: 80, minute: 1});
    seedPractice("deleted", {score: 100, minute: 3});
    documents.delete("practices/deleted");
    seedPractice("mixed", {score: 100, minute: 2});
    documents.get("practices/mixed").questions[1].topicId = "algebra";
    assert.equal(await api.calculateReadinessScore(scope), 80);
  });

  test(layer + ": invalid difficulty and missing selected questions fail without writing scores", async () => {
    seedPractice("extreme", {difficulty: "Extreme"});
    await assert.rejects(() => api.calculateReadinessScore(scope), /difficultyLevel/);
    documents.get("questions/math/topics/fractions/languages/english/diagramGroups/withoutDiagram/questionItems/extreme-q0").difficulty = "Easy";
    documents.delete("questions/math/topics/fractions/languages/english/diagramGroups/withoutDiagram/questionItems/extreme-q0");
    await assert.rejects(() => api.calculateReadinessScore(scope), /was not found/);
    assert.deepEqual(batches, []);
  });

  test(layer + ": saves the latest score and retains every history entry using one atomic batch", async () => {
    assert.equal(await api.getReadinessScore(scope), null);
    assert.deepEqual(await api.getReadinessScoreHistory(scope), []);
    documents.delete("readinessConfigs/default"); // Saving supplied scores does not require config or calculation.
    const first = await api.saveReadinessScore({...scope, score: 140, updatedAt: "spoofed", savedAt: "spoofed"});
    assert.equal(first.score, 140);
    assert.equal(first.updatedAt.getTime(), baseTime.getTime() + 1000);
    for (const score of [0, 0]) await api.saveReadinessScore({...scope, score});
    const latest = await api.getReadinessScore(scope);
    assert.equal(latest.score, 0);
    assert.equal(latest.updatedAt.getTime(), baseTime.getTime() + 3000);
    const history = await api.getReadinessScoreHistory(scope);
    assert.deepEqual(history.map(({score}) => score), [0, 0, 140]);
    assert.equal(new Set(history.map(({id}) => id)).size, 3);
    assert.ok(history.every(({savedAt}) => savedAt instanceof Date));
    assert.equal(batches.length, 3);
    for (const writes of batches) {
      assert.equal(writes.length, 2);
      assert.equal(writes[0].path, topicPath);
      assert.deepEqual(writes[0].options, {merge: true});
      assert.ok(writes[1].path.startsWith(historyPath + "/"));
      assert.deepEqual(Object.keys(writes[1].data).sort(), ["savedAt", "score"]);
      assert.strictEqual(writes[0].data.updatedAt, writes[1].data.savedAt);
    }
    assert.ok(queries.some(({path, field, direction}) => (
      path === historyPath && field === "savedAt" && direction === "desc"
    )));
    assert.ok(!reads.some((path) => path === "readinessConfigs/default" || path.startsWith("practices/")));
  });

  test(layer + ": latest scores and history are isolated by student, syllabus and topic", async () => {
    await api.saveReadinessScore({...scope, score: 75});
    for (const variant of [
      {...scope, studentId: "student-2"},
      {...scope, syllabusId: "science"},
      {...scope, topicId: "algebra"}
    ]) {
      assert.equal(await api.getReadinessScore(variant), null);
      assert.deepEqual(await api.getReadinessScoreHistory(variant), []);
      await api.saveReadinessScore({...variant, score: 20});
    }
    assert.equal((await api.getReadinessScore(scope)).score, 75);
    assert.deepEqual((await api.getReadinessScoreHistory(scope)).map(({score}) => score), [75]);
  });

  test(layer + ": history retains timestamp ordering within the same millisecond", async () => {
    documents.set(historyPath + "/a-older", {score: 10, savedAt: {toDate: () => baseTime, nanoseconds: 100}});
    documents.set(historyPath + "/z-newer", {score: 20, savedAt: {toDate: () => baseTime, nanoseconds: 200}});
    assert.deepEqual((await api.getReadinessScoreHistory(scope)).map(({score}) => score), [20, 10]);
  });

  test(layer + ": malformed stored scores or timestamps fail without inventing a score", async () => {
    documents.set(topicPath, {score: "50", updatedAt: baseTime});
    await assert.rejects(() => api.getReadinessScore(scope), /finite, non-negative/);
    documents.set(topicPath, {score: 50, updatedAt: "invalid"});
    await assert.rejects(() => api.getReadinessScore(scope), /valid timestamp/);
    documents.set(historyPath + "/bad", {score: -1, savedAt: {toDate: () => baseTime}});
    await assert.rejects(() => api.getReadinessScoreHistory(scope), /finite, non-negative/);
    assert.deepEqual(batches, []);
  });

  test(layer + ": validates identifiers and scores before any database access", async () => {
    for (const key of ["studentId", "syllabusId", "topicId"]) {
      for (const value of [undefined, "", " ", null, 42, "injected/path", ".", ".."]) {
        const invalid = {...scope, [key]: value};
        for (const call of [
          () => api.calculateReadinessScore(invalid),
          () => api.saveReadinessScore({...invalid, score: 50}),
          () => api.getReadinessScore(invalid),
          () => api.getReadinessScoreHistory(invalid)
        ]) await assert.rejects(call, new RegExp(key));
      }
    }
    for (const score of [undefined, null, "50", true, -1, NaN, Infinity, -Infinity]) {
      await assert.rejects(() => api.saveReadinessScore({...scope, score}), /finite, non-negative/);
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(batches, []);
    await api.saveReadinessScore({studentId: " student-1 ", syllabusId: " math ", topicId: " fractions ", score: 50});
    assert.equal((await api.getReadinessScore(scope)).score, 50);
  });

  test(layer + ": failed commits retain both the current score and its previous history", async () => {
    await api.saveReadinessScore({...scope, score: 50});
    const before = [...documents.entries()];
    commitFailure = new Error("commit failed");
    await assert.rejects(() => api.saveReadinessScore({...scope, score: 100}), /commit failed/);
    assert.deepEqual([...documents.entries()], before);
    assert.equal((await api.getReadinessScore(scope)).score, 50);
    assert.deepEqual((await api.getReadinessScoreHistory(scope)).map(({score}) => score), [50]);
    readFailure = new Error("read failed");
    await assert.rejects(() => api.getReadinessScore(scope), /read failed/);
    await assert.rejects(() => api.getReadinessScoreHistory(scope), /read failed/);
    await assert.rejects(() => api.calculateReadinessScore(scope), /read failed/);
  });


  test(layer + ": saves one history entry per practice and retries preserve newer scores", async () => {
    const first = await api.saveReadinessScore({...scope, score: 50, practiceId: "completion-1"});
    const repeated = await api.saveReadinessScore({...scope, score: 100, practiceId: "completion-1"});
    assert.deepEqual({...repeated}, {...first});
    assert.equal((await api.getReadinessScore(scope)).score, 50);
    assert.equal(batches.length, 1);
    let history = await api.getReadinessScoreHistory(scope);
    assert.deepEqual(history.map(({score, practiceId}) => ({score, practiceId})), [
      {score: 50, practiceId: "completion-1"}
    ]);
    await api.saveReadinessScore({...scope, score: 80, practiceId: "completion-2"});
    const latest = await api.getReadinessScore(scope);
    await api.saveReadinessScore({...scope, score: 0, practiceId: "completion-1"});
    assert.deepEqual({...await api.getReadinessScore(scope)}, {...latest});
    await api.saveReadinessScore({...scope, score: 90});
    history = await api.getReadinessScoreHistory(scope);
    assert.deepEqual(history.map(({score}) => score), [90, 80, 50]);
    assert.equal(history[0].practiceId, undefined);
    assert.equal(batches.length, 3);
  });

  test(layer + ": concurrent saves for the same completion return the single committed score", async () => {
    const results = await Promise.all([
      api.saveReadinessScore({...scope, score: 50, practiceId: "concurrent"}),
      api.saveReadinessScore({...scope, score: 80, practiceId: "concurrent"})
    ]);
    assert.deepEqual({...results[0]}, {...results[1]});
    const history = await api.getReadinessScoreHistory(scope);
    assert.equal(history.length, 1);
    assert.equal(history[0].practiceId, "concurrent");
    assert.equal((await api.getReadinessScore(scope)).score, history[0].score);
    assert.equal(batches.length, 1);
  });

  test(layer + ": invalid source IDs and failed completion transactions leave history unchanged", async () => {
    for (const practiceId of ["", " ", "nested/path", ".", "..", 42, {}, true]) {
      await assert.rejects(() => api.saveReadinessScore({...scope, score: 50, practiceId}), /practiceId/);
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(batches, []);
    await api.saveReadinessScore({...scope, score: 40});
    const before = [...documents.entries()];
    commitFailure = new Error("completion transaction failed");
    await assert.rejects(() => api.saveReadinessScore({
      ...scope, score: 100, practiceId: "completion-1"
    }), /completion transaction failed/);
    assert.deepEqual([...documents.entries()], before);
    commitFailure = null;
    await api.saveReadinessScore({...scope, score: 60, practiceId: " completion-1 "});
    assert.equal((await api.getReadinessScoreHistory(scope))[0].practiceId, "completion-1");
    assert.equal(batches.length, 2);
  });

  test(layer + ": a save returns its own committed score even when another save follows immediately", async () => {
    afterCommit = async () => {
      afterCommit = null;
      await api.saveReadinessScore({...scope, score: 90});
    };
    const first = await api.saveReadinessScore({...scope, score: 30});
    assert.equal(first.score, 30);
    assert.equal(first.updatedAt.getTime(), baseTime.getTime() + 1000);
    assert.equal((await api.getReadinessScore(scope)).score, 90);
    assert.deepEqual((await api.getReadinessScoreHistory(scope)).map(({score}) => score), [90, 30]);
  });
}

test("backend and web APIs share the same latest scores and full history", async () => {
  await backend.saveReadinessScore({...scope, score: 45});
  assert.equal((await web.getReadinessScore(scope)).score, 45);
  await web.saveReadinessScore({...scope, score: 75});
  assert.equal((await backend.getReadinessScore(scope)).score, 75);
  const webHistory = await web.getReadinessScoreHistory(scope);
  const backendHistory = await backend.getReadinessScoreHistory(scope);
  assert.deepEqual(webHistory.map((entry) => ({...entry})), backendHistory.map((entry) => ({...entry})));
  assert.deepEqual(webHistory.map(({score}) => score), [75, 45]);
});


test("web and backend deduplicate the same completion across layers", async () => {
  const first = await web.saveReadinessScore({...scope, score: 45, practiceId: "shared"});
  const repeated = await backend.saveReadinessScore({...scope, score: 90, practiceId: "shared"});
  assert.deepEqual({...repeated}, {...first});
  assert.deepEqual((await backend.getReadinessScoreHistory(scope)).map(({score}) => score), [45]);
  assert.equal((await web.getReadinessScore(scope)).score, 45);
  assert.equal(batches.length, 1);
});

test("completion trigger retries after generation failure without duplicating readiness history or reliability counts", async () => {
  const {assessCompletedStudentPractice} = require("../../../functions/triggers/student_practice_completion_trigger.js");
  const reliability = require("../../../functions/features/reliability/reliability_module.js");
  seedSyllabus();
  seedTopicScore("algebra", 100);
  seedPractice("completed", {score: 80, difficulty: "Easy"});
  let completed = false;
  let shouldFailGeneration = true;
  const operations = [];
  const dependencies = {
    processingRepository: {
      async markProcessing() { return {shouldProcess: !completed}; },
      async markGenerating() { operations.push("generating"); },
      async markCompleted() { completed = true; operations.push("completed"); },
      async markFailed() { operations.push("failed"); }
    },
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: false,
      syllabusId: scope.syllabusId, topicId: scope.topicId
    }),
    generatePractice: async () => {
      assert.equal((await web.getReadinessScore(scope)).score, 60);
      assert.equal((await web.getSubjectReadinessScore(scope)).score, 80);
      assert.equal((await reliability.getTopicReliabilityScore(scope)).score, 10);
      assert.equal((await reliability.getTopicReliabilityScore(scope)).completedPracticeCount, 1);
      assert.equal((await reliability.getSubjectReliabilityScore(scope)).score, 5);
      if (shouldFailGeneration) throw new Error("generation failed");
      return {practice: {id: "next-practice"}};
    }
    // Use the actual backend readiness and reliability APIs via the trigger defaults.
  };
  const input = {eventId: "first-delivery", studentId: scope.studentId, practiceId: "completed"};
  await assert.rejects(() => assessCompletedStudentPractice(input, dependencies), /generation failed/);
  const first = await web.getReadinessScore(scope);
  const firstSubject = await web.getSubjectReadinessScore(scope);
  assert.equal(firstSubject.score, 80);
  assert.equal(first.score, 60);
  shouldFailGeneration = false;
  await assessCompletedStudentPractice({...input, eventId: "second-delivery"}, dependencies);
  assert.deepEqual({...await web.getReadinessScore(scope)}, {...first});
  assert.deepEqual({...await web.getSubjectReadinessScore(scope)}, {...firstSubject});
  const history = await web.getReadinessScoreHistory(scope);
  assert.equal(history.length, 1);
  assert.equal(history[0].practiceId, "completed");
  const subjectHistory = await web.getSubjectReadinessScoreHistory(scope);
  assert.equal(subjectHistory.length, 1);
  assert.equal(subjectHistory[0].practiceId, "completed");
  assert.deepEqual(operations, ["generating", "failed", "generating", "completed"]);
  assert.equal(batches.length, 2);
  assert.equal(reliabilityWrites.length, 4);
  assert.equal((await reliability.getTopicReliabilityScore(scope)).completedPracticeCount, 1);
  const duplicate = await assessCompletedStudentPractice(input, dependencies);
  assert.equal(duplicate.alreadyProcessed, true);
  assert.equal(batches.length, 2);
  assert.equal(reliabilityWrites.length, 4);
});

test("subject score APIs share storage and deduplicate completions across backend and web", async () => {
  const first = await backend.saveSubjectReadinessScore({...scope, score: 45, practiceId: "shared"});
  assert.deepEqual({...await web.getSubjectReadinessScore(scope)}, {...first});
  const repeated = await web.saveSubjectReadinessScore({...scope, score: 90, practiceId: "shared"});
  assert.deepEqual({...repeated}, {...first});
  await web.saveSubjectReadinessScore({...scope, score: 75});
  assert.equal((await backend.getSubjectReadinessScore(scope)).score, 75);
  const webHistory = await web.getSubjectReadinessScoreHistory(scope);
  const backendHistory = await backend.getSubjectReadinessScoreHistory(scope);
  assert.deepEqual(webHistory.map((entry) => ({...entry})), backendHistory.map((entry) => ({...entry})));
  assert.deepEqual(webHistory.map(({score}) => score), [75, 45]);
  assert.equal(batches.length, 2);
});

test("completion retries finish subject persistence after a failed save without repeating topic history", async () => {
  const {assessCompletedStudentPractice} = require("../../../functions/triggers/student_practice_completion_trigger.js");
  seedSyllabus();
  seedTopicScore("algebra", 100);
  seedPractice("completed", {score: 80, difficulty: "Easy"});
  let shouldFailSubject = true;
  const operations = [];
  const input = {studentId: scope.studentId, practiceId: "completed"};
  const dependencies = {
    processingRepository: {
      async markProcessing() {},
      async markGenerating() { operations.push("generating"); },
      async markCompleted() { operations.push("completed"); },
      async markFailed() { operations.push("failed"); }
    },
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: true,
      syllabusId: scope.syllabusId, topicId: scope.topicId
    }),
    saveSubjectReadiness: async (input) => {
      if (shouldFailSubject) throw new Error("subject save failed");
      return backend.saveSubjectReadinessScore(input);
    },
    generatePractice: async () => { throw new Error("must not generate for a completed framework"); }
  };
  await assert.rejects(() => assessCompletedStudentPractice(input, dependencies), /subject save failed/);
  assert.deepEqual(reliabilityWrites, []);
  const savedTopic = await web.getReadinessScore(scope);
  assert.equal(savedTopic.score, 60);
  assert.equal(await web.getSubjectReadinessScore(scope), null);
  assert.deepEqual(await web.getSubjectReadinessScoreHistory(scope), []);
  shouldFailSubject = false;
  await assessCompletedStudentPractice(input, dependencies);
  assert.deepEqual({...await web.getReadinessScore(scope)}, {...savedTopic});
  assert.equal((await web.getReadinessScoreHistory(scope)).length, 1);
  assert.equal((await web.getSubjectReadinessScore(scope)).score, 80);
  assert.deepEqual((await web.getSubjectReadinessScoreHistory(scope)).map(({score, practiceId}) => ({score, practiceId})), [
    {score: 80, practiceId: "completed"}
  ]);
  assert.deepEqual(operations, ["failed", "completed"]);
  assert.equal(batches.length, 2);
  assert.equal(reliabilityWrites.length, 2);
});

test("all web score APIs require authentication and never invoke a callable", async () => {
  auth.currentUser = null;
  for (const call of [
    () => web.calculateReadinessScore(scope),
    () => web.calculateSubjectReadinessScore(scope),
    () => web.saveReadinessScore({...scope, score: 50}),
    () => web.getReadinessScore(scope),
    () => web.getReadinessScoreHistory(scope),
    () => web.saveSubjectReadinessScore({...scope, score: 50}),
    () => web.getSubjectReadinessScore(scope),
    () => web.getSubjectReadinessScoreHistory(scope)
  ]) await assert.rejects(call, /authenticated user/);
  assert.deepEqual(reads, []);
  assert.deepEqual(batches, []);
});

for (const [layer, Calculator] of [["backend", BackendCalculator], ["web", WebCalculator]]) {
  test(layer + ": calculator sorts unsorted completion inputs without mutating them", async () => {
    const completions = [
      {practiceId: "old", dateCompleted: new Date("2026-10-01"), score: 10},
      {practiceId: "new", dateCompleted: new Date("2026-10-03"), score: 80},
      {practiceId: "middle", dateCompleted: new Date("2026-10-02"), score: 60}
    ];
    const before = [...completions];
    const calc = new Calculator({
      getReadinessConfig: async () => ({numberOfPractices: 2, difficultyWeights: {medium: 1}}),
      listCompletedPractices: async () => completions,
      getPracticeById: async () => ({type: "assessment", questions: [{syllabusId: "math", topicId: "fractions"}]}),
      getQuestionDifficulty: async () => "Medium",
      assessmentPracticeType: "assessment", preAssessmentPracticeType: "pre assessment"
    });
    assert.equal(await calc.execute(scope), 70);
    assert.deepEqual(completions, before);
  });
}
