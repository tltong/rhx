import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {GenerateEssayQuestion as WebGenerate} from "./application/generate_essay_question.js";
import {normalizeConfiguration as webConfig} from "./domain/essay_question_generator_config.js";
import * as webSupport from "./domain/essay_question_support.js";
import {normalizeDraftInput as webDraft} from "./domain/essay_question.js";
import {normalizeDraft as webGenerationDraft} from "../student_essay_practice_generator/domain/essay_generation.js";
import {buildEssayScoringPrompt as webScore} from "../essay_scoring/application/build_essay_scoring_prompt.js?v=20261104-fill-preassessment-v3";
const require = createRequire(import.meta.url);
const {GenerateEssayQuestion: BackendGenerate} = require("../../../functions/features/essay_question_generator/application/generate_essay_question");
const {normalizeConfiguration: backendConfig} = require("../../../functions/features/essay_question_generator/domain/essay_question_generator_config");
const backendSupport = require("../../../functions/features/essay_question_generator/domain/essay_question_support");
const {normalizeDraftInput: backendDraft} = require("../../../functions/features/essay_question_generator/domain/essay_question");
const {normalizeDraft: backendGenerationDraft} = require("../../../functions/features/student_essay_practice_generator/domain/essay_generation");
const {buildEssayScoringPrompt: backendScore} = require("../../../functions/features/essay_scoring/application/build_essay_scoring_prompt");
const {createEssayPictureService} = require("../../../functions/features/essay_question_generator/infrastructure/essay_picture_service");
const {GenerateNextStudentEssayPractice} = require("../../../functions/features/student_essay_practice_generator/application/generate_next_student_essay_practice");
const input = {level: "primary", standard: 2, language: "Tamil", difficulty: "medium", seed: "Park cleanup", save: false};
const picture = {storagePath: "essay-question-images/question1.png", url: "https://firebasestorage.googleapis.com/v0/b/example/o/image?alt=media&token=example",
  description: "Children collect rubbish in a park."};
const imagePrompt = "A friendly illustration of children collecting rubbish together in a park.";
const enabled = {pictureEnabled: true, helpingWordsEnabled: true, helpingWordCount: 3};
const support = (settings = enabled, changes = {}) => ({version: 1, settings, pictureStatus: settings.pictureEnabled ? "ready" : "disabled", picture: settings.pictureEnabled ? picture : null,
  helpingWordsStatus: settings.helpingWordsEnabled ? "ready" : "disabled", helpingWords: settings.helpingWordsEnabled ? ["பூங்கா", "நண்பர்கள்", "சுத்தம் செய்தல்"] : [], ...changes});
for (const [layer, Generate, config, normalize, draft, generationDraft, score] of [
  ["web", WebGenerate, webConfig, webSupport, webDraft, webGenerationDraft, webScore],
  ["backend", BackendGenerate, backendConfig, backendSupport, backendDraft, backendGenerationDraft, backendScore],
]) {
  test(`${layer}: settings default off, remain separate by level/grade, and validate counts`, () => {
    const saved = config({gradeSupport: {primary: {2: enabled}}});
    assert.deepEqual(saved.gradeSupport.primary[2], enabled);
    assert.equal(saved.gradeSupport.secondary[2].pictureEnabled, false);
    assert.equal(saved.gradeSupport.primary[1].helpingWordsEnabled, false);
    for (const count of [0, -1, 1.5, 31, "5"]) assert.throws(() => config({gradeSupport: {primary: {2: {...enabled, helpingWordCount: count}}}}));
  });
  function generator({settings = enabled, badPicture = false, imagePromptValue = imagePrompt, words = ["பூங்கா", "நண்பர்கள்", "சுத்தம் செய்தல்"]} = {}) {
    const calls = [], saved = [];
    const api = new Generate({repository: {getConfig: async () => config({gradeSupport: {primary: {2: settings}}}), createQuestionId: () => "question1",
      saveQuestion: async question => {saved.push(question); return question;}},
      requireAdministrator: async () => ({uid: "admin"}),
      createPicture: async request => {calls.push(["picture", request]); if (badPicture) throw new Error("Image provider unavailable"); return picture;},
      generateLlmText: async prompt => {calls.push(["text", prompt]); return calls.filter(c => c[0] === "text").length === 1 ? {questionText: "பூங்காவைச் சுத்தம் செய்த சிறுவர்களைப் பற்றி எழுதுக.", imagePrompt: imagePromptValue} : {helpingWords: words};}});
    return {api, calls, saved};
  }
  test(`${layer}: generation retains complete reusable content through preview, save and durable drafts`, async () => {
    const h = generator(), result = await h.api.execute(input, {});
    assert.deepEqual(result.support, support());
    assert.equal(h.saved.length, 0);
    assert.deepEqual(draft(result).support, result.support);
    assert.deepEqual(generationDraft(result, {level: input.level, standard: input.standard, language: input.language, difficulty: input.difficulty}, input.seed).support, result.support);
    assert.match(h.calls.at(-1)[1], /Tamil/);
    assert.doesNotMatch(h.calls.at(-1)[1], /Children collect rubbish/);
    assert.equal(result.imagePrompt, imagePrompt);
    assert.equal(draft(result).imagePrompt, imagePrompt);
    assert.equal(generationDraft(result, {level: input.level, standard: input.standard, language: input.language, difficulty: input.difficulty}, input.seed).imagePrompt, imagePrompt);
    assert.equal(h.calls.find(call => call[0] === "picture")[1].imagePrompt, imagePrompt);
    assert.equal(h.calls.filter(call => call[0] === "text").length, 2); // One question/prompt call plus optional suggestions.
    assert.match(h.calls[0][1], /Required output format:.*imagePrompt/);
    const h2 = generator(); await h2.api.execute({...input, save: true}, {});
    assert.deepEqual(h2.saved[0].support, support());
    assert.equal(h2.saved[0].imagePrompt, imagePrompt);
  });
  test(`${layer}: image failure independently retains suggestions and a complete written task`, async () => {
    const h = generator({badPicture: true}), result = await h.api.execute(input, {});
    assert.equal(result.support.pictureStatus, "failed"); assert.equal(result.support.picture, null);
    assert.equal(result.support.helpingWordsStatus, "ready"); assert.ok(result.questionText);
  });
  test(`${layer}: suggestions use the written question and image prompt even when image generation fails`, async () => {
    for (const badPicture of [false, true]) {
      const h = generator({badPicture});
      const question = await h.api.execute(input, {});
      const prompt = h.calls.at(-1)[1], context = JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
      assert.equal(context.question, question.questionText);
      assert.equal(context.imagePrompt, imagePrompt);
      assert.match(prompt, /question as the primary reference/);
      assert.equal(h.calls.filter(call => call[0] === "text").length, 2);
      assert.equal(question.support.helpingWordsStatus, "ready");
    }
  });
  test(`${layer}: suggestions use the question alone when pictures are disabled or the image prompt is invalid`, async () => {
    for (const options of [{settings: {...enabled, pictureEnabled: false}}, {imagePromptValue: null}]) {
      const h = generator(options), question = await h.api.execute(input, {});
      const prompt = h.calls.at(-1)[1], context = JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
      assert.equal(context.question, question.questionText);
      assert.equal(context.imagePrompt, null);
      assert.equal(question.support.helpingWordsStatus, "ready");
      assert.equal(h.calls.filter(call => call[0] === "picture").length, 0);
    }
  });
  test(`${layer}: picture generation uses one text call for both the question and image prompt`, async () => {
    const h = generator({settings: {...enabled, helpingWordsEnabled: false}}), result = await h.api.execute(input, {});
    assert.deepEqual(h.calls.map(call => call[0]), ["text", "picture"]);
    assert.equal(result.imagePrompt, imagePrompt);
    assert.equal(result.support.helpingWordsStatus, "disabled");
    const newPicture = {url: picture.url, storagePath: picture.storagePath};
    assert.deepEqual(normalize.normalizeQuestionSupport(support(enabled, {picture: newPicture})).picture, newPicture);
    assert.equal(normalize.normalizeQuestionSupport(support()).picture.description, picture.description);
  });
  test(`${layer}: malformed image prompts skip images and preserve the question and suggestions`, async () => {
    for (const value of [null, "", 123, "x".repeat(12001)]) {
      const h = generator({imagePromptValue: value}), result = await h.api.execute(input, {});
      assert.equal(result.support.pictureStatus, "failed");
      assert.equal(result.support.helpingWordsStatus, "ready");
      assert.equal(result.imagePrompt, undefined);
      assert.equal(h.calls.filter(call => call[0] === "picture").length, 0);
    }
  });
  test(`${layer}: invalid or duplicate suggestion counts omit suggestions independently`, async () => {
    for (const words of [["one"], ["one", "one", "two"], null]) {
      const h = generator({words}), result = await h.api.execute(input, {});
      assert.equal(result.support.pictureStatus, "ready"); assert.equal(result.support.helpingWordsStatus, "failed");
      assert.deepEqual(result.support.helpingWords, []);
    }
  });
  test(`${layer}: disabled options cause no extra provider calls`, async () => {
    const h = generator({settings: {pictureEnabled: false, helpingWordsEnabled: false, helpingWordCount: 5}});
    const result = await h.api.execute(input, {});
    assert.equal(h.calls.length, 1); assert.equal(result.support.pictureStatus, "disabled"); assert.equal(result.support.helpingWordsStatus, "disabled");
  });
  test(`${layer}: reuse distinguishes legacy content from valid failure fallbacks`, () => {
    assert.equal(normalize.questionSupportsSettings({}, enabled), false);
    assert.equal(normalize.questionSupportsSettings({}, {}), true);
    assert.equal(normalize.questionSupportsSettings({support: support()}, enabled), true);
    assert.equal(normalize.questionSupportsSettings({support: support()}, {...enabled, helpingWordCount: 4}), false);
    assert.equal(normalize.questionSupportsSettings({support: support(enabled, {pictureStatus: "failed", picture: null, helpingWordsStatus: "failed", helpingWords: []})}, enabled), true);
  });
  test(`${layer}: scorer uses the written question, permits creativity and makes suggestions optional`, () => {
    const prompt = score({...input, imagePrompt, support: support(), questionText: "Write about a cleanup."}, "My story");
    assert.doesNotMatch(prompt, /Children collect rubbish in a park|A friendly illustration|pictureScene/);
    assert.match(prompt, /use the written question as the marking reference/);
    assert.match(prompt, /Allow invented names/); assert.match(prompt, /do not deduct marks for unused suggestions/);
    assert.match(prompt, /சுத்தம் செய்தல்/);
  });
}

test("recycling filters incompatible questions without invoking image generation", async () => {
  const valid = {questionId: "question1", ...input, questionText: "Write a story.", imagePrompt, seedUsed: input.seed, support: support()};
  const generator = new GenerateNextStudentEssayPractice({listEssayQuestions: async () => ({questions: [{...valid, questionId: "legacy", support: undefined}, valid], nextCursor: null}), random: () => 0});
  const result = await generator.reusableQuestion(input, {questionIds: new Set()}, new Map([["park cleanup", input.seed]]), () => {}, {gradeSupport: {primary: {2: enabled}}});
  assert.equal(result.questionId, "question1"); assert.equal(result.imagePrompt, imagePrompt); assert.deepEqual(result.support, support());
});

function assets({fail = false} = {}) {
  const records = new Map(), calls = [], prompts = [];
  const reference = id => ({id, update: async value => records.set(id, {...records.get(id), ...value})});
  const service = createEssayPictureService({getDb: () => ({collection: () => ({doc: reference}), runTransaction: fn => fn({
    get: async ref => ({exists: records.has(ref.id), data: () => records.get(ref.id)}), create: (ref, data) => records.set(ref.id, data)})}),
    authorize: async uid => uid === "admin",
    generate: async request => {calls.push("generate"); prompts.push(request.prompt); if (fail) throw new Error("Image provider unavailable"); return {images: [{mimeType: "image/png", base64: "aW1hZ2U="}]};},
    getBucket: () => ({name: "example", file: path => ({save: async () => {assert.equal(path, "essay-question-images/question1.png"); calls.push("save");}})})});
  return {service, calls, records, prompts};
}
test("picture generation requires administrator access and caches generated assets across students/retries", async () => {
  const h = assets(), request = {...input, imagePrompt, questionId: "question1", questionText: "Write a story about a cleanup."};
  await assert.rejects(h.service(request, {updatedBy: "student"}), /administrator/); assert.equal(h.calls.length, 0);
  const first = await h.service(request, {updatedBy: "admin"});
  assert.deepEqual(await h.service(request, {updatedBy: "admin"}), first);
  assert.deepEqual(h.calls, ["generate", "save"]);
  assert.ok(h.prompts[0].includes(imagePrompt));
  assert.equal(first.description, undefined);
  assert.equal(h.records.get("question1").imagePrompt, imagePrompt);
  await assert.rejects(h.service({...request, questionText: "Different question"}, {updatedBy: "admin"}), /another question/);
});
test("an image-generation failure is cached without repeating a paid request", async () => {
  const h = assets({fail: true}), request = {...input, imagePrompt, questionId: "question1", questionText: "Write a story."};
  await assert.rejects(h.service(request, {updatedBy: "admin"}), /Image provider unavailable/);
  await assert.rejects(h.service(request, {updatedBy: "admin"}), /already attempted/);
  assert.deepEqual(h.calls, ["generate"]); assert.equal(h.records.get("question1").state, "failed");
});

test("new initial assignments prepare compatible content once and retain the shared source", async () => {
  const {prepareEssayQuestion} = require("../../../functions/features/essay_question_generator/application/prepare_essay_question");
  const source = {questionId: "old", ...input, questionText: "Write about a park.", seedUsed: input.seed};
  const records = new Map(), pool = [], calls = [];
  const db = {collection: () => ({doc: id => ({id, set: async data => records.set(id, data)})}),
    runTransaction: operation => operation({get: async ref => ({data: () => records.get(ref.id)}), set: (ref, data) => records.set(ref.id, data)})};
  const api = {getEssayQuestionById: async id => id === "old" ? source : pool.find(q => q.questionId === id),
    getEssayQuestionGeneratorConfig: async () => backendConfig({gradeSupport: {primary: {2: enabled}}}),
    listEssayQuestions: async () => ({questions: pool, nextCursor: null}),
    generateEssayQuestion: async request => {calls.push(request); const question = {...source, questionId: "prepared", support: support()}; pool.push(question); return question;}};
  const result = await prepareEssayQuestion({questionId: "old"}, {updatedBy: "student1"}, {api, getDb: () => db});
  assert.equal(result.questionId, "prepared"); assert.equal(source.support, undefined);
  assert.equal((await prepareEssayQuestion({questionId: "old"}, {updatedBy: "student2"}, {api, getDb: () => db})).questionId, "prepared");
  assert.equal(calls.length, 1); assert.equal(calls[0].seed, source.seedUsed);
});

for (const [layer, Assign] of [["backend", require("../../../functions/features/student_essay_practice/application/assign_essay_practice_to_student").AssignEssayPracticeToStudent],
  ["web", (await import("../student_essay_practice/application/assign_essay_practice_to_student.js")).AssignEssayPracticeToStudent]]) {
  test(`${layer}: a retry after settings change retains an already-assigned replacement question`, async () => {
    let stored, prepared = 0;
    const assign = new Assign({repository: {getAssigned: async () => stored, assign: async value => (stored = value)},
      getEssayQuestionById: async () => ({questionId: "old"}), prepareQuestion: async () => {prepared++; return {questionId: "prepared" + prepared};}});
    const assignment = {studentId: "student1", essayPracticeId: "initial", syllabusId: "language", topicId: "essay", essayQuestionId: "old"};
    assert.equal((await assign.execute(assignment)).sourceEssayQuestionId, "old");
    assert.equal((await assign.execute(assignment)).essayQuestionId, "prepared1");
    assert.equal(prepared, 1);
  });
}

test("an image prompt is required before starting a paid image request", async () => {
  const h = assets();
  await assert.rejects(h.service({...input, questionId: "question1", questionText: "Write about a park."}, {updatedBy: "admin"}), /image prompt/);
  assert.equal(h.calls.length, 0);
});

test("existing HTTP endpoint authenticates new essay actions and derives caller identity server-side", async () => {
  const {createImageGenerationHandler} = require("../../../functions/image_generation_http");
  const calls = [];
  const handler = createImageGenerationHandler({verifyToken: async token => {assert.equal(token, "token"); return {uid: "actual-user"};},
    apis: {prepareEssayQuestion: async (input, context) => {calls.push({input, context}); return {questionId: "prepared"};},
      createEssayPicture: async (input, context) => {calls.push({input, context}); return picture;}}, log: {info() {}, error() {}}});
  const response = () => ({set() {}, status(value) {this.code = value; return this;}, json(value) {this.body = value;}, send() {}});
  for (const action of ["prepareEssayQuestion", "createEssayPicture"]) {
    const res = response();
    await handler({method: "POST", headers: {authorization: "Bearer token"}, body: {action, input: {questionId: "old", trusted: true}, updatedBy: "spoofed"}}, res);
    assert.equal(res.code, 200); assert.deepEqual(calls.at(-1).context, {updatedBy: "actual-user"});
  }
  const res = response(); await handler({method: "POST", headers: {}, body: {action: "prepareEssayQuestion"}}, res);
  assert.equal(res.code, 401); assert.equal(calls.length, 2);
});
