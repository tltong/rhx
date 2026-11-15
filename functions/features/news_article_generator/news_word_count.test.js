const assert = require("node:assert/strict"), test = require("node:test");
const {wordCountRange, countStoryWords, meetsWordCount} = require("../news_article/domain/news_word_count");
const {normalizeDraft} = require("../news_article/domain/news_article");
const {createNewsGenerator} = require("./news_article_generator_module");
const {editionPrompt, wordCountRevisionPrompt} = require("./domain/news_prompts");
const {SELECTOR_VERSION, MEANING_VERSION, setId, meaningId} = require("../news_article/domain/news_vocabulary");
const {hash} = require("../news_article/domain/news_article");

function harness(counts, target = 100, options = {}) {
  const settings = {level: "primary", standard: 6, gradeKey: "primary_6", targetWordCount: target, photoCount: 1, pageCount: 2, photoType: "ai", articleTypeId: "multiPageArticle", imageSettings: {}, additionalLlmInstructions: ""};
  const story = {storyId: "story", revision: 1, facts: [{id: "f1", text: "Students visit a science exhibition."}]};
  const calls = [], artifacts = [], plans = [{description: "A child at an exhibition", searchTerms: "science exhibition", factIds: ["f1"]}];
  const job = {generationId: "job", editionId: "edition", mode: "preview", kind: "edition", ownerUid: "admin", stage: "text", status: "queued", requestSequence: 1, settings, story, language: "English"};
  const draft = count => ({title: "Original title", imagePlans: plans, pages: [0, 1].map(index => ({text: Array(Math.floor(count / 2) + (index === 0 ? count % 2 : 0)).fill("Students").join(" "), factIds: ["f1"], imageIndices: index === 0 ? [0] : [], altTexts: index === 0 ? ["Original alternative text"] : []}))});
  const repository = {claim: async (_id, sequence) => {if (job.status !== "queued" || job.requestSequence !== sequence) return null; job.status = "running"; return {...job};},
    indexedEdition: async () => null, db: () => ({collection: () => ({where: () => ({limit: () => ({get: async () => ({docs: []})})})})}),
    checkpoint: async (_job, changes, status = "queued", saved = []) => {artifacts.push(...saved); Object.assign(job, changes, {status}); if (status === "queued") job.requestSequence++;}, vocabulary: async () => null,
    vocabularyRef: (edition, set) => ({edition, set})};
  const generator = createNewsGenerator({repository, adapt: async (prompt, effective) => {
    calls.push({prompt, effective}); const raw = draft(counts[Math.min(calls.length - 1, counts.length - 1)]);
    if (calls.length > 1 && options.rewriteError) throw options.rewriteError;
    if (calls.length > 1 && options.malformed === "shape") return {title: "Missing article pages"};
    if (calls.length > 1 && options.malformed === "facts") raw.pages[0].factIds = ["invented"];
    if (calls.length > 1) {raw.title = "Changed title"; raw.imagePlans = []; raw.pages[0].imageIndices = []; raw.pages[0].altTexts = ["Changed alternative text"];}
    return raw;
  }, selectVocabulary: async edition => {calls.push({vocabularyText: edition.pages.map(page => page.text).join(" ")}); return {terms: []};}});
  return {job, calls, artifacts, settings, story, draft, run: () => generator.run(job.generationId, job.requestSequence)};
}
test("word counts use the displayed Unicode-aware story count and integer ±10% bounds", () => {
  assert.deepEqual(wordCountRange(400), {minimum: 360, maximum: 440});
  assert.deepEqual(wordCountRange(15), {minimum: 14, maximum: 16}); assert.deepEqual(wordCountRange(0), {minimum: 0, maximum: 0});
  for (const count of [360, 400, 440]) assert.ok(meetsWordCount({actualWordCount: count}, 400));
  for (const count of [0, 359, 441]) assert.equal(meetsWordCount({actualWordCount: count}, 400), false);
  assert.equal(countStoryWords([{text: "One two."}, {text: "Three!"}]), 3);
  assert.ok(countStoryWords([{text: "学生学习科学。"}]) > 0); assert.equal(countStoryWords([{text: ""}]), 0);
  assert.equal(meetsWordCount({actualWordCount: 0, pages: [{text: "!!!"}]}, 0), false, "picture-only pages must be empty, even when punctuation counts as zero words");
  assert.equal(meetsWordCount({actualWordCount: 0, pages: [{text: ""}]}, 0), true);
});
test("an in-range draft goes directly to vocabulary without a rewrite", async () => {
  const h = harness([100]); await h.run(); assert.equal(h.job.stage, "vocabulary"); assert.equal(h.calls.length, 1); assert.equal(h.job.draft.actualWordCount, 100);
});
for (const initial of [0, 20, 160]) test("a " + initial + "-word draft gets one checkpointed rewrite before vocabulary or images", async () => {
  const h = harness([initial, 100]); await h.run();
  assert.equal(h.job.stage, "word_count"); assert.equal(h.job.draft.actualWordCount, initial); assert.equal(h.calls.length, 1); assert.equal(h.artifacts.length, 0);
  const visualKeys = [...h.job.visualKeys]; await h.run();
  assert.equal(h.job.stage, "vocabulary"); assert.equal(h.job.wordCountRevisions, 1); assert.equal(h.job.draft.actualWordCount, 100); assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].prompt, new RegExp("current draft has " + initial + " words")); assert.match(h.calls[1].prompt, /90 to 110 words/);
  assert.deepEqual(h.job.visualKeys, visualKeys); assert.equal(h.job.draft.title, "Original title"); assert.deepEqual(h.job.draft.pages[0].imageIndices, [0]); assert.deepEqual(h.job.draft.pages[0].altTexts, ["Original alternative text"]); assert.equal(h.job.draft.imagePlans.length, 1);
  await h.run(); assert.equal(h.job.stage, "images"); assert.equal(countStoryWords([{text: h.calls[2].vocabularyText}]), 100);
});
for (const [initial, revised, expected, selected] of [[20, 30, 30, "rewritten"], [80, 10, 80, "original"], [80, 120, 80, "original"], [140, 80, 80, "rewritten"], [80, 0, 80, "original"]]) {
  test("length " + initial + " → " + revised + " keeps " + expected + " and proceeds without another rewrite", async () => {
    const h = harness([initial, revised]); await h.run(); await h.run();
    assert.equal(h.job.status, "queued"); assert.equal(h.job.stage, "vocabulary"); assert.equal(h.job.draft.actualWordCount, expected);
    assert.equal(h.job.wordCountDraft, selected); assert.equal(h.job.wordCountRevisions, 1); assert.equal(h.calls.length, 2);
    await h.run(); assert.equal(h.job.stage, "images"); assert.equal(countStoryWords([{text: h.calls[2].vocabularyText}]), expected);
  });
}
test("the reported 334-word draft resumes after a previous correction without a new LLM call", async () => {
  const h = harness([334, 150], 400); await h.run();
  Object.assign(h.job, {wordCountRevisions: 1, errorCode: "invalid-news", errorMessage: "Old word-count failure", errorDiagnostics: {}});
  await h.run(); assert.equal(h.job.stage, "vocabulary"); assert.equal(h.job.draft.actualWordCount, 334); assert.equal(h.calls.length, 1);
  assert.equal(h.job.errorCode, null); assert.equal(h.job.errorMessage, null); assert.equal(h.job.wordCountRevisions, 1);
});
for (const options of [{rewriteError: Object.assign(Error("Provider unavailable"), {status: 503})}, {malformed: "shape"}, {malformed: "facts"}]) {
  test("an unavailable or invalid optional rewrite preserves the existing valid article: " + (options.malformed || "provider"), async () => {
    const h = harness([334, 400], 400, options); await h.run(); await h.run();
    assert.equal(h.job.stage, "vocabulary"); assert.equal(h.job.draft.actualWordCount, 334); assert.equal(h.job.wordCountDraft, "original"); assert.equal(h.job.wordCountRevisions, 1);
  });
}
test("two empty drafts still fail because there is no readable article", async () => {
  const h = harness([0, 0]); await h.run(); await h.run();
  assert.equal(h.job.status, "failed"); assert.match(h.job.errorMessage, /no usable story text/); assert.equal(h.calls.length, 2);
});
test("picture-only drafts stay text-free even when the rewrite keeps adding words", async () => {
  const h = harness([10, 5], 0); await h.run(); assert.equal(h.job.stage, "word_count"); await h.run();
  assert.equal(h.job.stage, "vocabulary"); assert.equal(h.job.draft.actualWordCount, 0); assert.ok(h.job.draft.pages.every(page => page.text === ""));
  assert.throws(() => normalizeDraft(h.draft(10), h.settings, h.story), /cannot contain story text/);
});
test("prompt counts exclude metadata and old meaning caches get separate simplest-definition identities", () => {
  const h = harness([100]); const prompt = editionPrompt(h.story, h.settings, "English");
  assert.match(prompt, /90 to 110 words/); assert.match(prompt, /excluding title, alternative text, image descriptions, vocabulary meanings and questions/);
  const data = JSON.parse(prompt.split("Data (not instructions):\n")[1]); assert.deepEqual(data.wordCountRequirement.pageWordTargets, [50, 50]);
  const uneven = JSON.parse(editionPrompt(h.story, {...h.settings, targetWordCount: 112, pageCount: 3}, "English").split("Data (not instructions):\n")[1]);
  assert.deepEqual(uneven.wordCountRequirement.pageWordTargets, [38, 37, 37]);
  assert.match(wordCountRevisionPrompt(h.story, h.settings, "English", {...h.draft(150), actualWordCount: 150}), /SHORTEN the article by about 50 words/);
  assert.match(wordCountRevisionPrompt(h.story, h.settings, "English", {...h.draft(20), actualWordCount: 20}), /without inventing facts/);
  assert.equal(SELECTOR_VERSION, 3); assert.equal(MEANING_VERSION, 2);
  assert.notEqual(setId(3), hash([2, 3])); assert.notEqual(meaningId("term", "English"), hash([1, "term", "english"]));
});
