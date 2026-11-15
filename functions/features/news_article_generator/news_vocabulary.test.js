const assert = require("node:assert/strict"), test = require("node:test");
const {firstOccurrence, normalizeVocabulary, setId, meaningId} = require("../news_article/domain/news_vocabulary");
const {createDefaultNewsConfiguration, normalizeNewsConfiguration, resolveNewsGradeSettings} = require("../student_news/domain/news_config");
const {editionKeys} = require("../news_article/domain/news_article");
const {selectNewsVocabulary, explainNewsVocabulary, createNewsVocabulary} = require("./news_vocabulary_module");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
test("configuration defaults, legacy documents, zero and changes preserve article reuse keys", () => {
  const config = createDefaultNewsConfiguration();
  assert.deepEqual(Object.values(config.gradeSettings.primary).map(grade => grade.vocabularyCount), [3, 3, 5, 5, 8, 8]);
  assert.ok(Object.values(config.gradeSettings.secondary).every(grade => grade.vocabularyCount === 10));
  const before = editionKeys({storyId: "story", revision: 1}, resolveNewsGradeSettings(config, {level: "primary", standard: 6}), "English");
  config.gradeSettings.primary[6].vocabularyCount = 0;
  assert.equal(normalizeNewsConfiguration(config).gradeSettings.primary[6].vocabularyCount, 0);
  assert.deepEqual(editionKeys({storyId: "story", revision: 1}, resolveNewsGradeSettings(config, {level: "primary", standard: 6}), "English"), before);
  delete config.gradeSettings.primary[6].vocabularyCount;
  assert.equal(normalizeNewsConfiguration(config).gradeSettings.primary[6].vocabularyCount, 8);
  for (const value of [-1, 1.5, 51, "3", null]) {config.gradeSettings.primary[6].vocabularyCount = value; assert.throws(() => normalizeNewsConfiguration(config));}
});
test("offsets mark whole words and phrases only at their first occurrence across pages", () => {
  const edition = {editionId: "edition", gradeKey: "primary_3", language: "English", pages: [
    {position: 1, text: "🌍 Energy for the energetic city. Renewable energy helps. Renewable energy matters."},
    {position: 2, text: "Renewable energy helps another city."},
  ]};
  const selected = normalizeVocabulary({terms: [{term: "renewable energy", kind: "phrase"}, {term: "energy", kind: "word"}, {term: "Renewable energy", kind: "phrase"}, {term: "invented", kind: "word"}].map(item => ({...item, articleMeaning: "A simple contextual definition."}))}, edition, 5);
  assert.equal(selected.actualCount, 2);
  assert.equal(selected.items[0].term, "Energy"); assert.equal(selected.items[1].term, "Renewable energy");
  for (const item of selected.items) assert.equal(edition.pages[item.pagePosition - 1].text.slice(item.startOffset, item.endOffset), item.term);
  assert.match(selected.items[1].context, /^Renewable energy helps\.$/);
  assert.equal(firstOccurrence([{position: 1, text: "energetic"}], "energy"), null);
  assert.throws(() => normalizeVocabulary({terms: [{term: "absent", kind: "word"}]}, edition, 3), /did not occur/);
  assert.equal(normalizeVocabulary({terms: []}, edition, 0).actualCount, 0);
  assert.throws(() => normalizeVocabulary({terms: [{term: "Energy", kind: "word"}]}, edition, 1), /must include a meaning/);
  assert.equal(selected.items[0].articleMeaning, "A simple contextual definition.");
});
test("Chinese and Tamil words retain exact offsets, and overlapping phrases do not move to a later occurrence", () => {
  const edition = {editionId: "edition", gradeKey: "primary_1", language: "Chinese", pages: [{position: 1, text: "学生了解可再生能源。可再生能源很重要。学生学习。"}]};
  const selected = normalizeVocabulary({terms: [{term: "可再生能源", kind: "phrase"}, {term: "能源", kind: "word"}, {term: "学生", kind: "word"}].map(item => ({...item, articleMeaning: "简单的中文释义。"}))}, edition, 3);
  assert.equal(selected.items.length, 2); assert.equal(selected.items[0].startOffset, 0);
  assert.equal(selected.items[1].term, "可再生能源"); assert.equal(selected.items[1].startOffset, 4);
  assert.equal(firstOccurrence([{position: 1, text: "மாணவர்கள் அறிவியல் கற்கிறார்கள்."}], "அறிவியல்").term, "அறிவியல்");
  assert.notEqual(setId(3), setId(5)); assert.equal(meaningId("term", " Chinese "), meaningId("term", "chinese"));
});
test("selection and contextual meaning generation use DeepSeek via utils/llm", async () => {
  const original = new LlmUtil().getProviderAdapter("deepseek"), calls = [];
  registerLlmProvider("deepseek", {call() {}, generateText: async (input, options) => {calls.push({input, options}); return {meaning: "A meaning"};}});
  try {
    const source = {gradeKey: "primary_3", language: "English", pages: [{position: 1, text: "Energy helps."}]};
    await selectNewsVocabulary(source, 5); await explainNewsVocabulary(source, {term: "Energy", context: "Energy helps."}, "Chinese");
    assert.equal(calls.length, 2); assert.ok(calls[0].input.includes("exact substring"));
    assert.match(calls[0].input, /articleMeaning MUST/); assert.equal(calls[0].options.maxTokenLimit, 16000);
    for (const call of calls) {assert.match(call.input, /simplest explanation possible/); assert.match(call.input, /familiar everyday words/); assert.match(call.input, /fewest words needed/); assert.match(call.input, /circular definitions/);}
    assert.match(calls[1].input, /Do not add an example sentence/); assert.ok(calls[1].input.includes('"meaningLanguage":"Chinese"'));
    assert.ok(calls.every(call => call.options.timeoutMs <= 120000));
  } finally {registerLlmProvider("deepseek", original);}
});
test("the article-language meaning is immediately available without a cache lookup or provider call", async () => {
  const vocabulary = createNewsVocabulary({repository: {}, explain: async () => {throw Error("No provider call allowed");}});
  const selected = {language: "English"}, item = {id: "term", articleMeaning: "A simple definition."};
  assert.deepEqual(await vocabulary.meaning(selected, item, " english ", {create: false}), {termId: "term", language: " english ", meaning: "A simple definition.", status: "ready", generationId: null});
});
test("zero counts and picture-only text skip paid vocabulary selection", async () => {
  const vocabulary = createNewsVocabulary({repository: {vocabulary: async () => null}, select: async () => {throw Error("Must not call the provider");}});
  const edition = {editionId: "edition", gradeKey: "primary_1", language: "Chinese", pages: [{position: 1, text: ""}]};
  assert.deepEqual((await vocabulary.prepare(edition, 3)).items, []);
  edition.pages[0].text = "Some article text";
  assert.deepEqual((await vocabulary.prepare(edition, 0)).items, []);
});
