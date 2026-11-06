import test from "node:test";
import assert from "node:assert/strict";
import {createFillInTheBlanksQuestionGenerator} from "./fill_in_the_blanks_question_generator_module.js";
import {normaliseConfig} from "./domain/fill_in_the_blanks.js";

const question = {passageText: "We saw {{q1}} in the park.", summary: "Park visit", imagePrompt: "Children watching birds in a park.",
  questions: [{questionId: "q1", requiredWordCount: 1, correctAnswer: "birds"}]};
const input = {syllabusId: "english", topicId: "vocabulary", language: "English", difficulty: "easy", previewOnly: true};
function harness({imageEnabled = true, generated = question, createPreviewPicture = async () => ({mimeType: "image/png", base64: "preview-bytes"}), onText} = {}) {
  const writes = [], calls = [];
  const config = normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 1, imageEnabled}}}});
  const feature = createFillInTheBlanksQuestionGenerator({authorize: async () => "admin", repository: {
    config: () => ({get: async () => ({exists: true, data: () => config}), set: () => {writes.push("config"); assert.fail("Preview must not change configuration");}}),
    summaries: async () => ["Library visit"],
    draft: () => {writes.push("draft"); assert.fail("Preview must not access persisted drafts");},
    save: () => {writes.push("pool"); assert.fail("Preview must not save questions");},
  }, getSyllabus: async () => ({level: "primary", year: 1, subject: "English", country: "MY", languages: ["English"], topics: [{id: "vocabulary", topicName: "Vocabulary"}]}),
    generateText: async prompt => {calls.push("text"); assert.match(prompt, /Library visit/); await onText?.(); return generated;},
    createPicture: () => {writes.push("stored image"); assert.fail("Preview must not create stored image assets");},
    createPreviewPicture: async passage => {calls.push("image"); return createPreviewPicture(passage);},
  });
  return {feature, writes, calls};
}
test("preview returns the generated question and image without draft, question-pool or stored-image writes", async () => {
  const {feature, writes, calls} = harness();
  const result = await feature.generateFillInTheBlanksQuestion({...input, save: false});
  assert.equal(result.passageText, question.passageText);
  assert.equal(result.questions[0].correctAnswer, "birds");
  assert.equal(result.previewImage.mimeType, "image/png"); assert.equal(result.image, null);
  assert.equal(result.imageStatus, "generated"); assert.deepEqual(calls, ["text", "image"]); assert.deepEqual(writes, []);
});
test("preview-only requests never save even if save was omitted or true", async () => {
  for (const save of [undefined, true]) {
    const {feature, writes} = harness();
    await feature.generateFillInTheBlanksQuestion({...input, save});
    assert.deepEqual(writes, []);
  }
});
test("a model's wrong declared count does not block question/image preview or cause backend writes", async () => {
  const {feature, writes, calls} = harness({generated: {...question, questions: [{questionId: "q1", correctAnswer: "the birds", requiredWordCount: 1}]}});
  const result = await feature.generateFillInTheBlanksQuestion(input);
  assert.equal(result.questions[0].requiredWordCount, 2);
  assert.equal(result.questions[0].correctAnswer, "the birds");
  assert.equal(result.imageStatus, "generated"); assert.deepEqual(calls, ["text", "image"]);
  assert.deepEqual(writes, []);
});
test("optional picture failure retains the generated written question without any persistence", async () => {
  const {feature, writes} = harness({createPreviewPicture: async () => {throw new Error("Image unavailable");}});
  const result = await feature.generateFillInTheBlanksQuestion(input);
  assert.equal(result.passageText, question.passageText); assert.equal(result.previewImage, null);
  assert.equal(result.imageStatus, "failed"); assert.deepEqual(writes, []);
});
test("grade settings disabling images omit the image service but still preview the passage", async () => {
  const {feature, writes, calls} = harness({imageEnabled: false});
  const result = await feature.generateFillInTheBlanksQuestion(input);
  assert.equal(result.imageStatus, "disabled"); assert.equal(result.previewImage, null);
  assert.deepEqual(calls, ["text"]); assert.deepEqual(writes, []);
});
test("switching accounts during preview generation rejects the response", async () => {
  let active = true;
  const {feature, writes} = harness({onText: () => {active = false;}});
  await assert.rejects(feature.generateFillInTheBlanksQuestion(input, {assertAccess() {if (!active) throw new Error("Account changed");}}), /Account changed/);
  assert.deepEqual(writes, []);
});
