const assert = require("node:assert/strict"), test = require("node:test");
const {createTestSystem} = require("../../../tests/news_test_support.cjs");
const {createNewsGenerator} = require("../news_article_generator/news_article_generator_module");
const {resolveNewsGradeSettings} = require("./domain/news_config");
const admin = {auth: {uid: "admin"}};
test("word-count checkpoints choose the closer draft and resume older failures without repeating completed work", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const s = await createTestSystem("demo-rhx-news-length-correction");
  try {
    const original = await s.service.generateNewsPreview({newsType: "international", level: "primary", standard: 6, language: "English", clientRequestId: "original"}, admin);
    await s.drain(original.generationId); const {storyId} = await s.service.addNewsPreviewToPool({generationId: original.generationId}, admin);
    const configuration = await s.configFeature.loadNewsConfiguration(); configuration.gradeSettings.primary[6].targetWordCount = 20;
    const settings = {...resolveNewsGradeSettings(configuration, {level: "primary", standard: 6}), imageSettings: {}};
    let calls = 0, selected = 0;
    const generator = createNewsGenerator({repository: s.repository, now: s.now,
      adapt: async prompt => {calls++; const count = calls === 1 ? 10 : 12;
        if (calls > 1) assert.match(prompt, /WORD COUNT CORRECTION/);
        return {title: "News", pages: [{text: Array(count).fill("Science").join(" "), factIds: ["f1"], imageIndices: [], altTexts: []}], imagePlans: []};},
      selectVocabulary: async edition => {selected++; assert.equal(edition.pages[0].text.split(" ").length, 12); return {terms: []};}});
    const started = await generator.enqueuePreview({ownerUid: "admin", clientRequestId: "length-failure", criteria: {newsType: "international", country: null}, settings, sourceStoryId: storyId, language: "English", vocabularyCount: 3});
    async function step(concurrent = false) {const job = await s.repository.job(started.generationId); const run = () => generator.run(job.generationId, job.requestSequence); if (concurrent) await Promise.all([run(), run()]); else await run(); return s.repository.job(job.generationId);}
    await step(); let job = await step(true); assert.equal(job.stage, "word_count"); assert.equal(job.draft.actualWordCount, 10); assert.equal(calls, 1);
    job = await step(true); assert.equal(job.status, "queued"); assert.equal(job.stage, "vocabulary"); assert.equal(job.draft.actualWordCount, 12); assert.equal(job.wordCountRevisions, 1); assert.equal(calls, 2); assert.equal(selected, 0);
    // Simulate a previously blocked job with its saved corrected draft. Retry
    // resumes it without calling the model again or changing article identity.
    await s.db.doc("newsGenerations/" + started.generationId).update({status: "failed", stage: "word_count", errorCode: "invalid-news", errorMessage: "Old word-count rejection"});
    await s.repository.retry(started.generationId); job = await step(true); assert.equal(job.stage, "vocabulary"); assert.equal(job.wordCountRevisions, 1); assert.equal(calls, 2);
    while (job.status === "queued") job = await step();
    assert.equal(job.status, "completed"); assert.equal(job.edition.actualWordCount, 12); assert.equal(selected, 1);
    assert.equal(s.calls.discover, 1); assert.equal(s.calls.ai, 0); assert.equal((await s.db.collection("newsStories").get()).size, 1);
  } finally {await s.db.terminate();}
});
