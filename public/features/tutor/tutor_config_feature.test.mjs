import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./tutor_module.js";
import * as webSchema from "../../config/firebase/tutor_schema.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
const documents = new Map();
const reads = [];
const writes = [];
const callables = [];
const configPath = "tutor/config";
const baseTime = new Date("2026-10-14T00:00:00Z");
const admin = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...admin}};
let readFailure = null;
let writeFailure = null;
let onAdminCheck = null;
let omitSavedDocument = false;

function reference(path) {
  return {
    id: path.split("/").at(-1), path,
    async get() {
      reads.push(path);
      if (readFailure) throw readFailure;
      return {id: this.id, exists: documents.has(path), data: () => documents.get(path)};
    },
    async set(data, options) {
      if (writeFailure) throw writeFailure;
      writes.push({path, data, options});
      const savedAt = new Date(baseTime.getTime() + writes.length * 1000);
      if (!omitSavedDocument) {
        documents.set(path, {
          ...(options?.merge ? documents.get(path) : {}), ...data,
          updatedAt: {toDate: () => savedAt},
        });
      }
    },
  };
}
const db = {collection: path => ({doc: id => reference(path + "/" + id)})};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {
  firestore: () => db, auth: () => auth,
  functions(region) {
    assert.equal(region, "us-central1");
    return {httpsCallable(name) {
      assert.equal(name, "isCurrentUserSiteAdmin", "Tutor configuration must not add callable gateways.");
      return async () => {
        callables.push(name);
        const user = auth.currentUser;
        const status = {
          email: user?.email?.trim().toLowerCase() || null,
          emailVerified: user?.emailVerified === true,
          isAdmin: user?.email?.trim().toLowerCase() === admin.email,
          bootstrapAvailable: false,
        };
        onAdminCheck?.();
        return {data: status};
      };
    }};
  },
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.readDocument = async (path, id) => {
  const snapshot = await reference(path + "/" + id).get();
  return snapshot.exists ? snapshot.data() : null;
};
backendOps.writeDocument = (path, id, data, options) => reference(path + "/" + id).set(data, options);
const backend = require("../../../functions/features/tutor/tutor_module.js");
const backendSchema = require("../../../functions/schema/tutor_schema.js");

function configInput(changes = {}) {
  return {
    miniQuestionCount: 3,
    promptInstructions: "Lead the student through one reasoning step at a time.",
    correctAnswerMessage: {English: "Well done!", "中文": "答对了！", "Bahasa Melayu": "Bagus!"},
    incorrectAnswerMessage: {English: "Try again.", "中文": "再试一次。", "Bahasa Melayu": "Cuba lagi."},
    ...changes,
  };
}
function saveConfig(api, input, context = {updatedBy: admin.uid}) {
  return api === backend ? api.saveTutorConfig(input, context) : api.saveTutorConfig(input);
}

beforeEach(() => {
  documents.clear(); reads.length = 0; writes.length = 0; callables.length = 0;
  readFailure = null; writeFailure = null; onAdminCheck = null; omitSavedDocument = false;
  auth.currentUser = {...admin};
});
after(() => {
  Object.assign(backendOps, originalBackendOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

test("both layers share the tutor/config schema, APIs and default count", () => {
  assert.deepEqual(webSchema.tutorConfigSchema, backendSchema.tutorConfigSchema);
  assert.equal(webSchema.TUTOR_COLLECTION, "tutor");
  assert.equal(webSchema.TUTOR_CONFIG_DOCUMENT_ID, "config");
  assert.equal(web.DEFAULT_TUTOR_MINI_QUESTION_COUNT, 3);
  assert.equal(backend.DEFAULT_TUTOR_MINI_QUESTION_COUNT, 3);
  for (const api of [backend, web]) {
    assert.equal(typeof api.getTutorConfig, "function");
    assert.equal(typeof api.saveTutorConfig, "function");
  }
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": unsaved configuration returns null without persisting defaults", async () => {
    assert.equal(await api.getTutorConfig(), null);
    assert.deepEqual(reads, [configPath]);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": configuration round trips dynamic language maps and trusted metadata", async () => {
    const input = configInput({miniQuestionCount: 6, updatedBy: "spoofed", updatedAt: new Date(0), studentId: "discard"});
    const before = structuredClone(input);
    const saved = await saveConfig(api, input);
    assert.deepEqual(input, before);
    assert.equal(saved.miniQuestionCount, 6);
    assert.equal(saved.promptInstructions, input.promptInstructions);
    assert.deepEqual(saved.correctAnswerMessage, input.correctAnswerMessage);
    assert.deepEqual(saved.incorrectAnswerMessage, input.incorrectAnswerMessage);
    assert.equal(saved.updatedBy, admin.uid);
    assert.equal(saved.updatedAt.getTime(), baseTime.getTime() + 1000);
    assert.ok(Object.isFrozen(saved));
    assert.ok(Object.isFrozen(saved.correctAnswerMessage));
    assert.ok(Object.isFrozen(saved.incorrectAnswerMessage));
    assert.deepEqual(await api.getTutorConfig(), saved);
    assert.equal(writes[0].path, configPath);
    assert.equal(writes[0].options.merge, false);
    assert.deepEqual(Object.keys(documents.get(configPath)).sort(), [
      "correctAnswerMessage", "incorrectAnswerMessage", "miniQuestionCount",
      "promptInstructions", "updatedAt", "updatedBy",
    ]);
    assert.equal(documents.size, 1);
  });

  test(layer + ": saves replace removed language keys without touching reusable sets", async () => {
    const tutorSet = {language: "English", miniQuestions: [{questionText: "What is the first step?"}]};
    documents.set("tutor/question-1", tutorSet);
    await saveConfig(api, configInput());
    await saveConfig(api, configInput({
      miniQuestionCount: 1, correctAnswerMessage: {English: "Correct"},
      incorrectAnswerMessage: {English: "Please try again"},
    }));
    assert.deepEqual((await api.getTutorConfig()).correctAnswerMessage, {English: "Correct"});
    assert.equal(documents.get("tutor/question-1"), tutorSet);
    assert.deepEqual([...documents.keys()].sort(), [configPath, "tutor/question-1"]);
    assert.ok(writes.every(write => write.path === configPath && write.options.merge === false));
  });

  test(layer + ": missing, fractional, nonpositive and unsafe question counts never write", async () => {
    for (const miniQuestionCount of [undefined, null, 0, -1, 1.5, "3", true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(() => saveConfig(api, configInput({miniQuestionCount})), /miniQuestionCount/);
    }
    for (const input of [null, [], {}, new Date()]) await assert.rejects(() => saveConfig(api, input));
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": prompt instructions must be text and may be empty", async () => {
    for (const promptInstructions of [undefined, null, 3, {}, []]) {
      await assert.rejects(() => saveConfig(api, configInput({promptInstructions})), /promptInstructions/);
    }
    assert.deepEqual(writes, []);
    assert.equal((await saveConfig(api, configInput({promptInstructions: "  "}))).promptInstructions, "");
  });

  test(layer + ": feedback maps require nonempty messages for the same language keys", async () => {
    for (const field of ["correctAnswerMessage", "incorrectAnswerMessage"]) {
      for (const value of [undefined, null, [], new Date(), {}, {English: ""}, {English: " "}, {English: 1}, {"": "ok"}, {" English ": "ok"}, {"__reserved__": "ok"}]) {
        await assert.rejects(() => saveConfig(api, configInput({[field]: value})));
      }
    }
    await assert.rejects(() => saveConfig(api, configInput({incorrectAnswerMessage: {English: "Try again"}})), /same language keys/);
    await assert.rejects(() => saveConfig(api, configInput({
      correctAnswerMessage: {English: "Correct"}, incorrectAnswerMessage: {French: "Encore"},
    })), /same language keys/);
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
  });

  test(layer + ": arbitrary languages are preserved and message whitespace is trimmed", async () => {
    const correct = Object.create(null);
    correct["தமிழ்"] = " சரி! ";
    correct["en-GB"] = " Good! ";
    const saved = await saveConfig(api, configInput({
      correctAnswerMessage: correct,
      incorrectAnswerMessage: {"en-GB": " Try again. ", "தமிழ்": " மீண்டும் முயற்சி செய். "},
    }));
    assert.deepEqual(saved.correctAnswerMessage, {"தமிழ்": "சரி!", "en-GB": "Good!"});
    assert.deepEqual(saved.incorrectAnswerMessage, {"en-GB": "Try again.", "தமிழ்": "மீண்டும் முயற்சி செய்."});
  });

  test(layer + ": caller mutations while authorization is pending cannot change the saved input", async () => {
    const input = configInput();
    const pending = saveConfig(api, input);
    input.miniQuestionCount = 99;
    input.promptInstructions = "changed";
    input.correctAnswerMessage.English = "changed";
    delete input.incorrectAnswerMessage["中文"];
    const saved = await pending;
    assert.equal(saved.miniQuestionCount, 3);
    assert.equal(saved.promptInstructions, configInput().promptInstructions);
    assert.deepEqual(saved.correctAnswerMessage, configInput().correctAnswerMessage);
    assert.deepEqual(saved.incorrectAnswerMessage, configInput().incorrectAnswerMessage);
  });

  test(layer + ": corrupt stored configuration is reported without creating replacement defaults", async () => {
    const valid = {...configInput(), updatedAt: baseTime, updatedBy: admin.uid};
    for (const changes of [
      {miniQuestionCount: 0}, {promptInstructions: null}, {correctAnswerMessage: {}},
      {incorrectAnswerMessage: {English: "wrong"}}, {updatedAt: null},
      {updatedAt: new Date(NaN)}, {updatedBy: ""},
    ]) {
      documents.set(configPath, {...valid, ...changes});
      await assert.rejects(() => api.getTutorConfig());
    }
    assert.deepEqual(writes, []);
  });

  test(layer + ": read and write failures propagate and failed writes leave configuration intact", async () => {
    readFailure = new Error("Read unavailable");
    await assert.rejects(() => api.getTutorConfig(), /Read unavailable/);
    readFailure = null;
    const saved = await saveConfig(api, configInput());
    const before = documents.get(configPath);
    writeFailure = new Error("Write unavailable");
    await assert.rejects(() => saveConfig(api, configInput({miniQuestionCount: 6})), /Write unavailable/);
    assert.equal(documents.get(configPath), before);
    assert.equal((await api.getTutorConfig()).miniQuestionCount, saved.miniQuestionCount);
    assert.equal(writes.length, 1);
  });

  test(layer + ": a missing post-save document is an error rather than a successful null result", async () => {
    omitSavedDocument = true;
    await assert.rejects(() => saveConfig(api, configInput()), /could not be read/);
  });
}

test("backend saves require trusted administrator context and ignore caller-supplied metadata", async () => {
  for (const context of [null, {}, {updatedBy: ""}, {updatedBy: 1}]) {
    await assert.rejects(() => backend.saveTutorConfig(configInput({updatedBy: "spoofed"}), context), /administrator UID/);
  }
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

test("web APIs require sign-in before reading or saving", async () => {
  auth.currentUser = null;
  await assert.rejects(() => web.getTutorConfig(), /signed in/);
  await assert.rejects(() => web.saveTutorConfig(configInput()), /signed in/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

test("signed-in students can read configuration but cannot save it", async () => {
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: false};
  assert.equal(await web.getTutorConfig(), null);
  await assert.rejects(() => web.saveTutorConfig(configInput()), /Verify|administrator/);
  assert.deepEqual(writes, []);
});

test("unverified administrators and verified non-administrators cannot save configuration", async () => {
  for (const user of [
    {...admin, emailVerified: false},
    {uid: "student-1", email: "student@example.com", emailVerified: true},
  ]) {
    auth.currentUser = user;
    await assert.rejects(() => web.saveTutorConfig(configInput()));
  }
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

test("web saves reject account, email and verification changes during the administrator check", async () => {
  for (const nextUser of [null, {...admin, uid: "changed"}, {...admin, email: "changed@example.com"}, {...admin, emailVerified: false}]) {
    auth.currentUser = {...admin};
    onAdminCheck = () => {auth.currentUser = nextUser;};
    await assert.rejects(() => web.saveTutorConfig(configInput()), /signed in|account changed/);
  }
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

