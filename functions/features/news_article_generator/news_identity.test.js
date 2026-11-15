const assert = require("node:assert/strict"), test = require("node:test");
const {normalizeStory} = require("../news_article/domain/news_article");
const {titleKey, newsFactsKey, titleStoryId} = require("../news_article/domain/news_title");
const identity = require("./domain/news_identity");
const {compareNewsStories, findSimilarNewsTitles} = require("./news_identity_module");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
const {discoveryPrompt} = require("./domain/news_prompts");
const {groundNewsSources} = require("./domain/news_source_grounding");
const raw = () => ({title: "Publisher's science headline", canonicalTitle: "Space exhibition opens in London", canonicalUrl: "https://example.test/report",
  sources: [{url: "https://example.test/report", title: "Science report", publisher: "News", publishedAt: "2026-11-14"}],
  facts: [{text: "A space exhibition opened in London.", sourceIds: ["s1"]}, {text: "It includes a lunar rock display.", sourceIds: ["s1"]}]});
const story = () => normalizeStory(raw(), {newsType: "international"}, new Date("2026-11-15"));
test("shared title identity normalizes case, punctuation and Unicode and is independent of URLs and citation order", () => {
  assert.equal(titleKey("  ＳＰＡＣＥ: Exhibition—Opens! "), "space exhibition opens");
  const first = story(), changed = raw();
  changed.title = "A different publisher's headline"; changed.canonicalUrl = changed.sources[0].url = "https://other.test/another-report";
  changed.sources[0].publisher = "Other"; changed.facts.reverse(); changed.canonicalTitle = "SPACE exhibition opens in London!";
  const second = normalizeStory(changed, {newsType: "international"}, new Date("2026-11-15"));
  assert.equal(first.storyId, second.storyId); assert.equal(first.newsFactsKey, second.newsFactsKey);
  assert.equal(newsFactsKey(first.facts), newsFactsKey(first.facts.map(fact => ({...fact, sourceIds: ["s2"]}))));
  changed.facts[0].text = "The exhibition has now welcomed its millionth visitor.";
  const update = normalizeStory(changed, {newsType: "international"}, new Date("2026-11-15"));
  assert.notEqual(update.storyId, first.storyId, "a material update may retain the same title");
  assert.equal(update.storyId, titleStoryId(update.canonicalTitle, update.facts));
});
test("comparison validates references and requires actual candidate facts for a new development", () => {
  const candidate = story(), records = [{...identity.storyIdentity(candidate), storyId: "earlier"}];
  const base = {canonicalTitle: candidate.canonicalTitle, matchType: "new_story", matchedStoryId: null, newFactIndices: []};
  assert.deepEqual(identity.normalizeComparison(base, candidate, records), base);
  const update = {...base, matchType: "new_development", matchedStoryId: "earlier", newFactIndices: [2]};
  assert.deepEqual(identity.normalizeComparison(update, candidate, records), update);
  for (const patch of [{matchedStoryId: "invented"}, {newFactIndices: []}, {newFactIndices: [3]}, {newFactIndices: [1, 1]}, {newFactIndices: [1.5]}]) {
    assert.throws(() => identity.normalizeComparison({...update, ...patch}, candidate, records));
  }
  assert.throws(() => identity.normalizeComparison({...base, matchedStoryId: "earlier"}, candidate, records));
  assert.throws(() => identity.normalizeComparison({...base, matchType: "duplicate", matchedStoryId: "invented"}, candidate, records));
  assert.throws(() => identity.normalizeTitleSelection({canonicalTitle: "News", candidateIds: ["invented"]}, records));
  assert.throws(() => identity.normalizeTitleSelection({canonicalTitle: "News", candidateIds: ["earlier", "earlier"]}, records));
});
test("title and facts comparisons use DeepSeek through utils/llm and explain what makes an update meaningful", async () => {
  const original = new LlmUtil().getProviderAdapter("deepseek"), calls = [], candidate = story(), records = [identity.storyIdentity(candidate)];
  registerLlmProvider("deepseek", {call: async () => {}, generateText: async (prompt, options) => {calls.push({prompt, options}); return {ok: true};}});
  try {
    await compareNewsStories(candidate, records); await findSimilarNewsTitles(candidate, records);
    assert.equal(calls.length, 2);
    for (const {prompt, options} of calls) {
      assert.equal(options.temperature, 0); assert.equal(options.timeoutMs, 120000);
      assert.match(prompt, /English title/); assert.ok(prompt.includes(candidate.storyId));
      assert.ok(!prompt.includes(candidate.canonicalStoryKey), "citation URLs are not used as identity");
    }
    assert.match(calls[0].prompt, /publication-date change alone/); assert.match(calls[0].prompt, /ANY earlier story/);
    assert.match(calls[1].prompt, /ALL earlier news titles/);
  } finally {registerLlmProvider("deepseek", original);}
});
test("discovery excludes title developments, retains legacy IDs, and checks more records than fit in its prompt", () => {
  const candidate = {...story(), storyId: "legacy_url_hash"}, record = identity.storyIdentity(candidate);
  assert.equal(record.storyId, "legacy_url_hash");
  const exclusions = identity.discoveryExclusions([record]);
  assert.deepEqual(exclusions, [{title: candidate.canonicalTitle, mainFacts: candidate.facts.map(fact => fact.text)}]);
  const prompt = discoveryPrompt({newsType: "international"}, "", exclusions);
  assert.match(prompt, /meaningful NEW event/); assert.match(prompt, /canonicalTitle/); assert.ok(prompt.includes(candidate.canonicalTitle));
  assert.ok(!prompt.includes(candidate.canonicalStoryKey));
  const records = Array.from({length: 150}, (_, i) => ({...record, storyId: "story_" + i, facts: ["x".repeat(2000), "y".repeat(2000)]}));
  assert.ok(identity.factBatch(records, 0, candidate).length < records.length);
});
test("pruning an unverified source also removes its potentially unsupported canonical headline", () => {
  const value = raw(); value.sources.push({...value.sources[0], url: "https://unverified.test/report"});
  const response = {output: [{type: "web_search_call", status: "completed", action: {type: "open_page", url: value.sources[0].url}}]};
  const result = groundNewsSources(value, response);
  assert.equal(result.sources.length, 1); assert.equal(result.facts.length, 2);
  assert.equal(result.canonicalTitle, undefined);
});
