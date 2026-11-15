const assert = require("node:assert/strict"), test = require("node:test"), fs = require("node:fs"), path = require("node:path");
const {Firestore} = require("firebase-admin/firestore");
const {createStudentNewsFeature} = require("./student_news_module");
const {FirestoreNewsConfigRepository} = require("./infrastructure/firestore_news_config_repository");
const {createDefaultNewsConfiguration} = require("./domain/news_config");
const {createStudentNewsHandler} = require("../../student_news");
const {ListSyllabusScopeLanguages} = require("../syllabusscope/application/list_syllabusscope_languages");
const {FirestoreSyllabusScopeRepository} = require("../syllabusscope/infrastructure/firestore_syllabusscope_repository");
const host = process.env.FIRESTORE_EMULATOR_HOST;
test("news configuration atomic persistence, races, authorization, wire format, and malformed-storage protection", {skip: !host}, async () => {
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const projectId = "demo-rhx-news-config", db = new Firestore({projectId});
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: "DELETE"});
  const languages = new ListSyllabusScopeLanguages(new FirestoreSyllabusScopeRepository({readCollection: async collection => (await db.collection(collection).get()).docs.map(doc => ({...doc.data(), id: doc.id}))}));
  const feature = createStudentNewsFeature({repository: new FirestoreNewsConfigRepository({getDb: () => db}), listLanguages: () => languages.execute(), requireAdministrator: async context => {
    if (context?.auth?.uid !== "admin") throw Object.assign(new Error("Administrator required"), {code: "permission-denied"}); return "admin";
  }}), handler = createStudentNewsHandler({apis: feature}), auth = {uid: "admin"};
  try {
    const config = await handler({auth, data: {action: "getNewsConfiguration"}});
    assert.equal(config.version, 0); assert.equal((await db.collection("newsConfig").get()).size, 0);
    assert.deepEqual(config.supportedLanguages, [], "no fallback language is invented for empty scope");
    await db.doc("syllabusScope/Malaysia").set({country: "Malaysia", languages: ["English", "Malay", "english"], levels: {}});
    await db.doc("syllabusScope/Singapore").set({country: "Singapore", languages: ["English", "Chinese"], levels: {}});
    await assert.rejects(handler({auth: {uid: "student"}, data: {action: "saveNewsConfiguration", input: {...config, expectedVersion: 0}}}), error => error.code === "permission-denied");
    await assert.rejects(handler({auth, data: {action: "saveNewsConfiguration", input: config}}), error => error.code === "invalid-argument");
    config.gradeSettings.primary[1].targetWordCount = 0; config.articleTypes.pictureStory.photoCount = 6;
    config.supportedLanguages = ["Invented override"]; config.additionalLlmInstructions = "Common marker";
    let saved = await handler({auth, data: {action: "saveNewsConfiguration", input: {...config, expectedVersion: 0}}});
    assert.equal(saved.version, 1); assert.equal(typeof saved.updatedAt, "string");
    assert.deepEqual(saved.supportedLanguages, ["Chinese", "English", "Malay"]);
    assert.equal(Object.hasOwn((await db.doc("newsConfig/settings").get()).data(), "supportedLanguages"), false);
    // A deployed version-one document may still have the old copied list.
    await db.doc("newsConfig/settings").update({supportedLanguages: ["Legacy language"]});
    assert.deepEqual((await feature.loadNewsConfiguration()).supportedLanguages, ["Chinese", "English", "Malay"]);
    await db.doc("syllabusScope/Singapore").update({languages: ["English", "Tamil"]});
    assert.deepEqual((await feature.loadNewsConfiguration()).supportedLanguages, ["English", "Malay", "Tamil"]);
    assert.equal((await feature.loadNewsConfiguration()).version, 1, "scope changes need no news-config save");
    const docs = await db.collection("newsConfig").get(); assert.equal(docs.size, 16);
    for (const doc of docs.docs) {assert.equal(doc.data().updatedBy, "admin"); assert.equal(doc.data().version, 1); assert.ok(doc.data().updatedAt.toDate());}
    assert.equal((await db.doc("newsConfig/grade_primary_1").get()).data().targetWordCount, 0);
    assert.equal((await db.doc("newsConfig/type_pictureStory").get()).data().photoCount, 6);
    assert.equal((await db.collection("newsArticleTypes").get()).size, 0);
    assert.equal((await db.collection("newsGradeConfigs").get()).size, 0);
    const effective = await feature.getEffectiveNewsGradeSettings({level: "primary", standard: 1});
    assert.equal(effective.pageCount, 6); assert.equal(effective.targetWordCount, 0); assert.match(effective.additionalLlmInstructions, /Common marker/);
    const outcomes = await Promise.allSettled(["First writer", "Second writer"].map(marker => feature.saveNewsConfiguration({...saved, additionalLlmInstructions: marker, expectedVersion: 1}, {auth})));
    assert.equal(outcomes.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(value => value.status === "rejected").reason.code, "aborted");
    saved = await feature.loadNewsConfiguration(); assert.equal(saved.version, 2);
    assert.equal(Object.hasOwn((await db.doc("newsConfig/settings").get()).data(), "supportedLanguages"), false, "next save removes the legacy copy");
    assert.equal(saved.additionalLlmInstructions, outcomes.find(value => value.status === "fulfilled").value.additionalLlmInstructions);
    const invalid = structuredClone({...saved, expectedVersion: 2}); invalid.articleTypes.pictureStory.photoCount = 0;
    await assert.rejects(feature.saveNewsConfiguration(invalid, {auth}), error => error.code === "invalid-argument");
    assert.equal((await feature.loadNewsConfiguration()).version, 2);
    await db.doc("newsConfig/grade_primary_1").delete();
    await assert.rejects(feature.loadNewsConfiguration(), error => error.code === "failed-precondition");
    await assert.rejects(feature.saveNewsConfiguration({...saved, expectedVersion: 2}, {auth}), error => error.code === "failed-precondition");
  } finally {await db.terminate();}
});

test("newsConfig client reads and writes respect real Firestore rules including the generic fallback", {skip: !host}, async () => {
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const project = "demo-rhx-news-rules", base = `http://${host}`, documents = `/v1/projects/${project}/databases/(default)/documents/`;
  function token(uid) {
    if (uid === "owner") return "owner";
    const now = Math.floor(Date.now() / 1000), part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    return part({alg: "none", typ: "JWT"}) + "." + part({iss: `https://securetoken.google.com/${project}`, aud: project, sub: uid, user_id: uid, iat: now, exp: now + 3600, email: uid + "@example.test", email_verified: true}) + ".";
  }
  async function request(method, url, data, uid = "owner") {
    return fetch(base + url, {method, headers: {"Content-Type": "application/json", ...(uid ? {Authorization: "Bearer " + token(uid)} : {})}, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
  }
  const rules = fs.readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8");
  // __dirname is functions/features/student_news; the rules live at repository root.
  const compiled = await request("PUT", `/emulator/v1/projects/${project}:securityRules`, {rules: {files: [{name: "firestore.rules", content: rules}]}});
  assert.equal(compiled.status, 200, await compiled.text());
  const body = {fields: {kind: {stringValue: "settings"}}};
  assert.equal((await request("PATCH", documents + "siteAdmins/admin@example.test", {})).status, 200);
  for (const id of ["settings", "type_pictureStory", "grade_primary_1"]) {
    assert.equal((await request("PATCH", documents + "newsConfig/" + id, body)).status, 200);
    assert.equal((await request("GET", documents + "newsConfig/" + id, undefined, "student")).status, 200);
    assert.equal((await request("GET", documents + "newsConfig/" + id, undefined, null)).status, 403);
    for (const uid of ["student", "admin", null]) {
      assert.equal((await request("PATCH", documents + "newsConfig/" + id, body, uid)).status, 403);
      assert.equal((await request("DELETE", documents + "newsConfig/" + id, undefined, uid)).status, 403);
    }
  }
  assert.equal((await request("PATCH", documents + "newsConfig/injected/children/x", body, "admin")).status, 403);
  for (const location of ["newsStoryIdentities/identity", "newsStoryIdentities/_state", "newsStories/story", "newsStories/story/media/asset", "newsEditions/edition", "newsEditions/edition/vocabulary/set", "newsEditions/edition/vocabulary/set/meanings/meaning", "newsEditions/_keys/items/key", "newsQuestionSets/set", "newsQuestionSets/set/languages/language", "studentNews/student/questionAttempts/attempt", "newsGenerations/job/questionAttempts/admin", "newsGenerations/job", "newsGenerations/_scopes/items/key", "studentNews/student/daily/day", "studentNews/student/history/story"]) {
    assert.equal((await request("PATCH", documents + location, body)).status, 200);
    for (const uid of ["student", "admin", null]) {
      assert.equal((await request("GET", documents + location, undefined, uid)).status, 403);
      assert.equal((await request("PATCH", documents + location, body, uid)).status, 403);
      assert.equal((await request("DELETE", documents + location, undefined, uid)).status, 403);
    }
  }
  for (const location of ["rewards/student", "rewards/student/categories/newsArticleCompletion", "rewards/student/categories/newsArticleCompletion/history/article", "rewards/student/categories/newsAllCorrect/history/article"]) {
    assert.equal((await request("PATCH", documents + location, body)).status, 200);
    assert.equal((await request("GET", documents + location, undefined, "student")).status, 200);
    assert.equal((await request("GET", documents + location, undefined, "stranger")).status, 403);
    assert.equal((await request("PATCH", documents + location, body, "student")).status, 403);
    assert.equal((await request("DELETE", documents + location, undefined, "student")).status, 403);
    assert.equal((await request("PATCH", documents + location, body, "admin")).status, 200);
  }
  assert.equal((await request("PATCH", documents + "rewards/config", body, "student")).status, 403);
  assert.equal((await request("PATCH", documents + "rewards/config", body, "admin")).status, 200);
});
