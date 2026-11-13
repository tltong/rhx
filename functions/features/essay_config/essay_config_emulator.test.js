const assert = require("node:assert/strict"), test = require("node:test");
const {Firestore} = require("firebase-admin/firestore");
const {createEssayConfigFeature} = require("./essay_config_module");
const {createEssayConfigHandler} = require("../../essay_config");
const {FirestoreEssayQuestionGeneratorRepository} = require("../essay_question_generator/infrastructure/firestore_essay_question_generator_repository");
const {GenerateEssayQuestion} = require("../essay_question_generator/application/generate_essay_question");
const host = process.env.FIRESTORE_EMULATOR_HOST;
// Local, isolated demo project only. This test never uses the configured production account.
test("configuration persistence, authorization, references, stale saves, and immutable question snapshots", {skip: !host}, async () => {
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const projectId = "demo-rhx-essay-config";
  const db = new Firestore({projectId});
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: "DELETE"});
  const context = {auth: {uid: "admin"}};
  const feature = createEssayConfigFeature({getDb: () => db, requireAdministrator: async ctx => {
    if (ctx?.auth?.uid !== "admin") throw Object.assign(new Error("Administrator required"), {code: "permission-denied"}); return "admin";
  }});
  const handler = createEssayConfigHandler({apis: feature});
  try {
    await db.doc("essayQuestionGenerator/config").set({gradeInstructions: {primary: {3: "Legacy instructions"}}, gradeSupport: {primary: {3: {pictureEnabled: true}}}});
    let config = await feature.getEssayConfiguration({}, context);
    assert.equal(config.version, 0); assert.equal((await db.doc("essayConfig/settings").get()).exists, false);
    assert.equal(config.gradeSettings.primary[3].essayTypes[0].pictureEnabled, true);
    await assert.rejects(handler({data: {action: "saveEssayConfiguration", input: {...config, expectedVersion: 0}}}), /Sign in/);
    await assert.rejects(handler({auth: {uid: "student"}, data: {action: "saveEssayConfiguration", input: {...config, expectedVersion: 0}}}), /Administrator/);
    config = await feature.saveEssayConfiguration({...config, expectedVersion: 0}, context);
    assert.equal(config.version, 1); assert.equal((await db.collection("essayTypes").get()).size, 5);
    assert.equal((await db.collection("essayGradeConfigs").get()).size, 12);
    assert.equal((await db.doc("essayQuestionGenerator/config").get()).data().gradeInstructions.primary[3], "Legacy instructions");
    await assert.rejects(feature.saveEssayConfiguration({...config, expectedVersion: 0}, context), error => error.code === "aborted");
    config.essayTypes.push({...config.essayTypes[0], id: "arbitrary_document_id", name: "Custom type"});
    config.gradeSettings.primary[3].essayTypes = [{essayTypeId: "arbitrary_document_id", pictureEnabled: false}];
    config.gradeSettings.secondary[3].essayTypes = [{essayTypeId: "arbitrary_document_id", pictureEnabled: true}];
    config = await feature.saveEssayConfiguration({...config, expectedVersion: 1}, context);
    assert.equal((await feature.loadEssayConfiguration()).gradeSettings.secondary[3].essayTypes[0].pictureEnabled, true);
    const invalid = structuredClone(config); invalid.essayTypes = invalid.essayTypes.filter(type => type.id !== "arbitrary_document_id");
    await assert.rejects(feature.saveEssayConfiguration({...invalid, expectedVersion: 2}, context), /does not exist/);
    assert.equal((await feature.loadEssayConfiguration()).version, 2);
    // Save a real generated four-frame draft through the existing immutable question repository.
    config.gradeSettings.primary[3].essayTypes = [{essayTypeId: "fourFrameStory", pictureEnabled: true}];
    config = await feature.saveEssayConfiguration({...config, expectedVersion: 2}, context);
    const repository = new FirestoreEssayQuestionGeneratorRepository({getFirestoreDb: () => db, readDocument: async (collection, id) => (await db.doc(collection + "/" + id).get()).data() || null});
    repository.getConfig = () => feature.getGeneratorConfiguration();
    const generator = new GenerateEssayQuestion({repository, requireAdministrator: async () => ({uid: "admin"}),
      generateLlmText: async () => ({questionText: "Write a story following the pictures.", imagePrompt: "Four events", storyFrames: ["Find", "Help", "Recover", "Release"]}),
      createPicture: async input => ({storagePath: `essay-question-images/${input.questionId}.png`, url: "https://firebasestorage.googleapis.com/v0/b/demo/o/picture"})});
    const saved = await generator.execute({level: "primary", standard: 3, language: "English", difficulty: "medium", seed: "Bird rescue"});
    const loaded = await repository.getQuestionById(saved.questionId);
    assert.equal(loaded.essayTypeId, "fourFrameStory"); assert.deepEqual(loaded.storyFrames, ["Find", "Help", "Recover", "Release"]);
    assert.equal(loaded.essayType.pictureFrameCount, 4);
    await repository.saveQuestion({...loaded, seed: loaded.seedUsed});
    await assert.rejects(repository.saveQuestion({...loaded, storyFrames: ["Changed", "Help", "Recover", "Release"], seed: loaded.seedUsed}), /already exists/);
    const wire = await handler({auth: {uid: "admin"}, data: {action: "getEssayConfiguration"}});
    assert.equal(typeof wire.updatedAt, "string");
  } finally {await db.terminate();}
});
