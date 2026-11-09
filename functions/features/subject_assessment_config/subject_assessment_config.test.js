const {test} = require("node:test");
const assert = require("node:assert/strict");
const backend = require("./domain/subject_assessment_config");
const {SubjectAssessmentConfigService} = require("./application/subject_assessment_config_service");

const topic = (changes = {}) => ({topicId: "reading", totalCount: 6, difficultyCounts: {easy: 2, medium: 3, hard: 1}, ...changes});
const configuration = (changes = {}) => ({syllabusId: "english", language: "English", expectedVersion: 0, topics: [topic()], ...changes});

test("web and backend share the configuration contract", async t => {
  const web = await import("../../../public/features/subject_assessment_config/domain/subject_assessment_config.js");
  const webSchema = await import("../../../public/config/firebase/subject_assessment_config_schema.js");
  assert.deepEqual(webSchema.subjectAssessmentConfigSchema, require("../../schema/subject_assessment_config_schema").subjectAssessmentConfigSchema);
  assert.deepEqual(webSchema.subjectAssessmentSettingsSchema, require("../../schema/subject_assessment_config_schema").subjectAssessmentSettingsSchema);
  for (const [name, domain] of [["backend", backend], ["web", web]]) {
    await t.test(name, () => {
      const input = configuration({language: "  ENGLISH  ", topics: [topic({questionType: "essay"})]});
      const normalized = domain.requireConfigurationInput(input);
      assert.equal(normalized.languageKey, "english");
      assert.equal(normalized.topics[0].questionType, "essay");
      assert.deepEqual(normalized.topics[0].difficultyCounts, {easy: 2, medium: 3, hard: 1});
      assert.equal(domain.canonicalScope(input, {languages: ["English"]}).language, "English");
      assert.equal(domain.requireScope({syllabusId: "english", language: "Bahasa Melayu"}).languageKey, "bahasa_melayu");
      for (const value of [-1, 1.5, NaN, Infinity, "6", null, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => domain.requireTopicAllocation(topic({totalCount: value})), /positive whole number/);
        assert.throws(() => domain.requireTopicAllocation(topic({difficultyCounts: {easy: value, medium: 3, hard: 1}})), /nonnegative whole number/);
      }
      assert.throws(() => domain.requireTopicAllocation(topic({difficultyCounts: {easy: 1, medium: 1, hard: 1}})), /add up/);
      assert.throws(() => domain.requireConfigurationInput(configuration({topics: []})), /at least one/);
      assert.throws(() => domain.requireConfigurationInput(configuration({topics: [topic(), topic()]})), /only once/);
      assert.throws(() => domain.requireConfigurationInput(configuration({expectedVersion: undefined})), /version/);
      assert.throws(() => domain.requireScope({syllabusId: "../english", language: "English"}), /valid document ID/);
      assert.throws(() => domain.canonicalScope(input, null), /not be found/);
      assert.throws(() => domain.canonicalScope(input, {languages: ["Tamil"]}), /not available/);
      assert.equal(domain.topicOption("reading", {topicName: "Reading"}, {}).questionType, "normal", "Legacy format defaults to MCQ");
      assert.equal(domain.topicOption("missing", null, null).questionType, null);
      assert.equal(domain.topicOption("invalid", {}, {frameworkType: "unknown"}).questionType, null);
      assert.throws(() => domain.resolveAllocations([topic({questionType: "essay"})], [{topicId: "reading", topicName: "Reading", questionType: "normal"}]), /format.*changed/);
      assert.throws(() => domain.resolveAllocations([topic()], []), /no longer belongs/);
      assert.equal(domain.resolveAllocations([topic()], [{topicId: "reading", questionType: "fillInTheBlanks"}])[0].questionType, "fillInTheBlanks");
    });
  }
});

test("global interval contract accepts positive whole days with no subject/language override", async () => {
  const web = await import("../../../public/features/subject_assessment_config/domain/subject_assessment_config.js");
  for (const domain of [backend, web]) {
    assert.deepEqual(domain.requireSettingsInput({intervalDays: 7, expectedVersion: 0}), {repeatMode: "interval", intervalDays: 7, expectedVersion: 0});
    assert.deepEqual(domain.requireSettingsInput({repeatMode: "none", expectedVersion: 0}), {repeatMode: "none", intervalDays: null, expectedVersion: 0});
    assert.deepEqual(domain.requireSettingsInput({repeatMode: "none", intervalDays: null, expectedVersion: 1}), {repeatMode: "none", intervalDays: null, expectedVersion: 1});
    for (const repeatMode of [null, "", "never", false]) assert.throws(() => domain.requireSettingsInput({repeatMode, intervalDays: 7, expectedVersion: 0}), /Choose/);
    for (const intervalDays of [0, 7, "7"]) assert.throws(() => domain.requireSettingsInput({repeatMode: "none", intervalDays, expectedVersion: 0}), /must not include/);
    assert.deepEqual(domain.readSettings({intervalDays: 30, version: 1}), {repeatMode: "interval", intervalDays: 30, version: 1, createdAt: undefined, updatedAt: undefined});
    assert.equal(domain.readSettings({repeatMode: "none", intervalDays: null, version: 2}).repeatMode, "none");
    for (const intervalDays of [undefined, null, "7", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => domain.requireSettingsInput({intervalDays, expectedVersion: 0}), /positive whole number/);
    }
    assert.throws(() => domain.requireSettingsInput({intervalDays: 7}), /version/);
    assert.throws(() => domain.requireSettingsInput({intervalDays: 7, expectedVersion: -1}), /version/);
    assert.throws(() => domain.requireSettingsInput({intervalDays: 7, expectedVersion: 0, syllabusId: "english"}), /only the global/);
    assert.throws(() => domain.readSettings({intervalDays: 0, version: 1}), /positive whole number/);
    assert.equal(domain.readSettings(null), null);
  }
});

test("global interval APIs require admin access and reject an account change after reading", async () => {
  let reads = 0, writes = 0;
  const repository = {getSettings: async () => {reads++; return {intervalDays: 7, version: 1};}, saveSettings: async () => {writes++;}};
  const denied = new SubjectAssessmentConfigService({repository, authorize: async () => {throw new Error("Administrator required");}});
  await assert.rejects(denied.getSettings(), /Administrator required/);
  await assert.rejects(denied.saveSettings({intervalDays: 7, expectedVersion: 0}), /Administrator required/);
  assert.equal(reads, 0); assert.equal(writes, 0);
  const changed = new SubjectAssessmentConfigService({repository, authorize: async () => ({uid: "admin", assertAccess() {throw new Error("Account changed");}})});
  await assert.rejects(changed.getSettings(), /Account changed/);
  assert.equal(writes, 0);
});

test("configuration APIs authorize reads and saves, reject invalid input before persistence", async () => {
  let reads = 0, writes = 0;
  const repository = {get: async () => {reads++;}, options: async () => {reads++;}, save: async () => {writes++;}};
  const denied = new SubjectAssessmentConfigService({repository, authorize: async () => {throw new Error("Administrator required");}});
  await assert.rejects(denied.get(configuration()), /Administrator required/);
  await assert.rejects(denied.options(configuration()), /Administrator required/);
  await assert.rejects(denied.save(configuration()), /Administrator required/);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  const allowed = new SubjectAssessmentConfigService({repository, authorize: async () => ({uid: "admin"})});
  await assert.rejects(allowed.save(configuration({topics: []})), /at least one/);
  assert.equal(writes, 0);
});

test("a changed account cannot receive loaded configuration data", async () => {
  const service = new SubjectAssessmentConfigService({repository: {get: async () => ({version: 1})},
    authorize: async () => ({uid: "admin", assertAccess() {throw new Error("Account changed");}})});
  await assert.rejects(service.get(configuration()), /Account changed/);
});
