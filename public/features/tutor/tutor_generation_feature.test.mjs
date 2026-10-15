import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./tutor_module.js";
import {GenerateTutorMiniQuestionSet as WebGenerate} from "./application/generate_tutor_mini_question_set.js";
import {buildTutorPrompt as webBuildPrompt} from "./application/build_tutor_prompt.js";
import {tutorSetDocumentId as webDocumentId} from "./infrastructure/tutor_set_document_id.js";
import {tutorSetPath as webSetPath} from "./infrastructure/tutor_set_path.js";
import * as webLlm from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {tutorMiniQuestionSetSchema as webSetSchema} from "../../config/firebase/tutor_schema.js";
import {getPreAssessmentQuestionById as webGetPreAssessmentQuestionById} from "../pre_assessment_question/pre_assessment_question_module.js?v=20261015-practice-result-review-v1";

const require = createRequire(import.meta.url);
const {GenerateTutorMiniQuestionSet: BackendGenerate} = require(
  "../../../functions/features/tutor/application/generate_tutor_mini_question_set.js"
);
const {buildTutorPrompt: backendBuildPrompt} = require(
  "../../../functions/features/tutor/application/build_tutor_prompt.js"
);
const {tutorSetDocumentId: backendDocumentId} = require(
  "../../../functions/features/tutor/infrastructure/tutor_set_document_id.js"
);
const {tutorSetPath: backendSetPath} = require("../../../functions/features/tutor/infrastructure/tutor_set_path.js");
function setPath(reference) {
  const {collectionPath, documentId} = backendSetPath({...reference, miniQuestionCount: reference.miniQuestionCount ?? 3});
  return collectionPath + "/" + documentId;
}
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const backendLlm = require("../../../functions/utils/llm/llm_ops.js");
const originalOps = {...backendOps};
const originalBackendLlm = backendLlm.generateLlmText;
const originalAdapter = new webLlm.LlmUtil().getProviderAdapter("deepseek");
const originalFirebase = globalThis.firebase;
const baseTime = new Date("2026-10-15T00:00:00Z");
const documents = new Map();
const events = [];
const writes = [];
const llmCalls = [];
const student = {uid: "student-1", email: "student@example.com", emailVerified: false};
const auth = {currentUser: {...student}};
let llmResponse = null;
let llmFailure = null;
let writeFailure = null;
let readFailurePath = null;
let omitSavedDocument = false;
let onLlm = null;
let onRead = null;

function configuration(changes = {}) {
  return {
    miniQuestionCount: 3,
    promptInstructions: "Lead the student one step at a time.",
    correctAnswerMessage: {English: "Correct!", "Bahasa Melayu": "Bagus!", "中文": "答对了"},
    incorrectAnswerMessage: {English: "Try again.", "Bahasa Melayu": "Cuba lagi.", "中文": "再试一次"},
    updatedAt: new Date(baseTime), updatedBy: "admin-1",
    ...changes,
  };
}
function question(changes = {}) {
  return {
    id: "q", syllabusId: "math", topicId: "geometry", language: "English",
    questionText: "What is the missing angle?",
    options: {a: "30°", b: "45°", c: "60°", d: "90°"}, correctAnswer: "c",
    explanation: "Angles in a triangle add to 180°.", hasDiagram: true,
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">A = 60°</text><path d="M0 0L30 40L60 0Z"/></svg>',
    difficulty: "Medium", group: "assessment", specialInstruction: "Use degrees.",
    ...changes,
  };
}
function response(language = "English", count = 3) {
  return {
    language,
    miniQuestions: Array.from({length: count}, (_, index) => ({
      sequence: index + 1,
      questionText: "What is reasoning step " + (index + 1) + "?",
      expectedAnswer: index === count - 1 ? "60°" : "180°",
      acceptedAnswers: index === count - 1 ? ["60 degrees", "60"] : [],
      answerExplanation: "Explanation for step " + (index + 1) + ".",
    })),
  };
}
function sourceQuestionData(prompt) {
  return JSON.parse(prompt.split("Original question data:\n")[1].split("\n\nRequirements:\n")[0]);
}

async function readDocument(collectionPath, documentId, options = {}) {
  const path = collectionPath + "/" + documentId;
  events.push("read:" + path);
  onRead?.(path);
  if (readFailurePath === path) throw new Error("Read unavailable");
  if (!documents.has(path)) return null;
  const data = structuredClone(documents.get(path));
  return options.includeId === false ? data : {...data, id: documentId};
}
async function readIds(collectionPath) {
  events.push("list:" + collectionPath);
  if (readFailurePath === collectionPath) throw new Error("Read unavailable");
  return [...documents.keys()]
    .filter(path => path.slice(0, path.lastIndexOf("/")) === collectionPath)
    .map(path => path.slice(path.lastIndexOf("/") + 1));
}
async function writeDocument(collectionPath, documentId, data, options) {
  if (writeFailure) throw writeFailure;
  const path = collectionPath + "/" + documentId;
  events.push("write:" + path);
  writes.push({path, data, options});
  if (!omitSavedDocument) {
    documents.set(path, structuredClone({
      ...data, generatedAt: data.generatedAt instanceof Date ? data.generatedAt
        : new Date(baseTime.getTime() + writes.length * 1000),
    }));
  }
}
async function generateLlmText(prompt, options) {
  events.push("llm");
  llmCalls.push({prompt, options});
  await onLlm?.();
  if (llmFailure) throw llmFailure;
  if (llmResponse === null && prompt.startsWith("You check a student's answer")) {
    return {isCorrect: true};
  }
  return llmResponse === null
    ? response(prompt.match(/^Language: (.+)$/m)[1], Number(prompt.match(/^Number of mini questions: (\d+)$/m)[1]))
    : llmResponse;
}
backendOps.readDocument = readDocument;
backendOps.readCollectionIds = readIds;
backendOps.writeDocument = writeDocument;
backendOps.createDocumentIfAbsent = async (collection, id, data) => {
  if (documents.has(collection + "/" + id)) throw Object.assign(new Error("Already exists"), {code: "already-exists"});
  await writeDocument(collection, id, data, {merge: false});
};
backendLlm.generateLlmText = generateLlmText;
webLlm.registerLlmProvider("deepseek", {
  call() {throw new Error("Tutor must use the existing generateText abstraction");},
  generateText: generateLlmText,
});
const backend = require("../../../functions/features/tutor/tutor_module.js");
const {getPreAssessmentQuestionById: backendGetPreAssessmentQuestionById} = require(
  "../../../functions/features/pre_assessment_question/pre_assessment_question_module.js"
);
const db = {
  async runTransaction(operation) {
    const writes = [];
    const result = await operation({
      get: ref => ref.get(), set: (ref, data) => writes.push([ref, data]),
    });
    for (const [ref, data] of writes) await ref.set(data, {merge: false});
    return result;
  },
  collection(path) {
    return {
      async get() {
        return {docs: (await readIds(path)).map(id => ({
          id, exists: true, data: () => structuredClone(documents.get(path + "/" + id)),
        }))};
      },
      doc(id) {
        return {
          id, path: path + "/" + id,
          async get() {
            const data = await readDocument(path, id, {includeId: false});
            return {id, exists: data !== null, data: () => data};
          },
          set(data, options) {return writeDocument(path, id, data, options);},
        };
      },
    };
  },
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {firestore: () => db, auth: () => auth};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};

function seedQuestion(id = "q", changes = {}) {
  const data = question({...changes, id});
  const languageId = encodeURIComponent(data.language.normalize("NFKC").toLowerCase());
  const diagramGroup = data.hasDiagram ? "withDiagram" : "withoutDiagram";
  const path = "questions/" + data.syllabusId + "/topics/" + data.topicId
    + "/languages/" + languageId + "/diagramGroups/" + diagramGroup + "/questionItems/" + id;
  const segments = path.split("/");
  for (let length = 2; length < segments.length; length += 2) {
    documents.set(segments.slice(0, length).join("/"), {});
  }
  const {id: ignored, ...record} = data;
  documents.set(path, record);
  return path;
}

function seedPreAssessmentQuestion(id = "q", changes = {}) {
  const {id: ignored, ...data} = question({...changes, id, group: "pre assessment"});
  const parent = "preAssessmentQuestions/" + data.syllabusId + "/topics/" + data.topicId;
  documents.set("preAssessmentQuestions/" + data.syllabusId, {});
  documents.set(parent, {});
  const path = parent + "/questionItems/" + id;
  documents.set(path, data);
  return path;
}

beforeEach(() => {
  documents.clear(); events.length = 0; writes.length = 0; llmCalls.length = 0;
  llmResponse = null; llmFailure = null; writeFailure = null;
  readFailurePath = null; omitSavedDocument = false; onLlm = null; onRead = null;
  auth.currentUser = {...student};
});
after(() => {
  Object.assign(backendOps, originalOps);
  backendLlm.generateLlmText = originalBackendLlm;
  webLlm.registerLlmProvider("deepseek", originalAdapter);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

for (const [layer, Generate, buildPrompt] of [
  ["backend", BackendGenerate, backendBuildPrompt],
  ["web", WebGenerate, webBuildPrompt],
]) {
  test(layer + ": orchestrates question, configuration, prompt, LLM validation and persistence in sequence", async () => {
    const order = [];
    const config = configuration({miniQuestionCount: 6});
    const generatedResponse = response("Bahasa Melayu", 6);
    const useCase = new Generate({
      getQuestionById: async id => {assert.equal(id, "q"); order.push("question"); return question();},
      getTutorConfig: async () => {order.push("config"); return config;},
      generateLlmText: async (prompt, options) => {
        order.push("llm");
        assert.ok(prompt.includes("Number of mini questions: 6"));
        assert.ok(prompt.includes("Language: Bahasa Melayu"));
        assert.ok(prompt.includes(config.promptInstructions));
        assert.equal(options.maxTokens, 8192);
        const data = sourceQuestionData(prompt);
        assert.equal(data.correctAnswer, "c");
        assert.equal(data.correctAnswerText, "60°");
        assert.equal(data.svg, question().svg);
        assert.ok(prompt.includes("interpret the supplied SVG markup directly"));
        return generatedResponse;
      },
      repository: {save: async (data, {beforeWrite}) => {
        beforeWrite();
        order.push("save");
        assert.deepEqual(data.miniQuestions, generatedResponse.miniQuestions);
        assert.equal(data.configUpdatedAt.getTime(), config.updatedAt.getTime());
        return {...data, generatedAt: baseTime};
      }},
    });
    const input = {questionId: " q ", language: " Bahasa Melayu ", studentId: "must-not-store"};
    const before = structuredClone(input);
    const set = await useCase.execute(input);
    assert.deepEqual(order, ["question", "config", "llm", "save"]);
    assert.equal(set.questionId, "q");
    assert.equal(set.language, "Bahasa Melayu");
    assert.equal(set.miniQuestions[5].expectedAnswer, "60°");
    assert.deepEqual(input, before);
    assert.equal(Object.hasOwn(set, "studentId"), false);
  });

  test(layer + ": template replacement preserves literal dollar signs and nested placeholders", () => {
    const input = question({
      questionText: "Find $& and {{miniQuestionCount}}.",
      svg: "<svg><text>{{language}} $& $1</text></svg>",
    });
    const prompt = buildPrompt({
      question: input, language: "English",
      configuration: configuration({promptInstructions: "Keep $& $1 {{questionDataJson}} literal."}),
    });
    assert.deepEqual(sourceQuestionData(prompt).svg, input.svg);
    assert.equal(sourceQuestionData(prompt).questionText, input.questionText);
    assert.ok(prompt.includes("Keep $& $1 {{questionDataJson}} literal."));
  });

  test(layer + ": invalid LLM shapes and missing answer fields never reach persistence", async () => {
    const badResponses = [
      null, [], "not JSON", {...response(), language: "Malay"},
      response("English", 2),
      {...response(), miniQuestions: response().miniQuestions.map(q => ({...q, sequence: 1}))},
      {...response(), miniQuestions: response().miniQuestions.map(q => ({...q, expectedAnswer: ""}))},
      {...response(), miniQuestions: response().miniQuestions.map(q => ({...q, answerExplanation: " "}))},
      {...response(), miniQuestions: response().miniQuestions.map(q => ({...q, questionText: 4}))},
      {...response(), miniQuestions: response().miniQuestions.map(q => ({...q, acceptedAnswers: "180"}))},
      {...response(), miniQuestions: response().miniQuestions.map(q => ({...q, acceptedAnswers: [null]}))},
      {...response(), miniQuestions: [null, ...response().miniQuestions.slice(1)]},
    ];
    let saves = 0;
    let currentResponse;
    const useCase = new Generate({
      getQuestionById: async () => question(), getTutorConfig: async () => configuration(),
      generateLlmText: async () => currentResponse,
      repository: {save: async () => {saves++;}},
    });
    for (currentResponse of badResponses) {
      await assert.rejects(() => useCase.execute({questionId: "q", language: "English"}));
    }
    assert.equal(saves, 0);
  });

  test(layer + ": accepts valid JSON text and trims mini question fields and equivalent answers", async () => {
    const raw = response();
    raw.miniQuestions[0] = {
      ...raw.miniQuestions[0], questionText: " First step? ", expectedAnswer: " 180° ",
      acceptedAnswers: [" 180 degrees "], answerExplanation: " Explain this. ",
      studentId: "discard", options: {a: "discard"},
    };
    const useCase = new Generate({
      getQuestionById: async () => question(), getTutorConfig: async () => configuration(),
      generateLlmText: async () => JSON.stringify(raw),
      repository: {save: async input => input},
    });
    const result = await useCase.execute({questionId: "q", language: "English"});
    assert.deepEqual(result.miniQuestions[0], {
      sequence: 1, questionText: "First step?", expectedAnswer: "180°",
      acceptedAnswers: ["180 degrees"], answerExplanation: "Explain this.",
    });
    assert.ok(Object.isFrozen(result.miniQuestions));
    assert.ok(Object.isFrozen(result.miniQuestions[0]));
    assert.ok(Object.isFrozen(result.miniQuestions[0].acceptedAnswers));
  });
}

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": pre-assessment ID lookup returns complete answers and SVG across topic branches", async () => {
    const getPreQuestion = layer === "backend" ? backendGetPreAssessmentQuestionById : webGetPreAssessmentQuestionById;
    seedPreAssessmentQuestion("other", {syllabusId: "science", topicId: "plants"});
    const path = seedPreAssessmentQuestion("pre-q", {language: "中文"});
    const loaded = await getPreQuestion(" pre-q ");
    assert.deepEqual({...loaded}, {...documents.get(path), id: "pre-q"});
    assert.equal(loaded.svg, question().svg);
    assert.equal(await getPreQuestion("missing"), null);
    assert.equal(writes.length, 0);
  });

  test(layer + ": pre-assessment ID lookup rejects invalid IDs, duplicate IDs and read failures", async () => {
    const getPreQuestion = layer === "backend" ? backendGetPreAssessmentQuestionById : webGetPreAssessmentQuestionById;
    for (const id of [null, "", " ", {}, 1, "q/path", "__reserved__", "a".repeat(1501)]) {
      await assert.rejects(() => getPreQuestion(id), /questionId/);
    }
    assert.deepEqual(events, []);
    seedPreAssessmentQuestion("shared");
    seedPreAssessmentQuestion("shared", {topicId: "another-topic"});
    await assert.rejects(() => getPreQuestion("shared"), error => error.code === "ambiguous-question-id");
    readFailurePath = "preAssessmentQuestions";
    await assert.rejects(() => getPreQuestion("shared"), /Read unavailable/);
    assert.equal(writes.length, 0);
  });

  test(layer + ": tutor resolves and generates a review for a pre-assessment question", async () => {
    const path = seedPreAssessmentQuestion("pre-q");
    documents.set("tutor/config", configuration());
    assert.deepEqual({...await api.getTutorQuestionById("pre-q")}, {...documents.get(path), id: "pre-q"});
    const set = await api.getTutorMiniQuestionSet({questionId: "pre-q", language: "English"});
    assert.equal(set.questionId, "pre-q");
    assert.equal(sourceQuestionData(llmCalls[0].prompt).svg, question().svg);
    assert.equal(sourceQuestionData(llmCalls[0].prompt).correctAnswerText, "60°");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, "tutor/pre-q/counts/3/languages/English");
  });

  test(layer + ": tutor rejects cross-collection ID collisions before generating or storing a set", async () => {
    seedQuestion("shared");
    seedPreAssessmentQuestion("shared");
    documents.set("tutor/config", configuration());
    await assert.rejects(() => api.getTutorQuestionById("shared"), error => error.code === "ambiguous-question-id");
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "shared", language: "English"}),
      error => error.code === "ambiguous-question-id");
    assert.equal(llmCalls.length, 0);
    assert.equal(writes.length, 0);
  });

  test(layer + ": answer-check API reads the existing set without storing student answers", async () => {
    const reference = {questionId: "q", language: "English", miniQuestionCount: 3};
    const path = setPath(reference);
    documents.set(path, {
      ...reference, ...response(), miniQuestionCount: 3, configUpdatedAt: baseTime, generatedAt: baseTime,
    });
    assert.deepEqual(await api.checkTutorMiniQuestionAnswer({...reference, sequence: 3, answer: "60"}), {isCorrect: true});
    assert.equal(llmCalls.length, 0);
    assert.deepEqual(await api.checkTutorMiniQuestionAnswer({...reference, sequence: 3, answer: "Sixty degrees"}), {isCorrect: true});
    llmResponse = {isCorrect: false};
    assert.deepEqual(await api.checkTutorMiniQuestionAnswer({...reference, sequence: 3, answer: "90"}), {isCorrect: false});
    assert.equal(llmCalls.length, 2);
    assert.equal(writes.length, 0);
    assert.ok(events.filter(event => event.startsWith("read:")).every(event => event === "read:" + path));
    assert.equal(documents.size, 1);
  });

  test(layer + ": getter generates and saves a missing set, then reuses it without question or config reads", async () => {
    seedQuestion();
    documents.set("tutor/config", configuration());
    const reference = {questionId: "q", language: "English", miniQuestionCount: 3};
    const saved = await api.getTutorMiniQuestionSet(reference);
    assert.equal(saved.miniQuestions[2].expectedAnswer, "60°");
    assert.deepEqual(saved.miniQuestions[2].acceptedAnswers, ["60 degrees", "60"]);
    assert.ok(saved.miniQuestions.every(q => q.answerExplanation.length > 0));
    assert.equal(llmCalls.length, 1);
    assert.equal(writes.length, 1);
    assert.equal(events[0], "read:" + writes[0].path);
    // A stored set remains reusable even when source data or configuration
    // is unavailable. Only an actual cache miss enters the generation flow.
    for (const path of [...documents.keys()]) {
      if (path !== writes[0].path) documents.delete(path);
    }
    events.length = 0;
    assert.deepEqual(await api.getTutorMiniQuestionSet(reference), saved);
    assert.deepEqual(events, ["read:" + writes[0].path]);
    assert.equal(llmCalls.length, 1);
    assert.equal(writes.length, 1);
  });

  test(layer + ": getter selects the configured count while retaining other count and language variants", async () => {
    seedQuestion();
    documents.set("tutor/config", configuration());
    const english = await api.getTutorMiniQuestionSet({questionId: "q", language: "English"});
    const malay = await api.getTutorMiniQuestionSet({questionId: "q", language: "Bahasa Melayu"});
    assert.notEqual(writes[0].path, writes[1].path);
    documents.set("tutor/config", configuration({miniQuestionCount: 6}));
    const six = await api.getTutorMiniQuestionSet({questionId: "q", language: "English"});
    assert.equal(six.miniQuestionCount, 6);
    assert.equal(six.miniQuestions.length, 6);
    assert.notEqual(writes[2].path, writes[0].path);
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "English", miniQuestionCount: 3}), english);
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "Bahasa Melayu", miniQuestionCount: 3}), malay);
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "English"}), six);
    assert.equal(llmCalls.length, 3);
    assert.equal(writes.length, 3);
  });

  test(layer + ": feature lookup migrates matching legacy data without question, config or LLM reads", async () => {
    const reference = {questionId: "q", language: "English", miniQuestionCount: 3};
    const legacyPath = "tutor/" + await backendDocumentId(reference);
    const legacy = {...reference, ...response(), configUpdatedAt: baseTime, generatedAt: new Date(0)};
    documents.set(legacyPath, legacy);
    const saved = await api.getTutorMiniQuestionSet(reference);
    assert.deepEqual({...saved}, legacy);
    assert.equal(saved.generatedAt.getTime(), 0);
    assert.deepEqual(documents.get(setPath(reference)), legacy);
    assert.equal(documents.has(legacyPath), true);
    assert.equal(llmCalls.length, 0);
    assert.equal(writes.length, 1);
    assert.deepEqual(await api.checkTutorMiniQuestionAnswer({...reference, sequence: 3, answer: "60"}), {isCorrect: true});
    assert.equal(writes.length, 1);
    assert.equal(events.some(event => event === "read:tutor/config" || event.startsWith("list:")), false);
  });

  test(layer + ": a configuration change during lookup cannot redirect the selected count", async () => {
    seedQuestion();
    documents.set("tutor/config", configuration());
    onRead = path => {
      if (path === "tutor/q/counts/3/languages/English") {
        documents.set("tutor/config", configuration({miniQuestionCount: 6}));
      }
    };
    const saved = await api.getTutorMiniQuestionSet({questionId: "q", language: "English"});
    assert.equal(saved.miniQuestionCount, 3);
    assert.equal(saved.miniQuestions.length, 3);
    assert.equal(writes[0].path, "tutor/q/counts/3/languages/English");
    assert.ok(llmCalls[0].prompt.includes("Number of mini questions: 3"));
  });

  test(layer + ": answer checking uses the requested count rather than the current default", async () => {
    for (const miniQuestionCount of [3, 6]) {
      const reference = {questionId: "q", language: "English", miniQuestionCount};
      const data = {...reference, ...response("English", miniQuestionCount), configUpdatedAt: baseTime, generatedAt: baseTime};
      data.miniQuestions[0].expectedAnswer = String(miniQuestionCount);
      documents.set(setPath(reference), data);
    }
    documents.set("tutor/config", configuration({miniQuestionCount: 6}));
    for (const miniQuestionCount of [3, 6]) {
      assert.deepEqual(await api.checkTutorMiniQuestionAnswer({questionId: "q", language: "English",
        miniQuestionCount, sequence: 1, answer: String(miniQuestionCount)}), {isCorrect: true});
    }
    assert.deepEqual(events, ["read:tutor/q/counts/3/languages/English", "read:tutor/q/counts/6/languages/English"]);
    assert.equal(llmCalls.length, 0);
    assert.equal(writes.length, 0);
  });

  test(layer + ": getter propagates failures without storing partial sets and succeeds on a later retry", async () => {
    const reference = {questionId: "q", language: "English", miniQuestionCount: 3};
    await assert.rejects(() => api.getTutorMiniQuestionSet(reference), /was not found/);
    seedQuestion();
    await assert.rejects(() => api.getTutorMiniQuestionSet(reference), /Save tutor configuration/);
    documents.set("tutor/config", configuration());
    readFailurePath = setPath(reference);
    await assert.rejects(() => api.getTutorMiniQuestionSet(reference), /Read unavailable/);
    assert.equal(llmCalls.length, 0);
    readFailurePath = null;
    llmFailure = new Error("LLM unavailable");
    await assert.rejects(() => api.getTutorMiniQuestionSet(reference), llmFailure);
    llmFailure = null;
    llmResponse = response("English", 2);
    await assert.rejects(() => api.getTutorMiniQuestionSet(reference), /exactly 3/);
    assert.equal(writes.length, 0);
    llmResponse = null;
    const saved = await api.getTutorMiniQuestionSet(reference);
    assert.equal(saved.miniQuestionCount, 3);
    assert.equal(writes.length, 1);
  });

  test(layer + ": feature generation stores and returns answers, explanations and server metadata", async () => {
    const svg = question().svg + "<!--" + "diagram detail ".repeat(1000) + "-->";
    seedQuestion("q", {svg});
    documents.set("tutor/config", configuration({miniQuestionCount: 6}));
    const input = {
      questionId: "q", language: "English", studentId: "discard",
      miniQuestionCount: 6, generatedAt: new Date(0), configUpdatedAt: new Date(0),
      questionText: "discard", miniQuestions: [],
    };
    const saved = await api.generateTutorMiniQuestionSet(input);
    assert.equal(saved.miniQuestionCount, 6);
    assert.equal(saved.generatedAt.getTime(), baseTime.getTime() + 1000);
    assert.equal(saved.configUpdatedAt.getTime(), baseTime.getTime());
    assert.equal(saved.miniQuestions[5].expectedAnswer, "60°");
    assert.deepEqual(saved.miniQuestions[5].acceptedAnswers, ["60 degrees", "60"]);
    assert.ok(saved.miniQuestions.every(q => q.answerExplanation.length > 0));
    assert.ok(Object.isFrozen(saved));
    assert.equal(llmCalls.length, 1);
    assert.equal(sourceQuestionData(llmCalls[0].prompt).svg, svg);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, "tutor/q/counts/6/languages/English");
    assert.equal(writes[0].options.merge, false);
    assert.deepEqual(Object.keys(documents.get(writes[0].path)).sort(), [
      "configUpdatedAt", "generatedAt", "language", "miniQuestionCount", "miniQuestions", "questionId",
    ]);
    const configRead = events.indexOf("read:tutor/config");
    assert.ok(configRead > events.findIndex(event => event.endsWith("/questionItems/q")));
    assert.ok(events.indexOf("llm") > configRead);
    assert.ok(events.findIndex(event => event.startsWith("write:")) > events.indexOf("llm"));
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "English"}), saved);
    assert.equal(llmCalls.length, 1, "Reading a saved set must not call the LLM");
  });

  test(layer + ": languages are independent and regeneration replaces only the requested language", async () => {
    seedQuestion();
    const config = configuration();
    documents.set("tutor/config", config);
    const english = await api.generateTutorMiniQuestionSet({questionId: "q", language: "English"});
    const malay = await api.generateTutorMiniQuestionSet({questionId: "q", language: "Bahasa Melayu"});
    assert.notEqual(writes[0].path, writes[1].path);
    documents.set("tutor/config", configuration({miniQuestionCount: 1, updatedAt: new Date(baseTime.getTime() + 5000)}));
    const replacement = await api.generateTutorMiniQuestionSet({questionId: "q", language: "English", miniQuestionCount: 3});
    assert.equal(writes[2].path, writes[0].path);
    assert.equal(replacement.miniQuestionCount, 3);
    assert.equal(replacement.configUpdatedAt.getTime(), baseTime.getTime() + 5000);
    assert.equal(english.miniQuestionCount, 3);
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "Bahasa Melayu", miniQuestionCount: 3}), malay);
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "English", miniQuestionCount: 3}), replacement);
    assert.equal([...documents.keys()].filter(path => path.includes("/counts/")).length, 2);
    assert.equal(documents.get("tutor/config").updatedBy, "admin-1");
  });

  test(layer + ": absent question, missing configuration and unsupported language stop before the LLM or writes", async () => {
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /was not found/);
    seedQuestion();
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /Save tutor configuration/);
    documents.set("tutor/config", configuration());
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "French"}), /feedback is not configured/);
    assert.deepEqual(llmCalls, []);
    assert.deepEqual(writes, []);
  });

  test(layer + ": invalid references are rejected without question reads, LLM calls or writes", async () => {
    for (const input of [
      null, [], {}, {questionId: "q"}, {questionId: "q", language: " "},
      {questionId: "a/b", language: "English"}, {questionId: "__reserved__", language: "English"},
      {questionId: 7, language: "English"},
      ...[null, 0, -1, 1.5, "3"].map(miniQuestionCount => ({questionId: "q", language: "English", miniQuestionCount})),
    ]) {
      await assert.rejects(() => api.generateTutorMiniQuestionSet(input));
      await assert.rejects(() => api.getTutorMiniQuestionSet(input));
    }
    assert.deepEqual(events, []);
  });

  test(layer + ": generation and persistence failures preserve the previously stored set", async () => {
    seedQuestion();
    documents.set("tutor/config", configuration());
    const old = await api.generateTutorMiniQuestionSet({questionId: "q", language: "English"});
    const path = writes[0].path;
    const stored = structuredClone(documents.get(path));
    llmResponse = response("English", 2);
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /exactly 3/);
    llmResponse = null;
    llmFailure = new Error("LLM unavailable");
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), llmFailure);
    llmFailure = null;
    writeFailure = new Error("Write unavailable");
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), writeFailure);
    assert.equal(writes.length, 1);
    assert.deepEqual(documents.get(path), stored);
    assert.deepEqual(await api.getTutorMiniQuestionSet({questionId: "q", language: "English"}), old);
  });

  test(layer + ": read errors propagate and a missing post-save document is not reported as success", async () => {
    const questionPath = seedQuestion();
    documents.set("tutor/config", configuration());
    readFailurePath = questionPath;
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /Read unavailable/);
    readFailurePath = "tutor/config";
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /Read unavailable/);
    assert.equal(llmCalls.length, 0);
    readFailurePath = null;
    omitSavedDocument = true;
    await assert.rejects(() => api.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /Saved tutor mini question set could not be read/);
  });

  test(layer + ": saved set lookup validates stored data without regeneration", async () => {
    const reference = {questionId: "q", language: "English", miniQuestionCount: 3};
    const path = setPath(reference);
    const valid = {...reference, ...response(), miniQuestionCount: 3, configUpdatedAt: baseTime, generatedAt: baseTime};
    documents.set(path, valid);
    assert.deepEqual({...await api.getTutorMiniQuestionSet(reference)}, valid);
    for (const changes of [
      {questionId: "other"}, {language: "Bahasa Melayu"}, {generatedAt: null},
      {configUpdatedAt: new Date(NaN)}, {miniQuestionCount: 6},
    ]) {
      documents.set(path, {...valid, ...changes});
      await assert.rejects(() => api.getTutorMiniQuestionSet(reference));
    }
    assert.equal(writes.length, 0);
    assert.equal(llmCalls.length, 0);
  });

  test(layer + ": input changes while the LLM is pending cannot redirect the saved set", async () => {
    seedQuestion();
    documents.set("tutor/config", configuration());
    const input = {questionId: "q", language: "English", miniQuestionCount: 3};
    onLlm = () => {input.miniQuestionCount = 6; input.questionId = "redirected"; input.language = "中文";};
    const saved = await api.generateTutorMiniQuestionSet(input);
    assert.equal(saved.questionId, "q");
    assert.equal(saved.language, "English");
    assert.equal(writes[0].path, setPath({questionId: "q", language: "English"}));
  });
}

test("web generation and set reads require sign-in, while a signed-in student can generate", async () => {
  auth.currentUser = null;
  await assert.rejects(() => web.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /signed in/);
  await assert.rejects(() => web.getTutorMiniQuestionSet({questionId: "q", language: "English"}), /signed in/);
  await assert.rejects(() => web.checkTutorMiniQuestionAnswer({questionId: "q", language: "English", sequence: 1, answer: "180"}), /signed in/);
  assert.deepEqual(events, []);
  auth.currentUser = {...student};
  seedQuestion();
  documents.set("tutor/config", configuration());
  assert.equal((await web.generateTutorMiniQuestionSet({questionId: "q", language: "English"})).questionId, "q");
});

test("web generation rejects account changes before the LLM or before persistence", async () => {
  seedQuestion();
  documents.set("tutor/config", configuration());
  onRead = path => {
    if (path === "tutor/config") auth.currentUser = {...student, uid: "changed"};
  };
  await assert.rejects(() => web.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /account changed/);
  assert.equal(llmCalls.length, 0);
  onRead = null;
  for (const user of [null, {...student, uid: "changed"}]) {
    auth.currentUser = {...student};
    onLlm = () => {auth.currentUser = user;};
    await assert.rejects(() => web.generateTutorMiniQuestionSet({questionId: "q", language: "English"}), /signed in|account changed/);
  }
  assert.deepEqual(writes, []);
});

test("web generation and answer checking bypass Hosting through the existing Deepseek HTTP adapter", async () => {
  seedQuestion();
  documents.set("tutor/config", configuration());
  const originalFetch = originalAdapter.client.fetchImpl;
  let requests = 0;
  originalAdapter.client.fetchImpl = async (url, request) => {
    requests++;
    assert.equal(url, "https://us-central1-readyherox.cloudfunctions.net/generateDeepseekText");
    assert.equal(request.method, "POST");
    const body = JSON.parse(request.body);
    assert.equal(typeof body.prompt, "string");
    assert.equal(Object.hasOwn(body, "useDirectFunction"), false);
    if (requests === 1) {
      assert.equal(body.maxTokens, 8192);
      assert.equal(sourceQuestionData(body.prompt).correctAnswerText, "60°");
      assert.equal(sourceQuestionData(body.prompt).svg, question().svg);
      return {ok: true, status: 200, text: async () => JSON.stringify({json: response()})};
    }
    assert.equal(body.maxTokens, 512);
    assert.equal(body.temperature, 0);
    return {ok: true, status: 200, text: async () => JSON.stringify({json: {isCorrect: true}})};
  };
  webLlm.registerLlmProvider("deepseek", originalAdapter);
  try {
    const set = await web.generateTutorMiniQuestionSet({questionId: "q", language: "English"});
    assert.equal(set.miniQuestions[2].expectedAnswer, "60°");
    assert.equal(requests, 1);
    const result = await web.checkTutorMiniQuestionAnswer({
      questionId: "q", language: "English", miniQuestionCount: 3, sequence: 1, answer: "One hundred and eighty degrees",
    });
    assert.deepEqual(result, {isCorrect: true});
    assert.equal(requests, 2);
    assert.equal(writes.length, 1);
  } finally {
    originalAdapter.client.fetchImpl = originalFetch;
    webLlm.registerLlmProvider("deepseek", {
      call() {throw new Error("Tutor must use generateText");}, generateText: generateLlmText,
    });
  }
});

test("web getter keeps the initial account guard during the cache lookup and generation fallback", async () => {
  const reference = {questionId: "q", language: "English", miniQuestionCount: 3};
  const path = setPath(reference);
  seedQuestion();
  documents.set("tutor/config", configuration());
  for (const cached of [false, true]) {
    if (cached) documents.set(path, {
      ...reference, ...response(), miniQuestionCount: 3,
      configUpdatedAt: baseTime, generatedAt: baseTime,
    });
    for (const nextUser of [null, {...student, uid: "changed"}]) {
      auth.currentUser = {...student};
      onRead = readPath => {if (readPath === path) auth.currentUser = nextUser;};
      await assert.rejects(() => web.getTutorMiniQuestionSet(reference), /signed in|account changed/);
    }
  }
  assert.equal(llmCalls.length, 0);
  assert.equal(writes.length, 0);
  documents.delete(path);
  onRead = null;
  for (const nextUser of [null, {...student, uid: "changed"}]) {
    auth.currentUser = {...student};
    onLlm = () => {auth.currentUser = nextUser;};
    await assert.rejects(() => web.getTutorMiniQuestionSet(reference), /signed in|account changed/);
  }
  assert.equal(writes.length, 0);
});

test("backend and web document keys, templates, schemas and feature APIs agree", async () => {
  for (const input of [
    {questionId: "q", language: "English"},
    {questionId: "题目%20", language: "中文"},
    {questionId: "a_b", language: "c"}, {questionId: "a", language: "b_c"},
    {questionId: "config", language: "English"},
  ]) {
    assert.equal(await webDocumentId(input), await backendDocumentId(input));
    assert.match(await webDocumentId(input), /^set-[a-f0-9]{64}$/);
    for (const miniQuestionCount of [3, 6]) {
      assert.deepEqual(webSetPath({...input, miniQuestionCount}), backendSetPath({...input, miniQuestionCount}));
    }
  }
  assert.notEqual(await backendDocumentId({questionId: "a_b", language: "c"}), await backendDocumentId({questionId: "a", language: "b_c"}));
  assert.deepEqual(webSetSchema, require("../../../functions/schema/tutor_schema.js").tutorMiniQuestionSetSchema);
  assert.deepEqual(Object.keys(web).sort(), Object.keys(backend).sort());
  assert.equal(webBuildPrompt({question: question(), configuration: configuration(), language: "English"}),
    backendBuildPrompt({question: question(), configuration: configuration(), language: "English"}));
});
