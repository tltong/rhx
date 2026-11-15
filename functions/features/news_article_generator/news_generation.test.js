const assert = require("node:assert/strict"), test = require("node:test");
const {dayWindow, timeZone} = require("../student_news/domain/news_day");
const {normalizeStory, normalizeDraft, hash} = require("../news_article/domain/news_article");
const {discoverNews, adaptNews, fetchBytes} = require("./infrastructure/news_providers");
const {processNewsGeneration, onNewsGenerationRequested} = require("../../triggers/news_generation_trigger");
const {OpenAIUtil} = require("../../utils/llm/openai_util");
const {generationFailure} = require("./domain/news_generation_errors");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
function brief(address, fields = {}) {return {title: "A science report", canonicalUrl: address,
  sources: [{url: address, title: "Science report", publisher: "Example News", publishedAt: "2026-11-14T00:00:00Z"}],
  facts: [{text: "A science exhibition opened.", sourceIds: ["s1"]}, {text: "Students can learn about space.", sourceIds: ["s1"]}], ...fields};}
test("article writing and translations invoke DeepSeek through the shared LLM utility", async () => {
  const original = new LlmUtil().getProviderAdapter("deepseek"), calls = [];
  registerLlmProvider("deepseek", {call: async () => {}, generateText: async (prompt, options) => {
    calls.push({prompt, options}); return {title: "News", pages: []};
  }});
  try {
    for (const prompt of ["Write a grade 6 news article as JSON", "Translate the same story into Malay as JSON"]) {
      assert.deepEqual(await adaptNews(prompt, {targetWordCount: 10000, photoCount: 12}), {title: "News", pages: []});
    }
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.options.maxTokens, 32768); assert.equal(call.options.maxTokenLimit, 32768);
      assert.equal(call.options.timeoutMs, 240000); assert.equal(call.options.model, undefined);
    }
    assert.deepEqual(onNewsGenerationRequested.__endpoint.secretEnvironmentVariables.map(item => item.key).sort(), ["DEEPSEEK_API_KEY", "OPENAI_API_KEY"]);
  } finally {registerLlmProvider("deepseek", original);}
});
test("OpenAI text adapter supports large configured article targets through the shared LLM interface", async () => {
  let body;
  const util = new OpenAIUtil({createClient: () => ({responses: {create: async input => {body = input; return {status: "completed", output_text: '{"title":"News"}'};}}})});
  assert.deepEqual(await util.generateText("Return JSON news", {maxTokens: 30000}), {title: "News"});
  assert.equal(body.max_output_tokens, 30000); assert.equal(body.store, false);
  await assert.rejects(util.generateText(""), /prompt/);
});
test("reuse keys are stable across Firestore map ordering", () => {
  assert.equal(hash({level: "primary", images: {size: "1024x1024", quality: "medium"}}), hash({images: {quality: "medium", size: "1024x1024"}, level: "primary"}));
});
test("student local midnight handles daylight-saving days and invalid timezones", () => {
  const spring = dayWindow(new Date("2026-03-08T16:00:00Z"), "America/New_York"), autumn = dayWindow(new Date("2026-11-01T16:00:00Z"), "America/New_York");
  assert.equal(spring.localDate, "2026-03-08"); assert.equal(spring.windowEndAt - spring.windowStartAt, 23 * 3600000);
  assert.equal(autumn.windowEndAt - autumn.windowStartAt, 25 * 3600000);
  assert.throws(() => timeZone("invalid/zone"));
});
test("news discovery requires a completed web search and retrieved source URLs", async () => {
  const raw = brief("https://example.test/report");
  let response = {status: "completed", output_text: JSON.stringify(raw), output: [{type: "web_search_call", status: "completed", action: {sources: [{url: raw.canonicalUrl}]}}]};
  const searchWeb = async (prompt, options) => {
    assert.equal(options.provider, "deepseek"); assert.equal(options.maxTokens, 12000);
    assert.equal(options.jsonMode, true);
    assert.ok([180000, 120000].includes(options.timeoutMs)); return response;
  };
  assert.deepEqual(await discoverNews("JSON news", {searchWeb}), raw);
  response = {...response, output: []}; await assert.rejects(discoverNews("JSON", {searchWeb}), /did not complete/);
  response = {status: "completed", output_text: JSON.stringify(raw), output: [{type: "web_search_call", status: "completed", action: {sources: [{url: "https://other.test/"}]}}]};
  await assert.rejects(discoverNews("JSON", {searchWeb, generateText: async () => null}), /not grounded/);
  response = {...response, output_text: "The news is unavailable."};
  await assert.rejects(discoverNews("JSON", {searchWeb, generateText: async () => null}), /brief could not be prepared/);
});
test("provider failures give actionable messages and keep only safe diagnostic fields", () => {
  const failure = generationFailure({status: 400, param: "response_format", type: "invalid_request_error", message: "private request content", code: "not a safe identifier"}, "source");
  assert.match(failure.errorMessage, /news search service rejected/);
  assert.deepEqual(failure.errorDiagnostics, {status: 400, parameter: "response_format", type: "invalid_request_error", code: null});
  assert.ok(!JSON.stringify(failure).includes("private request"));
  assert.match(generationFailure({status: 429}, "images").errorMessage, /quota or billing/);
  assert.match(generationFailure({status: 401}, "text").errorMessage, /credentials and access/);
  assert.match(generationFailure({}, "text").errorMessage, /Retry to resume/);
});
test("DeepSeek search parses only the final brief and never substitutes progress-message JSON", async () => {
  const raw = brief("https://example.test/report");
  const response = {status: "completed", output_text: 'Progress: {"incorrect":true}', output: [
    {type: "web_search_call", status: "completed", action: {type: "search", sources: [{url: raw.canonicalUrl}]}},
    {type: "message", status: "completed", content: [{type: "output_text", text: JSON.stringify({incorrect: true})}]},
    {type: "message", status: "completed", content: [{type: "output_text", text: 'Earlier draft:\n```json\n{"incorrect":true}\n```\nFinal brief:\n```json\n' + JSON.stringify(raw) + '\n```\n'}]},
  ]};
  assert.deepEqual(await discoverNews("JSON news", {searchWeb: async () => response}), raw);
  response.output[1].content[0].text = JSON.stringify(raw);
  response.output[2].content[0].text = "The final brief could not be prepared.";
  await assert.rejects(discoverNews("JSON news", {searchWeb: async () => response, generateText: async () => null}), /brief could not be prepared/);
});
test("a final answer is selected ahead of a later commentary message", async () => {
  const raw = brief("https://example.test/news");
  const response = {status: "completed", output: [
    {type: "web_search_call", status: "completed", action: {type: "open_page", url: raw.canonicalUrl}},
    {type: "message", status: "completed", phase: "final_answer", content: [{type: "output_text", text: JSON.stringify(raw)}]},
    {type: "message", status: "completed", phase: "commentary", content: [{type: "output_text", text: "The brief is ready."}]},
  ]};
  assert.deepEqual(await discoverNews("JSON", {searchWeb: async () => response, generateText: async () => {throw Error("No repair needed");}}), raw);
});
test("malformed search output gets one DeepSeek formatting repair without repeating search or trusting new URLs", async () => {
  const address = "https://example.test/news", raw = brief(address);
  const response = {status: "completed", output: [
    {type: "web_search_call", status: "completed", action: {type: "open_page", url: address}},
    {type: "message", status: "completed", content: [{type: "output_text", text: "A science exhibition opened. It explains space discoveries. Source: " + address}]},
  ]};
  let searches = 0, repairs = 0;
  const searchWeb = async () => {searches++; return response;};
  const generateText = async (input, options) => {
    repairs++; assert.equal(options.provider, "deepseek"); assert.equal(options.timeoutMs, 90000);
    assert.ok(input.prompt.includes(address)); assert.match(input.systemPrompt, /ONLY facts explicitly stated/); return raw;
  };
  assert.deepEqual(await discoverNews("JSON", {searchWeb, generateText}), raw);
  assert.equal(searches, 1); assert.equal(repairs, 1);
  await assert.rejects(discoverNews("JSON", {searchWeb, generateText: async () => ({...raw, sources: [{...raw.sources[0], url: "https://invented.test/news"}]})}), /not grounded/);
  await assert.rejects(discoverNews("JSON", {searchWeb, generateText: async () => ({error: "insufficient-evidence"})}), /brief could not be prepared/);
  const noSearch = {...response, output: response.output.slice(1)};
  await assert.rejects(discoverNews("JSON", {searchWeb: async () => noSearch, generateText: async () => {throw Error("Must not repair an uncompleted search");}}), /did not complete/);
});
test("AP headline and short URLs match the same full article ID and retain a retrieved URL", async () => {
  const articleId = "9c3945f36e4445dd4427f490c40e4bf3", short = "https://apnews.com/article/" + articleId;
  const headline = "https://apnews.com/article/climate-cop31-un-turkey-" + articleId;
  const raw = {title: "Climate news", canonicalUrl: headline, sources: [{url: headline, title: "Report", publisher: "AP", publishedAt: "2026-11-14"}],
    facts: [{text: "A climate meeting took place.", sourceIds: ["s1"]}, {text: "Representatives discussed emissions.", sourceIds: ["s1"]}]};
  const response = {status: "completed", output_text: JSON.stringify(raw), output: [
    {type: "web_search_call", status: "completed", action: {type: "search", sources: [{url: short}]}},
    {type: "web_search_call", status: "completed", action: {type: "open_page", url: short}}]};
  const result = await discoverNews("JSON news", {searchWeb: async () => response});
  assert.equal(result.canonicalUrl, short); assert.equal(result.sources[0].url, short);
  assert.deepEqual(result.facts, raw.facts);
  assert.equal(normalizeStory(result, {newsType: "international"}, new Date("2026-11-14")).canonicalStoryKey, short);
});
test("completed page opens and provider URL citations count as retrieved sources", async () => {
  const address = "https://example.test/news";
  const raw = brief(address);
  for (const item of [
    {type: "web_search_call", status: "completed", action: {type: "open_page", url: address}},
    {type: "web_search_call", status: "completed", action: {type: "find_in_page", url: address}},
    {type: "message", status: "completed", content: [{type: "output_text", annotations: [{type: "url_citation", url: address}]}]},
  ]) {
    if (item.type === "message") item.content[0].text = JSON.stringify(raw);
    const response = {status: "completed", output_text: JSON.stringify(raw), output: [{type: "web_search_call", status: "completed", action: {type: "search"}}, item]};
    assert.deepEqual(await discoverNews("JSON news", {searchWeb: async () => response}), raw);
  }
});
test("article matching rejects different IDs, unrelated hosts, inferred paths and failed tool calls", async () => {
  const retrieved = "https://apnews.com/article/9c3945f36e4445dd4427f490c40e4bf3";
  for (const address of [
    "https://apnews.com/article/climate-9c3945f36e4445dd4427f490c40e4bf4",
    "https://unrelated.test/article/climate-9c3945f36e4445dd4427f490c40e4bf3",
    "https://apnews.com.example.test/article/9c3945f36e4445dd4427f490c40e4bf3",
    "https://apnews.com/article/unrelated",
    "https://apnews.com/article/climate-9c3945f36e4445dd4427f490c40e4bf3?version=other",
  ]) {
    const response = {status: "completed", output_text: JSON.stringify(brief(address)),
      output: [{type: "web_search_call", status: "completed", action: {type: "search", sources: [{url: retrieved}]}},
        {type: "web_search_call", status: "failed", action: {type: "open_page", url: address, sources: [{url: address}]}}]};
    await assert.rejects(discoverNews("JSON news", {searchWeb: async () => response, generateText: async () => null}), /not grounded/);
  }
  const response = {status: "completed", output_text: JSON.stringify(brief("https://example.test/invented", {sources: brief("https://example.test/report").sources})),
    output: [{type: "web_search_call", status: "completed", action: {type: "search", sources: [{url: "https://example.test/report"}]}}]};
  const retained = await discoverNews("JSON news", {searchWeb: async () => response, generateText: async () => {throw Error("Verified facts need no additional LLM call");}});
  assert.equal(retained.canonicalUrl, "https://example.test/report"); assert.equal(retained.sources.length, 1); assert.equal(retained.facts.length, 2);
});
test("article validation rejects unsupported facts, duplicate images, wrong page counts and text in picture-only editions", () => {
  const story = normalizeStory({title: "News", sources: [{title: "Report", publisher: "News", url: "https://example.test/news", publishedAt: "2026-11-14"}], facts: [{text: "Fact one", sourceIds: ["s1"]}, {text: "Fact two", sourceIds: ["s1"]}]}, {newsType: "international"}, new Date("2026-11-14"));
  const settings = {pageCount: 1, photoCount: 1, targetWordCount: 0, articleTypeId: "pictureStory"}, draft = {title: "News", pages: [{text: "", factIds: ["f1"], imageIndices: [0], altTexts: ["Scene"]}], imagePlans: [{description: "Scene", searchTerms: "science", factIds: ["f1"]}]};
  assert.equal(normalizeDraft(draft, settings, story).actualWordCount, 0);
  for (const change of [value => value.pages[0].text = "Words", value => value.pages[0].imageIndices = [0, 0], value => value.pages[0].factIds = ["invented"], value => value.pages.push(value.pages[0])]) {
    const invalid = structuredClone(draft); change(invalid); assert.throws(() => normalizeDraft(invalid, settings, story));
  }
});
test("image retrieval rejects unsupported hosts before making a request", async () => {
  await assert.rejects(fetchBytes("https://127.0.0.1/private", {hosts: ["upload.wikimedia.org"], fetchImpl: async () => {throw Error("must not run");}}));
});
test("model image search term lists become one query without coercing invalid values", () => {
  const story = {facts: [{id: "f1"}]}, settings = {pageCount: 1, photoCount: 1, targetWordCount: 400, articleTypeId: "standardArticle"};
  const raw = {title: "Climate news", pages: [{text: "Representatives discussed emissions.", factIds: ["f1"], imageIndices: [0], altTexts: ["Climate meeting"]}],
    imagePlans: [{description: "Delegates at a climate meeting", searchTerms: ["COP31 climate summit", "Antalya Türkiye"], factIds: ["f1"]}]};
  assert.equal(normalizeDraft(raw, settings, story).imagePlans[0].searchTerms, "COP31 climate summit Antalya Türkiye");
  for (const value of [[], [null], ["valid", 123], [""], {query: "climate"}, ["x".repeat(251)]]) {
    const invalid = structuredClone(raw); invalid.imagePlans[0].searchTerms = value;
    assert.throws(() => normalizeDraft(invalid, settings, story), /Invalid image search/);
  }
});
test("generation trigger runs only newly queued sequences", async () => {
  let calls = 0;
  const event = (before, after) => ({params: {generationId: "job"}, data: {before: {data: () => before}, after: {data: () => after}}});
  const run = async (id, sequence) => {calls++; assert.equal(id, "job"); assert.equal(sequence, 2);};
  await processNewsGeneration(event({requestSequence: 1}, {status: "queued", requestSequence: 2}), {run});
  await processNewsGeneration(event({requestSequence: 2}, {status: "queued", requestSequence: 2}), {run});
  await processNewsGeneration(event(null, {status: "completed", requestSequence: 2}), {run});
  assert.equal(calls, 1);
});
