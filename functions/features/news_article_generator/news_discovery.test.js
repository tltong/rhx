const assert = require("node:assert/strict"), test = require("node:test");
const {discoverNews} = require("./infrastructure/news_providers");
const {completeBrief, searchEvidence, bindSourceUrls} = require("./domain/news_discovery_result");
const {groundNewsSources} = require("./domain/news_source_grounding");
const {generationFailure} = require("./domain/news_generation_errors");
const address = "https://example.test/science";
const brief = () => ({title: "Science exhibition opens", canonicalUrl: address,
  sources: [{url: address, title: "Science report", publisher: "Example News", publishedAt: "2026-11-14T00:00:00Z"}],
  facts: [{text: "A science exhibition opened.", sourceIds: ["s1"]}, {text: "It explains discoveries about space.", sourceIds: ["s1"]}]});
const response = output => ({status: "completed", output: [{type: "web_search_call", status: "completed", action: {type: "open_page", url: address}},
  {type: "message", status: "completed", phase: "final_answer", content: [{type: "output_text", text: output}]}]});
test("partial JSON is repaired from the same verified report without repeating search", async () => {
  let searches = 0, formats = 0;
  const partial = response(JSON.stringify({title: "Science exhibition opens", sources: brief().sources, facts: brief().facts}));
  assert.deepEqual(await discoverNews("Discover a story", {searchWeb: async () => {searches++; return partial;}, generateText: async (input, options) => {
    formats++; assert.match(input.systemPrompt, /ONLY facts explicitly stated/); assert.equal(options.provider, "deepseek"); return brief();
  }}), brief());
  assert.equal(searches, 1); assert.equal(formats, 1);
});
test("insufficient reporting gets one compact recovery search with the original criteria", async () => {
  const prompts = [], options = []; let formats = 0;
  const result = await discoverNews("Original local Malaysia request and excluded URLs", {searchWeb: async (prompt, config) => {
    prompts.push(prompt); options.push(config); return prompts.length === 1 ? response("A report was found but its publication date is unavailable.") : response(JSON.stringify(brief()));
  }, generateText: async () => {formats++; return {error: "insufficient-evidence"};}});
  assert.deepEqual(result, brief()); assert.equal(formats, 1); assert.equal(prompts.length, 2);
  assert.match(prompts[1], /^Original local Malaysia request and excluded URLs/); assert.match(prompts[1], /RECOVERY SEARCH/); assert.match(prompts[1], /Open and read usable article pages/);
  assert.deepEqual(options.map(option => option.timeoutMs), [180000, 120000]); assert.ok(options.every(option => option.provider === "deepseek" && option.jsonMode));
});
test("missing tool source links cannot be invented by formatting; recovery must retrieve them", async () => {
  let searches = 0;
  const noLinks = {status: "completed", output: [{type: "web_search_call", status: "completed", action: {type: "search", queries: ["science exhibition"]}}], output_text: JSON.stringify(brief())};
  const result = await discoverNews("Find science news", {searchWeb: async () => ++searches === 1 ? noLinks : response(JSON.stringify(brief())), generateText: async () => {throw Error("Formatting cannot make missing source links trustworthy");}});
  assert.deepEqual(result, brief()); assert.equal(searches, 2);
});
test("two insufficient searches fail with safe bounded diagnostics and no further calls", async () => {
  let searches = 0; const timeouts = [];
  await assert.rejects(discoverNews("Find news", {searchWeb: async () => {searches++; return response("Private news report body");}, generateText: async (_input, options) => {timeouts.push(options.timeoutMs); return {error: "insufficient-evidence"};}}), error => {
    assert.equal(error.newsDiscoveryDiagnostics.attempts, 2); assert.equal(error.newsDiscoveryDiagnostics.reason, "insufficient-evidence");
    const failure = generationFailure(error, "source"); assert.equal(failure.errorDiagnostics.newsDiscovery.sourceUrlCount, 1); assert.equal(failure.errorDiagnostics.newsDiscovery.formatAttempted, true);
    assert.ok(!JSON.stringify(failure).includes("Private news report body")); return true;
  });
  assert.equal(searches, 2); assert.deepEqual(timeouts, [90000, 45000]);
});
test("authentication, quota and transport failures do not trigger another paid search", async () => {
  for (const status of [401, 403, 429, 502]) {
    let searches = 0; const failure = Object.assign(Error("Provider failed"), {status});
    await assert.rejects(discoverNews("Find news", {searchWeb: async () => {searches++; throw failure;}}), error => error === failure);
    assert.equal(searches, 1);
    searches = 0;
    await assert.rejects(discoverNews("Find news", {searchWeb: async () => {searches++; return response("A report needing formatting");}, generateText: async () => {throw failure;}}), error => error === failure);
    assert.equal(searches, 1);
  }
});
test("recovery still rejects invented URLs and never falls back to unverified progress JSON", async () => {
  const forged = {...brief(), canonicalUrl: "https://unretrieved.test/news", sources: [{...brief().sources[0], url: "https://unretrieved.test/news"}]};
  let searches = 0;
  await assert.rejects(discoverNews("Find news", {searchWeb: async () => {searches++; return response(JSON.stringify(forged));}, generateText: async () => forged}), error => {
    assert.match(error.message, /not grounded/); assert.equal(error.newsDiscoveryDiagnostics.attempts, 2); return true;
  }); assert.equal(searches, 2);
});
test("empty text containers preserve an available aggregate report for formatting", async () => {
  const captured = response(""); captured.output_text = "A science exhibition opened. Students can learn about space. Published 14 November 2026 by Example News.";
  assert.equal(searchEvidence(captured).report, captured.output_text);
  assert.deepEqual(await discoverNews("Find news", {searchWeb: async () => captured, generateText: async () => brief()}), brief());
  captured.output_text = JSON.stringify(brief());
  assert.deepEqual(await discoverNews("Find news", {searchWeb: async () => captured, generateText: async () => {throw Error("A complete aggregate brief needs no paid formatting pass");}}), brief());
});
test("brief validation rejects missing facts, invalid metadata and broken source references", () => {
  assert.ok(completeBrief(brief()));
  for (const mutate of [value => delete value.title, value => value.facts = [], value => value.sources[0].publishedAt = "unknown", value => value.facts[0].sourceIds = ["s2"], value => value.facts[0].sourceIds = [["s1"]]]) {
    const value = brief(); mutate(value); assert.equal(!!completeBrief(value), false);
  }
});
test("clean source links match opened analytics-tagged URLs while content parameters remain strict", async () => {
  const opened = address + "?at_medium=RSS%20feed&at_campaign=ynews&utm_source=yahoo", captured = response(JSON.stringify(brief()));
  captured.output[0].action.url = opened;
  const result = await discoverNews("Find science news", {searchWeb: async () => captured});
  assert.equal(result.canonicalUrl, address + "?at_medium=RSS+feed&at_campaign=ynews"); assert.equal(result.sources[0].url, result.canonicalUrl);
  const unsafe = response(JSON.stringify(brief())); unsafe.output[0].action.url = address + "?version=other&at_medium=rss";
  await assert.rejects(discoverNews("Find science news", {searchWeb: async () => unsafe, generateText: async () => null}), /not grounded/);
});
test("one unverified source cannot discard a usable brief; unsupported facts are removed and citations remapped", async () => {
  const unverified = "https://unretrieved.test/news", raw = brief(); raw.canonicalUrl = unverified;
  raw.sources = [{...raw.sources[0], url: unverified, title: "Unsupported source"}, {...raw.sources[0], title: "Verified source headline"}];
  raw.facts = [{text: "Only the unverified source claims this.", sourceIds: ["s1"]}, {text: "A verified fact.", sourceIds: ["s2"]}, {text: "A second verified fact.", sourceIds: ["s1", "s2"]}];
  let searches = 0;
  const result = await discoverNews("Find news", {searchWeb: async () => {searches++; return response(JSON.stringify(raw));}, generateText: async () => {throw Error("Enough verified facts already exist");}});
  assert.equal(searches, 1); assert.equal(result.canonicalUrl, address); assert.equal(result.title, "Verified source headline"); assert.equal(result.sources.length, 1);
  assert.deepEqual(result.facts, [{text: "A verified fact.", sourceIds: ["s1"]}, {text: "A second verified fact.", sourceIds: ["s1"]}]);
});
test("complete JSON with an ungrounded citation gets same-search repair using fixed URL IDs", async () => {
  const forged = {...brief(), canonicalUrl: "https://unretrieved.test/news", sources: [{...brief().sources[0], url: "https://unretrieved.test/news"}]};
  let searches = 0, repairs = 0;
  const result = await discoverNews("Find news", {searchWeb: async () => {searches++; return response(JSON.stringify(forged));}, generateText: async input => {
    repairs++; const data = JSON.parse(input.prompt.split("verified source selection:\n")[1]);
    assert.deepEqual(data.sourceOptions, [{id: "u1", url: address}]);
    assert.match(input.systemPrompt, /instead of writing URL strings/);
    return {title: brief().title, canonicalSourceUrlId: "u1", sources: [{...brief().sources[0], sourceUrlId: "u1", url: "https://unretrieved.test/ignored"}], facts: brief().facts};
  }});
  assert.equal(searches, 1); assert.equal(repairs, 1); assert.deepEqual(result, brief());
});
test("source selection IDs cannot invent a URL or choose a failed tool result", () => {
  const selected = {title: "News", canonicalSourceUrlId: "u999", sources: [{sourceUrlId: "u1"}]};
  assert.throws(() => bindSourceUrls(selected, [{id: "u1", url: address}]), /outside the retrieved links/);
  const raw = brief(), failed = {status: "completed", output: [{type: "web_search_call", status: "completed", action: {type: "search", queries: ["science"]}}, {type: "web_search_call", status: "failed", action: {type: "open_page", url: address}}]};
  assert.throws(() => groundNewsSources(raw, failed), /not grounded/);
});
test("verified duplicate URLs share one source identity without losing supported facts", () => {
  const raw = brief(); raw.sources.push({...raw.sources[0]}); raw.facts[1].sourceIds = ["s1", "s2"];
  const result = groundNewsSources(raw, response(JSON.stringify(raw)));
  assert.equal(result.sources.length, 1); assert.deepEqual(result.facts[1].sourceIds, ["s1"]);
});
test("fewer than two supported facts still fail with exact source and fact counts", async () => {
  const raw = brief(); raw.sources.push({...raw.sources[0], url: "https://unretrieved.test/news"}); raw.facts[1].sourceIds = ["s2"];
  await assert.rejects(discoverNews("Find news", {searchWeb: async () => response(JSON.stringify(raw)), generateText: async () => ({error: "insufficient-evidence"})}), error => {
    assert.equal(error.newsDiscoveryDiagnostics.requestedSourceCount, 2); assert.equal(error.newsDiscoveryDiagnostics.verifiedSourceCount, 1); assert.equal(error.newsDiscoveryDiagnostics.retainedFactCount, 1);
    assert.equal(error.newsDiscoveryDiagnostics.formatAttempted, true); return true;
  });
});
