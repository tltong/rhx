// Real web/backend configuration APIs against an isolated local database. No model calls.
const {test} = require("node:test"), assert = require("node:assert/strict");

test("standalone subject assessment configuration persistence", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const {getFirestoreDb} = require("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {FieldValue} = require("firebase-admin/firestore");
  const {createSubjectAssessmentConfigFeature} = require("./features/subject_assessment_config/subject_assessment_config_module");
  const api = createSubjectAssessmentConfigFeature({authorize: async () => ({uid: "backend-admin"})});
  const scope = {syllabusId: "english", language: "English"};
  const allocation = (topicId, count = 6, questionType) => ({topicId, ...(questionType ? {questionType} : {}), totalCount: count,
    difficultyCounts: {easy: 1, medium: count - 2, hard: 1}});
  const request = (changes = {}) => ({...scope, expectedVersion: 0,
    topics: [allocation("reading"), allocation("writing", 3), allocation("vocabulary", 2)], ...changes});
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await db.doc("syllabuses/english").set({subject: "English", languages: ["English", "Tamil"]});
  await db.doc("syllabuses/other").set({subject: "Other", languages: ["English"]});
  for (const [topic, type] of [["reading", "normal"], ["writing", "essay"], ["vocabulary", "fillInTheBlanks"]]) {
    await db.doc(`syllabuses/english/topics/${topic}`).set({topicName: topic, assessmentFrameworkIds: {english: type, tamil: "essay"}});
    // There are intentionally no framework levels or progression criteria.
    await db.doc(`assessmentFrameworks/${type}`).set({...(type === "normal" ? {} : {frameworkType: type})});
  }
  const sentinelPaths = ["studentPractices/student/assignedPractices/existing", "studentDailyMissions/student",
    "studentAssessmentProgress/student/syllabuses/english/topics/reading", "rewards/student", "reliability/config",
    "questions/existing", "essayPractices/existing", "fillInTheBlanksPractices/existing"];
  for (const path of sentinelPaths) await db.doc(path).set({preserve: true});

  await t.test("save derives formats, normalizes language, and uses one document for repeated saves", async () => {
    assert.equal(await api.getSubjectAssessmentConfig(scope), null);
    const options = await api.getSubjectAssessmentConfigOptions(scope);
    assert.deepEqual(options.topics.map(topic => topic.questionType), ["normal", "fillInTheBlanks", "essay"]);
    const saved = await api.saveSubjectAssessmentConfig(request({language: " ENGLISH "}));
    assert.equal(saved.language, "English");
    assert.equal(saved.languageKey, "english");
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.topics.map(topic => topic.questionType), ["normal", "essay", "fillInTheBlanks"]);
    assert.equal(saved.topics[2].totalCount, 2, "Fill-in-the-blanks counts whole passages");
    assert.equal(saved.createdBy, "backend-admin");
    assert.ok(saved.createdAt instanceof Date);
    const updated = await api.saveSubjectAssessmentConfig(request({expectedVersion: 1}));
    assert.equal(updated.version, 2);
    assert.equal(updated.createdAt.getTime(), saved.createdAt.getTime());
    assert.equal((await db.collection("subjectAssessmentConfigs/english/languages").get()).size, 1);
  });

  await t.test("language and syllabus configurations remain separate", async () => {
    const tamil = await api.saveSubjectAssessmentConfig(request({language: "tamil", topics: [allocation("reading", 4)]}));
    assert.equal(tamil.language, "Tamil");
    assert.equal(tamil.topics[0].questionType, "essay");
    assert.equal((await api.getSubjectAssessmentConfig(scope)).version, 2);
    assert.equal(await api.getSubjectAssessmentConfig({...scope, syllabusId: "other"}), null);
    assert.equal((await db.collection("subjectAssessmentConfigs/english/languages").get()).size, 2);
  });

  await t.test("invalid allocations, foreign topics, missing formats and overrides never replace the saved configuration", async () => {
    const before = await api.getSubjectAssessmentConfig(scope);
    await assert.rejects(api.saveSubjectAssessmentConfig(request({expectedVersion: 2, topics: [allocation("missing")]})), /no longer belongs/);
    await assert.rejects(api.saveSubjectAssessmentConfig(request({expectedVersion: 2, topics: [allocation("reading", 4, "essay")]})), /format.*changed/);
    await assert.rejects(api.saveSubjectAssessmentConfig(request({language: "French", expectedVersion: 2})), /not available/);
    await db.doc("syllabuses/english/topics/unconfigured").set({topicName: "Unconfigured"});
    await assert.rejects(api.saveSubjectAssessmentConfig(request({expectedVersion: 2, topics: [allocation("unconfigured")]})), /format/);
    await assert.rejects(api.saveSubjectAssessmentConfig(request({expectedVersion: 2, topics: [{...allocation("reading"), totalCount: 7}]})), /add up/);
    assert.deepEqual(await api.getSubjectAssessmentConfig(scope), before);
  });

  await t.test("simultaneous edits allow one save and reject the stale version", async () => {
    const results = await Promise.allSettled([
      api.saveSubjectAssessmentConfig(request({expectedVersion: 2, topics: [allocation("reading", 7)]})),
      api.saveSubjectAssessmentConfig(request({expectedVersion: 2, topics: [allocation("reading", 8)]})),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const rejected = results.find(result => result.status === "rejected");
    assert.match(rejected.reason.message, /another session/);
    assert.equal((await api.getSubjectAssessmentConfig(scope)).version, 3);
  });

  await t.test("a topic format change between loading and saving is rejected", async () => {
    await db.doc("syllabuses/english/topics/reading").update({assessmentFrameworkIds: {english: "essay", tamil: "essay"}});
    await assert.rejects(api.saveSubjectAssessmentConfig(request({expectedVersion: 3, topics: [allocation("reading", 4, "normal")]})), /format.*changed/);
    const saved = await api.saveSubjectAssessmentConfig(request({expectedVersion: 3, topics: [allocation("reading", 4, "essay")]}));
    assert.equal(saved.topics[0].questionType, "essay");
  });

  await t.test("one global interval persists independently of every subject and rejects stale saves", async () => {
    const configurations = await Promise.all([api.getSubjectAssessmentConfig(scope), api.getSubjectAssessmentConfig({...scope, language: "Tamil"})]);
    assert.equal(await api.getSubjectAssessmentSettings(), null, "An unset interval has no implicit default or read-time write");
    const first = await api.saveSubjectAssessmentSettings({intervalDays: 7, expectedVersion: 0});
    assert.equal(first.version, 1); assert.equal(first.intervalDays, 7); assert.equal(first.createdBy, "backend-admin");
    const second = await api.saveSubjectAssessmentSettings({intervalDays: 14, expectedVersion: 1});
    assert.equal(second.version, 2); assert.equal(second.createdAt.getTime(), first.createdAt.getTime());
    await assert.rejects(api.saveSubjectAssessmentSettings({intervalDays: 0, expectedVersion: 2}), /positive whole number/);
    await assert.rejects(api.saveSubjectAssessmentSettings({intervalDays: 7, expectedVersion: 2, language: "English"}), /only the global/);
    const simultaneous = await Promise.allSettled([21, 28].map(intervalDays => api.saveSubjectAssessmentSettings({intervalDays, expectedVersion: 2})));
    assert.equal(simultaneous.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(simultaneous.find(value => value.status === "rejected").reason.code, "aborted");
    assert.equal((await api.getSubjectAssessmentSettings()).version, 3);
    assert.equal((await db.collection("subjectAssessmentSettings").get()).size, 1);
    assert.deepEqual(await Promise.all([api.getSubjectAssessmentConfig(scope), api.getSubjectAssessmentConfig({...scope, language: "Tamil"})]), configurations);
  });

  await t.test("the real web API saves a configuration readable by the backend and checks administrator access", async () => {
    const previousFirebase = globalThis.firebase;
    const admin = {uid: "web-admin", email: "admin@example.test", emailVerified: true};
    const auth = {currentUser: admin};
    const app = {firestore: () => db, auth: () => auth, functions: () => ({httpsCallable: name => async () => {
      assert.equal(name, "isCurrentUserSiteAdmin");
      return {data: {isAdmin: auth.currentUser?.uid === admin.uid, emailVerified: auth.currentUser?.emailVerified, email: auth.currentUser?.email}};
    }})};
    const firestore = () => db; firestore.FieldValue = FieldValue;
    globalThis.firebase = {apps: [], initializeApp: () => app, firestore};
    try {
      const web = await import("../public/features/subject_assessment_config/subject_assessment_config_module.js");
      const saved = await web.saveSubjectAssessmentConfig(request({expectedVersion: 4, topics: [allocation("writing", 5, "essay")]}));
      assert.equal(saved.version, 5);
      assert.equal(saved.updatedBy, "web-admin");
      assert.equal(saved.createdBy, "backend-admin");
      assert.deepEqual(saved, await api.getSubjectAssessmentConfig(scope));
      assert.equal((await web.getSubjectAssessmentConfigOptions(scope)).configuration.version, 5);
      const settings = await web.saveSubjectAssessmentSettings({intervalDays: 30, expectedVersion: 3});
      assert.equal(settings.intervalDays, 30); assert.equal(settings.version, 4); assert.equal(settings.updatedBy, "web-admin");
      assert.equal(settings.createdBy, "backend-admin");
      assert.deepEqual(settings, await api.getSubjectAssessmentSettings());
      assert.deepEqual(settings, await web.getSubjectAssessmentSettings());
      const initialOnly = await web.saveSubjectAssessmentSettings({repeatMode: "none", intervalDays: null, expectedVersion: 4});
      assert.equal(initialOnly.repeatMode, "none"); assert.equal(initialOnly.intervalDays, null); assert.equal(initialOnly.version, 5);
      assert.equal(initialOnly.createdAt.getTime(), settings.createdAt.getTime());
      assert.deepEqual(initialOnly, await api.getSubjectAssessmentSettings());
      assert.deepEqual(initialOnly, await web.getSubjectAssessmentSettings());
      await assert.rejects(api.saveSubjectAssessmentSettings({repeatMode: "none", intervalDays: 7, expectedVersion: 5}), /must not include/);
      await assert.rejects(api.saveSubjectAssessmentSettings({repeatMode: "interval", intervalDays: 7, expectedVersion: 4}), /another session/);
      const repeating = await api.saveSubjectAssessmentSettings({repeatMode: "interval", intervalDays: 7, expectedVersion: 5});
      assert.equal(repeating.version, 6); assert.equal(repeating.repeatMode, "interval");
      assert.deepEqual(repeating, await web.getSubjectAssessmentSettings());
      auth.currentUser = {uid: "student", email: "student@example.test", emailVerified: true};
      await assert.rejects(web.saveSubjectAssessmentConfig(request({expectedVersion: 5})), /administrator/i);
      await assert.rejects(web.getSubjectAssessmentConfig(scope), /administrator/i);
      await assert.rejects(web.getSubjectAssessmentSettings(), /administrator/i);
      await assert.rejects(web.saveSubjectAssessmentSettings({intervalDays: 7, expectedVersion: 4}), /administrator/i);
      auth.currentUser = null;
      await assert.rejects(web.getSubjectAssessmentConfig(scope), /sign|auth/i);
      assert.equal((await api.getSubjectAssessmentConfig(scope)).version, 5);
    } finally {globalThis.firebase = previousFirebase;}
  });

  await t.test("legacy interval settings normalize on read without rewriting the saved record", async () => {
    const ref = db.doc("subjectAssessmentSettings/config");
    await ref.update({repeatMode: FieldValue.delete()});
    const before = await ref.get(), saved = await api.getSubjectAssessmentSettings(), after = await ref.get();
    assert.equal(saved.repeatMode, "interval"); assert.equal(saved.intervalDays, 7);
    assert.equal(after.data().repeatMode, undefined); assert.equal(after.updateTime.isEqual(before.updateTime), true);
  });

  await t.test("configuration never writes practices, missions, levels, rewards, reliability or pooled content", async () => {
    for (const path of sentinelPaths) assert.deepEqual((await db.doc(path).get()).data(), {preserve: true}, path);
    assert.deepEqual((await db.listCollections()).map(collection => collection.id).sort(), [...new Set([
      "syllabuses", "assessmentFrameworks", "subjectAssessmentConfigs", "subjectAssessmentSettings", ...sentinelPaths.map(path => path.split("/")[0]),
    ])].sort());
  });
});
