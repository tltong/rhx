import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import * as web from "./domain/news_config.js";
import {createStudentNewsFeature} from "./student_news_module.js";
const require = createRequire(import.meta.url);
const backend = require("../../../functions/features/student_news/domain/news_config");
const {createNewsAdministratorAccess} = require("../../../functions/features/student_news/infrastructure/news_config_access");
const {createStudentNewsHandler} = require("../../../functions/student_news");
const {createStudentNewsFeature: createBackendFeature} = require("../../../functions/features/student_news/student_news_module");

for (const [layer, api] of [["browser", web], ["backend", backend]]) {
  test(layer + ": defaults, inheritance, grade formats, and shared image settings", () => {
    const config = api.createDefaultNewsConfiguration();
    assert.deepEqual(config.defaultTargetWordCounts, {standardArticle: 400, multiPageArticle: 400, pictureStory: 50});
    assert.equal(Object.keys(config.gradeSettings.primary).length, 6);
    const criteria = {level: "primary", standard: 1};
    assert.equal(api.resolveNewsGradeSettings(config, criteria).pageCount, 5);
    config.articleTypes.pictureStory.photoCount = 7;
    assert.equal(api.resolveNewsGradeSettings(config, criteria).pageCount, 7);
    config.gradeSettings.primary[1].targetWordCount = 0;
    assert.equal(api.resolveNewsGradeSettings(config, criteria).targetWordCount, 0);
    assert.equal(api.resolveNewsGradeSettings(config, {level: "primary", standard: 2}).targetWordCount, 50);
    config.defaultTargetWordCounts.pictureStory = 60;
    assert.equal(api.resolveNewsGradeSettings(config, {level: "primary", standard: 2}).targetWordCount, 60);
    assert.equal(api.resolveNewsGradeSettings(config, criteria).targetWordCount, 0);
    const grade = config.gradeSettings.primary[3]; grade.targetWordCount = 120; grade.pageCount = 3;
    assert.equal(api.resolveNewsGradeSettings(config, {level: "primary", standard: 3}).pageCount, 3);
    assert.equal(api.resolveNewsGradeSettings(config, {level: "primary", standard: 3}).targetWordCount, 120);
    assert.equal(api.resolveNewsGradeSettings(config, {level: "primary", standard: 6}).pageCount, 1);
    assert.equal(api.createDefaultNewsConfiguration().articleTypes.pictureStory.photoCount, 5, "defaults are fresh objects");
  });
  test(layer + ": invalid types, zero words outside picture stories, invalid counts, incomplete saves and page conflicts fail", () => {
    const mutations = [
      c => c.gradeSettings.primary[1].articleTypeId = "unknown",
      c => c.gradeSettings.primary[6].targetWordCount = 0,
      c => c.gradeSettings.primary[1].targetWordCount = "0",
      c => c.gradeSettings.primary[1].pageCount = 2,
      c => c.gradeSettings.primary[6].pageCount = 2,
      c => c.articleTypes.pictureStory.photoCount = 0,
      c => c.articleTypes.standardArticle.photoType = "mixed",
      c => c.articleTypes.standardArticle.photoCount = 1.5,
      c => c.articleTypes.standardArticle.photoCount = 13,
      c => c.defaultMultiPageCount = -1,
      c => c.defaultTargetWordCounts.standardArticle = 0,
      c => c.gradeSettings.primary[3].pageCount = 21,
      c => c.gradeSettings.primary[3].targetWordCount = 10001,
      c => c.gradeSettings.primary[1].standard = 2,
      c => delete c.gradeSettings.secondary[6],
      c => c.discoveryInstructions = "x".repeat(16001),
      c => c.topicFilters = ["new field"],
      c => c.schemaVersion = 2,
    ];
    for (const mutate of mutations) {const config = api.createDefaultNewsConfiguration(); mutate(config); assert.throws(() => api.normalizeNewsConfiguration(config), error => error.code === "invalid-argument");}
  });
  test(layer + ": zero images and legacy language lists are excluded from saved configuration", () => {
    const config = api.createDefaultNewsConfiguration(); config.articleTypes.standardArticle.photoCount = 0;
    config.supportedLanguages = [" English ", "中文", "Bahasa Melayu"];
    config.gradeSettings.primary[1].additionalLlmInstructions = " Simple pictures. ";
    config.defaultTargetWordCounts.pictureStory = 0;
    const normalized = api.normalizeNewsConfiguration(config);
    assert.equal(Object.hasOwn(normalized, "supportedLanguages"), false);
    assert.equal(Object.hasOwn(api.createDefaultNewsConfiguration(), "supportedLanguages"), false);
    assert.equal(api.resolveNewsGradeSettings(normalized, {level: "primary", standard: 6}).photoCount, 0);
    assert.equal(api.resolveNewsGradeSettings(normalized, {level: "primary", standard: 1}).targetWordCount, 0);
    assert.match(api.resolveNewsGradeSettings(normalized, {level: "primary", standard: 1}).additionalLlmInstructions, /Simple pictures\.$/);
  });
}
test("browser and backend configuration rules remain identical", () => {
  assert.deepEqual(web.normalizeNewsConfiguration(web.createDefaultNewsConfiguration()), backend.normalizeNewsConfiguration(backend.createDefaultNewsConfiguration()));
});
test("news language responses follow Syllabus Scope and cannot be overridden by a configuration save", async () => {
  let languages = ["English"], saves = 0, failLanguages = false, config = backend.createDefaultNewsConfiguration();
  const feature = createBackendFeature({repository: {get: async () => config, save: async input => {saves++; config = {...input, version: saves}; return config;}},
    requireAdministrator: async () => "admin", listLanguages: async () => {if (failLanguages) throw new Error("Scope unavailable"); return languages;}});
  const context = {auth: {uid: "admin"}};
  assert.deepEqual((await feature.getNewsConfiguration({}, context)).supportedLanguages, ["English"]);
  languages = ["Chinese", "English"];
  assert.deepEqual((await feature.loadNewsConfiguration()).supportedLanguages, languages);
  const saved = await feature.saveNewsConfiguration({...config, supportedLanguages: ["Invented"], expectedVersion: 0}, context);
  assert.deepEqual(saved.supportedLanguages, languages);
  assert.equal(Object.hasOwn(config, "supportedLanguages"), false);
  languages = [];
  assert.deepEqual((await feature.getNewsConfiguration({}, context)).supportedLanguages, []);
  failLanguages = true;
  await assert.rejects(feature.getNewsConfiguration({}, context), /Scope unavailable/);
  await assert.rejects(feature.saveNewsConfiguration({...config, expectedVersion: 1}, context), /Scope unavailable/);
  assert.equal(saves, 1, "a language lookup failure cannot commit a save");
});
test("save authorization uses current Firebase account status and site-admin membership", async () => {
  const valid = {email: "admin@example.test", emailVerified: true, disabled: false};
  for (const user of [{...valid, disabled: true}, {...valid, emailVerified: false}, {...valid, email: ""}, {...valid, email: "student@example.test"}]) {
    const authorize = createNewsAdministratorAccess({getUser: async () => user, isAdministrator: async email => email === valid.email});
    await assert.rejects(authorize({auth: {uid: "user", token: {email: valid.email, email_verified: true}}}), error => error.code === "permission-denied");
  }
  const authorize = createNewsAdministratorAccess({getUser: async uid => {assert.equal(uid, "admin"); return valid;}, isAdministrator: async () => true});
  assert.equal(await authorize({auth: {uid: "admin"}}), "admin");
  await assert.rejects(authorize({}), error => error.code === "unauthenticated");
});
test("callable exposes only configuration operations and sanitizes unexpected errors", async () => {
  const handler = createStudentNewsHandler({apis: {getNewsConfiguration: async () => ({version: 0}), loadNewsConfiguration: async () => {throw new Error("must not run");}}});
  await assert.rejects(handler({data: {action: "getNewsConfiguration"}}), error => error.code === "unauthenticated");
  await assert.rejects(handler({auth: {uid: "student"}, data: {action: "loadNewsConfiguration"}}), error => error.code === "invalid-argument");
  assert.equal((await handler({auth: {uid: "student"}, data: {action: "getNewsConfiguration"}})).updatedAt, null);
});
test("browser wrapper uses studentNews and rejects account changes before and after transport", async () => {
  let uid = "admin", phase = "normal", calls = 0;
  const feature = createStudentNewsFeature({requireUser: () => ({uid}), getApp: async () => {
    if (phase === "before") uid = "other";
    return {functions: region => {assert.equal(region, "us-central1"); return {httpsCallable: name => {
      assert.equal(name, "studentNews"); return async ({action}) => {calls++; assert.equal(action, "getNewsConfiguration"); if (phase === "after") uid = "other"; return {data: {version: 0, updatedAt: null}};};
    }};}};
  }});
  assert.equal((await feature.getNewsConfiguration()).version, 0);
  phase = "before"; await assert.rejects(feature.getNewsConfiguration(), /account changed/); assert.equal(calls, 1);
  phase = "after"; uid = "admin"; await assert.rejects(feature.getNewsConfiguration(), /account changed/); assert.equal(calls, 2);
});
