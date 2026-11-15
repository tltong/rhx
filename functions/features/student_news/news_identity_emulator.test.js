const assert = require("node:assert/strict"), test = require("node:test");
const {createTestSystem} = require("../../../tests/news_test_support.cjs");
const {normalizeStory} = require("../news_article/domain/news_article");
const {storyIdentity} = require("../news_article_generator/domain/news_identity");
const {hash} = require("../news_article/domain/news_article");
const admin = {auth: {uid: "admin"}}, host = process.env.FIRESTORE_EMULATOR_HOST;
const input = (id, extra = {}) => ({newsType: "international", level: "primary", standard: 6, language: "English", clientRequestId: id, ...extra});
function brief(title = "Space exhibition opens in London", facts = ["A space exhibition opened in London.", "It includes a lunar rock display."], url = "https://example.test/science") {
  return {title, canonicalTitle: title, canonicalUrl: url, sources: [{url, title, publisher: "News", publishedAt: "2026-11-14"}], facts: facts.map(text => ({text, sourceIds: ["s1"]}))};
}
const newStory = candidate => ({canonicalTitle: candidate.canonicalTitle, matchType: "new_story", matchedStoryId: null, newFactIndices: []});
const duplicate = (candidate, records) => ({...newStory(candidate), matchType: "duplicate", matchedStoryId: records[0].storyId});
const step = async (s, id) => {const job = await s.repository.job(id); await s.generator.run(id, job.requestSequence); return s.repository.job(id);};
async function seedLegacy(s, id = "legacy_url_hash", raw = brief(), preview = false) {
  const {canonicalTitle, titleKey, newsFactsKey, identityVersion, canonicalTitleLanguage, ...story} = normalizeStory(raw, {newsType: "international"}, s.now());
  story.storyId = id;
  if (preview) await s.db.doc("newsGenerations/saved_" + id).set({mode: "preview", status: "failed", stage: "text", story});
  else await s.db.doc("newsStories/" + id).set(story);
  return story;
}
test("legacy pool and private preview briefs are indexed without publishing or changing saved identities", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-legacy");
  try {
    await seedLegacy(s); await seedLegacy(s, "private_id", brief("Ocean expedition begins", ["Scientists began an ocean expedition.", "They will study coral reefs."]), true);
    await s.db.doc("studentNews/student/history/legacy_url_hash").set({completedAt: s.now()});
    const catalog = await s.generator.identity.catalog(); assert.equal(catalog.items.length, 2);
    assert.deepEqual(new Set(catalog.items.map(item => item.storyId)), new Set(["legacy_url_hash", "private_id"]));
    assert.equal((await s.generator.identity.catalog()).revision, catalog.revision, "backfill is idempotent");
    assert.equal((await s.db.collection("newsStories").get()).size, 1); assert.equal((await s.db.collection("newsEditions").get()).size, 0);
    assert.equal((await s.repository.story("legacy_url_hash")).canonicalTitle, undefined);
    assert.equal((await s.db.doc("studentNews/student/history/legacy_url_hash").get()).exists, true);
    s.state.discoveryQueue = [brief("Ocean research team sets sail", ["An expedition to study coral reefs has begun.", "Scientists are travelling across the ocean."], "https://other.test/ocean")];
    s.state.identityComparison = (candidate, records) => ({...duplicate(candidate, records), matchedStoryId: "private_id"});
    const started = await s.service.generateNewsPreview(input("check-private"), admin);
    await step(s, started.generationId); const rejected = await step(s, started.generationId);
    assert.equal(rejected.stage, "source"); assert.equal(rejected.duplicateRejections.length, 1); assert.equal(s.calls.adapt, 0); assert.equal(s.calls.ai, 0);
  } finally {await s.db.terminate();}
});
test("same development on another URL is skipped automatically before text or images, and retries are bounded", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-duplicates");
  try {
    const raw = brief(); s.state.discoveryQueue = [raw];
    const original = await s.service.generateNewsPreview(input("first"), admin); await s.drain(original.generationId);
    const previous = await s.repository.job(original.generationId), before = {...s.calls};
    const alternate = brief("Park opens in Kuala Lumpur", ["Kuala Lumpur opened a new public park.", "It has a children's playground."], "https://example.test/park");
    s.state.discoveryQueue = [brief(raw.canonicalTitle, raw.facts.map(f => f.text), "https://other.test/reprint"), alternate];
    const fresh = await s.service.generateNewsPreview(input("second"), admin);
    await step(s, fresh.generationId); let job = await step(s, fresh.generationId);
    assert.equal(job.stage, "source"); assert.equal(s.calls.identity, before.identity, "exact title and facts need no model call");
    assert.equal(s.calls.adapt, before.adapt); assert.equal(s.calls.ai, before.ai);
    job = await s.drain(fresh.generationId); assert.equal(job.status, "completed"); assert.notEqual(job.story.storyId, previous.story.storyId);
    assert.equal(s.calls.discover, 3); assert.equal((await s.db.collection("newsStories").get()).size, 0, "both previews stay private");
    s.state.discoveryQueue = Array(3).fill(raw);
    const bounded = await s.service.generateNewsPreview(input("bounded"), admin); job = await s.drain(bounded.generationId);
    assert.equal(job.status, "failed"); assert.equal(job.stage, "source"); assert.equal(job.errorCode, "already-exists");
    assert.equal(s.calls.discover, 6); assert.equal(job.discoveryCandidateCount, 0);
    s.state.discoveryQueue = [brief("Mars probe launches", ["A probe launched towards Mars.", "It will measure the planet's atmosphere."], "https://example.test/mars")];
    await s.repository.retry(job.generationId); job = await s.drain(job.generationId); assert.equal(job.status, "completed"); assert.equal(s.calls.discover, 7);
  } finally {await s.db.terminate();}
});
test("semantic rewording is blocked while a material update can keep its title and source URL", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-updates");
  try {
    const original = await seedLegacy(s);
    s.state.discoveryQueue = [brief("London welcomes space show", ["A new London exhibit about space has opened.", "Visitors can see a rock from the Moon."], "https://other.test/space")];
    s.state.identityComparison = duplicate;
    const same = await s.service.generateNewsPreview(input("paraphrase"), admin);
    await step(s, same.generationId); let job = await step(s, same.generationId);
    assert.equal(job.stage, "source"); assert.equal(s.calls.adapt, 0);
    s.state.discoveryQueue = [brief(original.sourceTitle, ["The London space exhibition welcomed its millionth visitor today.", "The museum announced that the show will stay open for another year."])];
    s.state.identityComparison = (candidate, records) => ({...newStory(candidate), matchType: "new_development", matchedStoryId: records[0].storyId, newFactIndices: [1, 2]});
    const update = await s.service.generateNewsPreview(input("update"), admin); job = await s.drain(update.generationId);
    assert.equal(job.status, "completed"); assert.equal(job.story.developmentOfStoryId, original.storyId);
    assert.equal(job.story.canonicalStoryKey, original.canonicalStoryKey); assert.equal(job.story.canonicalTitle, original.sourceTitle); assert.notEqual(job.story.storyId, original.storyId);
    assert.equal((await s.db.collection("newsStories").get()).size, 1, "a private update is not implicitly published");
  } finally {await s.db.terminate();}
});
test("concurrent differently worded discoveries recheck the same candidate when the catalog changes", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-race");
  try {
    s.state.discoveryQueue = [brief(), brief("London space show opens", ["London opened an exhibition about space.", "A rock from the Moon is on display."], "https://other.test/show")];
    const first = await s.service.generateNewsPreview(input("race-a"), admin), second = await s.service.generateNewsPreview(input("race-b"), admin);
    await step(s, first.generationId); await step(s, second.generationId);
    const firstClaim = await s.repository.claim(first.generationId, (await s.repository.job(first.generationId)).requestSequence);
    const secondClaim = await s.repository.claim(second.generationId, (await s.repository.job(second.generationId)).requestSequence);
    const accept = s.repository.acceptStoryIdentity.bind(s.repository);
    let arrivals = 0, release; const bothCompared = new Promise(resolve => {release = resolve;});
    s.repository.acceptStoryIdentity = async (...args) => {if (++arrivals === 2) release(); await bothCompared; return accept(...args);};
    const [a, b] = await Promise.all([s.generator.identity.run(firstClaim), s.generator.identity.run(secondClaim)]);
    assert.equal([a, b].filter(result => result.accepted).length, 1); assert.equal([a, b].filter(result => result.stale).length, 1);
    const waitingId = a.stale ? first.generationId : second.generationId, acceptedId = a.accepted ? first.generationId : second.generationId;
    assert.equal((await s.repository.job(waitingId)).stage, "deduplicate"); assert.equal(s.calls.discover, 2);
    s.state.identityComparison = duplicate;
    const rejected = await step(s, waitingId); assert.equal(rejected.stage, "source"); assert.equal(s.calls.discover, 2, "catalog races do not repeat discovery");
    assert.equal((await s.repository.job(acceptedId)).stage, "text"); assert.equal((await s.generator.identity.catalog()).items.length, 1); assert.equal(s.calls.adapt, 0);
  } finally {await s.db.terminate();}
});
test("expired workers cannot register a story or advance a replacement worker", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-lease");
  try {
    s.state.discoveryQueue = [brief()]; const started = await s.service.generateNewsPreview(input("lease"), admin); await step(s, started.generationId);
    const current = await s.repository.job(started.generationId), claimed = await s.repository.claim(started.generationId, current.requestSequence);
    s.setTime("2026-11-14T10:11:00Z"); await s.repository.retry(started.generationId);
    const replacement = await s.repository.claim(started.generationId, (await s.repository.job(started.generationId)).requestSequence);
    await assert.rejects(s.repository.acceptStoryIdentity(claimed, claimed.candidateStory, 0, {stage: "text"}), error => error.code === "generation-lease-lost");
    assert.equal((await s.generator.identity.catalog()).items.length, 0);
    assert.equal((await s.repository.job(started.generationId)).leaseToken, replacement.leaseToken);
    await s.generator.identity.run(replacement); assert.equal((await s.generator.identity.catalog()).items.length, 1);
  } finally {await s.db.terminate();}
});
test("large catalogs scan every title including older private stories before comparing the full facts", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-large");
  try {
    const old = await seedLegacy(s, "000_old_private", brief(), true);
    const batch = s.db.batch();
    for (let i = 0; i < 125; i++) {
      const raw = brief("School " + i + " opens a library", ["School " + i + " opened a library.", "The library has 500 books."], "https://example.test/library-" + i);
      const record = storyIdentity(normalizeStory(raw, {newsType: "international"}, s.now()));
      batch.create(s.db.doc("newsStoryIdentities/" + record.storyId), record);
    }
    await batch.commit(); const scanned = [];
    s.state.identitySelection = (candidate, records) => {scanned.push(...records.map(record => record.storyId)); return {canonicalTitle: candidate.canonicalTitle, candidateIds: records.filter(record => record.storyId === old.storyId).map(record => record.storyId)};};
    s.state.identityComparison = (candidate, records) => {assert.equal(records.length, 1); assert.equal(records[0].storyId, old.storyId); assert.deepEqual(records[0].facts, old.facts.map(fact => fact.text)); return duplicate(candidate, records);};
    s.state.discoveryQueue = [brief("Moon rocks draw crowds to new London exhibition", ["A London exhibition about space opened.", "It displays a sample of lunar rock."], "https://other.test/moon")];
    const started = await s.service.generateNewsPreview(input("large"), admin);
    await step(s, started.generationId); await step(s, started.generationId); await step(s, started.generationId);
    const job = await step(s, started.generationId);
    assert.equal(job.stage, "source"); assert.equal(new Set(scanned).size, 126); assert.equal(s.calls.identityTitles, 2); assert.equal(s.calls.identity, 1); assert.equal(s.calls.adapt, 0);
  } finally {await s.db.terminate();}
});
test("grade and language editions intentionally reuse pooled stories and discovery publishes only accepted stories", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-identity-reuse");
  try {
    const original = await seedLegacy(s); await s.generator.identity.catalog();
    const preview = await s.service.generateNewsPreview(input("reuse", {storyId: original.storyId, standard: 1}), admin);
    const job = await s.drain(preview.generationId); assert.equal(job.status, "completed"); assert.equal(job.story.storyId, original.storyId);
    const translated = await s.service.requestNewsPreviewLanguage({generationId: preview.generationId, language: "French"}, admin); await s.drain(translated.generationId);
    assert.equal((await s.repository.job(translated.generationId)).story.storyId, original.storyId);
    assert.equal(s.calls.discover, 0); assert.equal(s.calls.identity, 0);
    const discovery = await s.generator.enqueueDiscovery({newsType: "international", country: null}, new Set([original.storyId]), "");
    let current = await step(s, discovery.generationId); assert.equal(current.stage, "deduplicate");
    current = await step(s, discovery.generationId); assert.equal(current.stage, "publish");
    current = await step(s, discovery.generationId); assert.equal(current.status, "completed");
    assert.equal((await s.db.collection("newsStories").get()).size, 2); assert.equal(s.calls.discover, 1);
    assert.equal(hash((await s.repository.story(original.storyId)).facts), original.factsHash);
  } finally {await s.db.terminate();}
});
