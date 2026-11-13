import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import * as web from "./domain/essay_config.js";
import {GenerateEssayQuestion as WebGenerate} from "../essay_question_generator/application/generate_essay_question.js";
import {normalizeDraft as durableDraft} from "../student_essay_practice_generator/domain/essay_generation.js";
import {buildEssayScoringPrompt} from "../essay_scoring/application/build_essay_scoring_prompt.js";
const require = createRequire(import.meta.url);
const back = require("../../../functions/features/essay_config/domain/essay_config");
const {GenerateEssayQuestion: BackendGenerate} = require("../../../functions/features/essay_question_generator/application/generate_essay_question");
const criteria = {level: "primary", standard: 3, language: "English", difficulty: "easy", seed: "A helpful friend", save: false};
const frames = ["A child finds an injured bird", "The child calls an adult", "They care for the bird", "They release the recovered bird"];
const picture = {storagePath: "essay-question-images/generated.png", url: "https://firebasestorage.googleapis.com/v0/b/demo/o/test.png"};
for (const [layer, api, Generate] of [["web", web, WebGenerate], ["backend", back, BackendGenerate]]) {
  test(layer + ": legacy settings retain grade instructions, minimums, pictures and suggestions without enabling new types", () => {
    const config = api.fromLegacyConfiguration({gradeInstructions: {primary: {3: "Age appropriate"}}, gradeWordCountRequirements: {primary: {3: {minWords: 60}}}, gradeSupport: {primary: {3: {pictureEnabled: true, helpingWordsEnabled: true, helpingWordCount: 4}}}});
    assert.equal(config.essayTypes.length, 5);
    const grade = config.gradeSettings.primary[3];
    assert.equal(grade.additionalLlmInstructions, "Age appropriate"); assert.equal(grade.wordCountRequirement.minWords, 60);
    assert.equal(grade.helpingWordCount, 4); assert.equal(grade.helpingWordsEnabled, true);
    assert.deepEqual(grade.essayTypes, [{essayTypeId: "normalEssay", pictureEnabled: true}]);
    assert.deepEqual(config.gradeSettings.secondary[3].essayTypes, [{essayTypeId: "normalEssay", pictureEnabled: false}]);
  });
  test(layer + ": any catalog ID can be referenced with different photo choices per grade", () => {
    const config = api.fromLegacyConfiguration();
    config.essayTypes.push({...config.essayTypes[0], id: "custom_abc", name: "Custom task"});
    config.gradeSettings.primary[3].essayTypes = [{essayTypeId: "custom_abc", pictureEnabled: true}];
    config.gradeSettings.primary[5].essayTypes = [{essayTypeId: "custom_abc", pictureEnabled: false}];
    const saved = api.normalizeEssayConfiguration(config);
    assert.equal(api.resolveEssayType(saved, {...criteria, essayTypeId: "custom_abc"}).settings.pictureEnabled, true);
    assert.equal(api.resolveEssayType(saved, {...criteria, standard: 5, essayTypeId: "custom_abc"}).settings.pictureEnabled, false);
    assert.throws(() => api.resolveEssayType(saved, {...criteria, essayTypeId: "writeLetter"}), /not available/);
  });
  test(layer + ": missing/duplicate references and deselected required pictures are rejected", () => {
    const config = api.fromLegacyConfiguration(), grade = config.gradeSettings.primary[3];
    for (const refs of [[{essayTypeId: "missing", pictureEnabled: false}], [{essayTypeId: "fourFrameStory", pictureEnabled: false}],
      [{essayTypeId: "normalEssay", pictureEnabled: false}, {essayTypeId: "normalEssay", pictureEnabled: true}]]) {
      grade.essayTypes = refs; assert.throws(() => api.normalizeEssayConfiguration(config));
    }
    grade.essayTypes = [{essayTypeId: "normalEssay", pictureEnabled: "false"}]; assert.throws(() => api.normalizeEssayConfiguration(config));
    grade.essayTypes = []; assert.throws(() => api.resolveEssayType(config, criteria), /not available/);
  });
  test(layer + ": all five type definitions drive generation and preserve identity", async () => {
    const config = api.fromLegacyConfiguration();
    for (const type of config.essayTypes) {
      config.gradeSettings.primary[3].essayTypes = [{essayTypeId: type.id, pictureEnabled: type.pictureRequirement === "required"}];
      type.gradeInstructions.primary_3 = "TYPE_GRADE_MARKER";
      let prompt;
      const generator = new Generate({repository: {getConfig: async () => config, createQuestionId: () => "generated"},
        requireAdministrator: async () => ({uid: "admin"}), generateLlmText: async value => {
          prompt = value; return {questionText: "Writing task", imagePrompt: "Bird rescue", ...(type.pictureFrameCount > 1 ? {storyFrames: frames} : {})};
        }, createPicture: async input => {assert.deepEqual(input.storyFrames, frames); return picture;}});
      const result = await generator.execute({...criteria, essayTypeId: type.id});
      assert.equal(result.essayTypeId, type.id); assert.equal(result.essayType.name, type.name);
      assert.ok(prompt.includes(type.llmInstructions)); assert.match(prompt, /TYPE_GRADE_MARKER/);
      assert.equal(durableDraft(result, {level: "primary", standard: 3, language: "English", difficulty: "easy"}, criteria.seed).essayTypeId, type.id);
      if (type.pictureFrameCount > 1) {
        assert.deepEqual(result.storyFrames, frames); assert.equal(result.support.pictureStatus, "ready");
        assert.match(result.imagePrompt, /2x2/);
        const scoring = buildEssayScoringPrompt(result, "My continuation");
        assert.ok(scoring.includes(frames[0])); assert.match(scoring, /follows the supplied ordered story events/);
        assert.ok(!scoring.includes(result.imagePrompt));
      }
    }
  });
  test(layer + ": a required image failure never produces a usable text-only draft", async () => {
    const config = api.fromLegacyConfiguration(); config.gradeSettings.primary[3].essayTypes = [{essayTypeId: "fourFrameStory", pictureEnabled: true}];
    let calls = 0;
    const generator = new Generate({repository: {getConfig: async () => config, createQuestionId: () => "generated"}, requireAdministrator: async () => ({uid: "admin"}),
      generateLlmText: async () => {calls++; return {questionText: "Follow the pictures", imagePrompt: "Bird rescue", storyFrames: frames};}, createPicture: async () => {throw new Error("Provider failed");}});
    await assert.rejects(generator.execute(criteria), /required story picture/); assert.equal(calls, 1);
    config.gradeSettings.primary[3].essayTypes = [];
    await assert.rejects(generator.execute(criteria), /not available/); assert.equal(calls, 1);
  });
  test(layer + ": reuse checks type availability and mandatory frame metadata", () => {
    const config = api.fromLegacyConfiguration(); config.gradeSettings.primary[3].essayTypes = [{essayTypeId: "fourFrameStory", pictureEnabled: true}];
    const question = {...criteria, essayTypeId: "fourFrameStory", storyFrames: frames, support: {pictureStatus: "ready", settings: {pictureEnabled: true, helpingWordsEnabled: false, helpingWordCount: 5}}};
    assert.equal(api.questionMatchesConfiguration(question, config), true);
    assert.equal(api.questionMatchesConfiguration({...question, storyFrames: []}, config), false);
    assert.equal(api.questionMatchesConfiguration({...question, essayTypeId: "normalEssay"}, config), false);
  });
}
