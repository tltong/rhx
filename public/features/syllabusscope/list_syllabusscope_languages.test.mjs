import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import {ListSyllabusScopeLanguages as WebListLanguages} from "./application/list_syllabusscope_languages.js";
import * as web from "./syllabusscope_module.js";

const require = createRequire(import.meta.url);
const {ListSyllabusScopeLanguages: BackendListLanguages} = require(
  "../../../functions/features/syllabusscope/application/list_syllabusscope_languages.js"
);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalReadCollection = backendOps.readCollection;
const originalFirebase = globalThis.firebase;
const reads = [];
let records = [];
let readFailure = null;

function readScopes(path) {
  reads.push(path);
  if (readFailure) throw readFailure;
  return records;
}
backendOps.readCollection = async path => readScopes(path);
const backend = require("../../../functions/features/syllabusscope/syllabusscope_module.js");
const db = {
  collection(path) {
    return {
      async get() {
        return {docs: readScopes(path).map(record => ({
          id: record.id,
          exists: true,
          data: () => {
            const {id, ...data} = record;
            return data;
          },
        }))};
      },
      doc() {throw new Error("Language listing must never write documents.");},
    };
  },
};
const app = {firestore: () => db};
globalThis.firebase = {
  apps: [], firestore: () => db,
  initializeApp: () => app,
};

beforeEach(() => {
  records = []; reads.length = 0; readFailure = null;
});
after(() => {
  backendOps.readCollection = originalReadCollection;
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

for (const [layer, ListLanguages] of [["backend", BackendListLanguages], ["web", WebListLanguages]]) {
  test(layer + ": combines, trims, deduplicates and sorts languages while preserving their spelling", async () => {
    const scopes = [
      {languages: ["Malay", " English ", "english", "தமிழ்"]},
      {languages: ["French", "MALAY", "中文", ""]},
      {languages: []},
      {languages: ["french", "  "]},
    ];
    const before = structuredClone(scopes);
    let listCount = 0;
    const useCase = new ListLanguages({
      list: async () => {listCount++; return scopes;},
    });
    const languages = await useCase.execute();
    assert.deepEqual(languages, ["English", "French", "Malay", "தமிழ்", "中文"].sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(scopes, before);
    assert.equal(listCount, 1);
  });

  test(layer + ": no scopes or scopes without languages produce an empty list", async () => {
    for (const scopes of [[], [{languages: []}], [{}]]) {
      assert.deepEqual(await new ListLanguages({list: async () => scopes}).execute(), []);
    }
  });

  test(layer + ": repository failures propagate instead of returning a misleading empty list", async () => {
    const error = new Error("Scope read failed");
    await assert.rejects(() => new ListLanguages({list: async () => {throw error;}}).execute(), error);
  });
}

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": feature API reads all current and legacy scopes and stays read-only", async () => {
    records = [
      {id: "Singapore", country: "Singapore", languages: ["english", "French"], primary: {4: true}},
      {id: "Malaysia", country: "Malaysia", languages: ["Malay", "English", "malay"], levels: {primary: {1: true}}},
      {id: "NoLanguages", country: "NoLanguages"},
    ];
    const before = structuredClone(records);
    assert.deepEqual(await api.listSyllabusScopeLanguages(), ["English", "French", "Malay"]);
    assert.deepEqual(reads, ["syllabusScope"]);
    assert.deepEqual(records, before);
    assert.deepEqual(await api.listSyllabusScopeCountries(), ["Malaysia", "NoLanguages", "Singapore"]);

    records.push({id: "Vietnam", country: "Vietnam", languages: ["Vietnamese", "ENGLISH"]});
    assert.deepEqual(await api.listSyllabusScopeLanguages(), ["English", "French", "Malay", "Vietnamese"]);
  });

  test(layer + ": feature API returns an empty array when no languages are configured", async () => {
    assert.deepEqual(await api.listSyllabusScopeLanguages(), []);
    records = [{id: "Malaysia", country: "Malaysia"}];
    assert.deepEqual(await api.listSyllabusScopeLanguages(), []);
  });

  test(layer + ": feature API propagates Firestore read errors", async () => {
    readFailure = new Error("Firestore unavailable");
    await assert.rejects(() => api.listSyllabusScopeLanguages(), readFailure);
  });
}

test("the new language API is exported in both layers with matching existing APIs", () => {
  assert.equal(typeof backend.listSyllabusScopeLanguages, "function");
  assert.equal(typeof web.listSyllabusScopeLanguages, "function");
  assert.deepEqual(Object.keys(web).sort(), Object.keys(backend).sort());
});

test("language listing is not exposed as a Firebase callable", () => {
  const firebaseFunctions = require("../../../functions/index.js");
  assert.equal(Object.hasOwn(firebaseFunctions, "listSyllabusScopeLanguages"), false);
});

