import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./question_module.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalOps = {
  readCollectionIds: backendOps.readCollectionIds,
  readDocument: backendOps.readDocument,
  readDocuments: backendOps.readDocuments,
};
const originalFirebase = globalThis.firebase;
const documents = new Map();
const reads = [];
let failurePath = null;
let failure = null;
let activeReads = 0;
let maxActiveReads = 0;

async function recordRead(kind, path) {
  reads.push({kind, path});
  activeReads++;
  maxActiveReads = Math.max(maxActiveReads, activeReads);
  try {
    await new Promise(resolve => setImmediate(resolve));
    if (path === failurePath) throw failure;
  } finally {
    activeReads--;
  }
}

async function listIds(path) {
  assert.ok(!path.endsWith("/questionItems"), "Do not scan question content or IDs");
  await recordRead("collection", path);
  return [...documents.keys()]
    .filter(documentPath => documentPath.slice(0, documentPath.lastIndexOf("/")) === path)
    .map(documentPath => documentPath.slice(documentPath.lastIndexOf("/") + 1));
}

async function readDocument(collectionPath, id) {
  const path = collectionPath + "/" + id;
  await recordRead("document", path);
  if (!documents.has(path)) return null;
  return {...structuredClone(documents.get(path)), id};
}

backendOps.readCollectionIds = listIds;
backendOps.readDocument = readDocument;
backendOps.readDocuments = async refs => Promise.all(
  refs.map(ref => readDocument(ref.collectionPath, ref.documentId))
);
const backend = require("../../../functions/features/question/question_module.js");
const db = {
  collection(path) {
    return {
      async get() {
        return {docs: (await listIds(path)).map(id => ({
          id, exists: true, data: () => structuredClone(documents.get(path + "/" + id)),
        }))};
      },
      doc(id) {
        return {
          id, path: path + "/" + id,
          async get() {
            const data = await readDocument(path, id);
            return {id, exists: data !== null, data: () => {
              if (!data) return undefined;
              const {id: ignored, ...record} = data;
              return record;
            }};
          },
          set() {throw new Error("Question ID lookup must stay read-only");},
        };
      },
    };
  },
};
const app = {firestore: () => db};
globalThis.firebase = {
  apps: [], firestore: () => db, initializeApp: () => app,
};

beforeEach(() => {
  documents.clear();
  reads.length = 0;
  failurePath = null;
  failure = null;
  activeReads = 0;
  maxActiveReads = 0;
});
after(() => {
  Object.assign(backendOps, originalOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

function questionInput(overrides = {}) {
  return {
    syllabusId: "math",
    topicId: "geometry",
    questionText: "Find the missing angle.",
    options: {a: "30°", b: "45°", c: "60°", d: "90°"},
    correctAnswer: "c",
    group: "assessment",
    explanation: "The angles sum to 180°.",
    hasDiagram: false,
    svg: "",
    difficulty: "Medium",
    language: "English",
    specialInstruction: "Give the angle in degrees.",
    ...overrides,
  };
}

function storeQuestion(id, overrides = {}) {
  const data = questionInput(overrides);
  const languageId = encodeURIComponent(data.language.normalize("NFKC").toLowerCase());
  const diagramGroup = data.hasDiagram ? "withDiagram" : "withoutDiagram";
  const path = "questions/" + data.syllabusId + "/topics/" + data.topicId
    + "/languages/" + languageId + "/diagramGroups/" + diagramGroup + "/questionItems/" + id;
  // The actual writer persists every ancestor; exercise empty parent records too.
  const segments = path.split("/");
  for (let length = 2; length < segments.length; length += 2) {
    documents.set(segments.slice(0, length).join("/"), {});
  }
  documents.set(path, structuredClone(data));
  return {path, data};
}

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": ID-only lookup returns the complete diagram question and untruncated SVG", async () => {
    storeQuestion("other", {syllabusId: "science", topicId: "plants"});
    storeQuestion("another", {language: "English"});
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">\n'
      + '<g><text x="20" y="50">角 A &amp; B</text>\n'
      + '<path d="M 0 0 L 30 40 L 60 0 Z"/>\n'.repeat(1000)
      + '</g></svg>';
    const {data} = storeQuestion("diagram-question", {
      syllabusId: "advanced-math",
      topicId: "triangles",
      language: "Bahasa Melayu",
      hasDiagram: true,
      svg,
      group: "pre assessment",
    });
    const before = structuredClone([...documents]);
    const question = await api.getQuestionById(" diagram-question ");
    assert.deepEqual({...question}, {...data, id: "diagram-question"});
    assert.equal(question.svg, svg);
    assert.equal(question.options[question.correctAnswer], "60°");
    assert.deepEqual([...documents], before);
    const directReads = reads.filter(read => read.kind === "document");
    assert.ok(directReads.length > 1, "Must search more than the first branch");
    assert.ok(directReads.every(read => read.path.endsWith("/questionItems/diagram-question")));
  });

  test(layer + ": non-diagram questions return hasDiagram false and empty SVG", async () => {
    const {data} = storeQuestion("plain-question");
    assert.deepEqual({...await api.getQuestionById("plain-question")}, {...data, id: "plain-question"});
  });

  test(layer + ": missing ID returns null, including an empty question collection", async () => {
    assert.equal(await api.getQuestionById("missing"), null);
    assert.deepEqual(reads, [{kind: "collection", path: "questions"}]);
    storeQuestion("existing");
    assert.equal(await api.getQuestionById("missing"), null);
  });

  test(layer + ": rejects ambiguous IDs across syllabi, languages and diagram branches", async () => {
    for (const differentBranch of [
      {syllabusId: "another-syllabus"},
      {language: "中文"},
      {hasDiagram: true, svg: "<svg><text>30°</text></svg>"},
    ]) {
      documents.clear();
      storeQuestion("shared-id");
      storeQuestion("shared-id", differentBranch);
      await assert.rejects(() => api.getQuestionById("shared-id"), error => {
        assert.equal(error.code, "ambiguous-question-id");
        assert.match(error.message, /multiple question branches/);
        return true;
      });
    }
  });

  test(layer + ": malformed or path-like IDs are rejected before any Firestore read", async () => {
    for (const id of [
      undefined, null, false, 42, {}, ["q"], "", "   ", "/", "topic/question",
      ".", "..", "__reserved__", "a".repeat(1501), "角".repeat(501),
    ]) {
      await assert.rejects(() => api.getQuestionById(id), /questionId must be/);
    }
    assert.deepEqual(reads, []);
  });

  test(layer + ": question IDs support Unicode and percent characters without path conversion", async () => {
    const id = "题目%20one";
    const {data} = storeQuestion(id, {language: "中文"});
    assert.deepEqual({...await api.getQuestionById(id)}, {...data, id});
  });

  test(layer + ": hierarchy and leaf read failures propagate instead of reporting not found", async () => {
    const {path} = storeQuestion("q");
    failure = new Error("Permission denied");
    failurePath = "questions/math/topics";
    await assert.rejects(() => api.getQuestionById("q"), failure);
    failurePath = path;
    await assert.rejects(() => api.getQuestionById("q"), failure);
  });

  test(layer + ": rejects a diagram question without its required SVG", async () => {
    storeQuestion("broken", {hasDiagram: true, svg: ""});
    await assert.rejects(() => api.getQuestionById("broken"), /svg is required/);
  });

  test(layer + ": validates stored language and diagram metadata against the actual path", async () => {
    const {path} = storeQuestion("q");
    documents.get(path).language = "Malay";
    await assert.rejects(() => api.getQuestionById("q"), /does not match its language\/diagram path/);
    documents.get(path).language = "English";
    documents.get(path).hasDiagram = true;
    documents.get(path).svg = "<svg></svg>";
    await assert.rejects(() => api.getQuestionById("q"), /does not match its language\/diagram path/);
  });

  test(layer + ": searches only the Question feature's collection", async () => {
    documents.set("preAssessmentQuestions/math", {});
    documents.set("preAssessmentQuestions/math/topics/geometry", {});
    documents.set("preAssessmentQuestions/math/topics/geometry/questionItems/q", questionInput());
    documents.set("unrelated/q", questionInput());
    assert.equal(await api.getQuestionById("q"), null);
    assert.deepEqual(reads, [{kind: "collection", path: "questions"}]);
  });

  test(layer + ": keeps the existing reference lookup and practice answer redaction", async () => {
    const {data} = storeQuestion("q", {hasDiagram: true, svg: "<svg><text>A</text></svg>"});
    const reference = {
      questionId: "q", syllabusId: data.syllabusId, topicId: data.topicId,
      language: data.language, hasDiagram: data.hasDiagram,
    };
    assert.deepEqual({...await api.getQuestion(reference)}, {...data, id: "q"});
    const [practiceQuestion] = await api.getQuestionsForPractice([reference]);
    assert.equal(practiceQuestion.svg, data.svg);
    assert.equal(Object.hasOwn(practiceQuestion, "correctAnswer"), false);
    assert.equal(Object.hasOwn(practiceQuestion, "explanation"), false);
  });

  test(layer + ": searches a larger hierarchy with bounded concurrent reads", async () => {
    for (let index = 0; index < 25; index++) {
      storeQuestion("question-" + index, {syllabusId: "subject-" + index});
    }
    const question = await api.getQuestionById("question-24");
    assert.equal(question.syllabusId, "subject-24");
    assert.ok(maxActiveReads > 1);
    assert.ok(maxActiveReads <= 10);
  });
}

test("backend and web expose matching feature APIs without a Firebase callable", () => {
  assert.equal(typeof backend.getQuestionById, "function");
  assert.equal(typeof web.getQuestionById, "function");
  assert.deepEqual(Object.keys(backend).sort(), Object.keys(web).sort());
  const firebaseFunctions = require("../../../functions/index.js");
  assert.equal(Object.hasOwn(firebaseFunctions, "getQuestionById"), false);
});
