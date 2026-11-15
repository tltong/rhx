const {generateLlmText} = require("../../utils/llm/llm_ops");
const {editionKeys} = require("../news_article/domain/news_article");
const {newsFactsKey, titleKey} = require("../news_article/domain/news_title");
const domain = require("./domain/news_identity");
const compareNewsStories = (candidate, records) => generateLlmText(domain.comparisonPrompt(candidate, records), {provider: "deepseek", maxTokens: 2500, temperature: 0, timeoutMs: 120000});
const findSimilarNewsTitles = (candidate, records) => generateLlmText(domain.titleSelectionPrompt(candidate, records), {provider: "deepseek", maxTokens: 8192, temperature: 0, timeoutMs: 120000});
const RESET = {identityRevision: null, identityTitleCursor: 0, identityTitleScanComplete: false, identityCandidateIds: [], identityFactCursor: 0, identityUpdateOf: null};
function createNewsIdentity({repository, compare = compareNewsStories, selectTitles = findSimilarNewsTitles} = {}) {
  async function catalog() {await repository.syncStoryIdentities(); return repository.storyIdentityCatalog();}
  async function reject(job, candidate) {
    const exhausted = job.discoveryCandidateCount >= domain.MAX_DISCOVERY_CANDIDATES;
    return repository.checkpoint(job, {...RESET, candidateStory: null, stage: "source", discoveryCandidateCount: exhausted ? 0 : job.discoveryCandidateCount,
      duplicateRejections: [...(job.duplicateRejections || []), candidate].slice(-domain.MAX_DISCOVERY_CANDIDATES),
      ...(exhausted ? {errorCode: "already-exists", errorMessage: "Search kept finding previously prepared news. Select a pooled story or retry to find a different development.", errorDiagnostics: {code: "duplicate-news", rejectedCandidates: domain.MAX_DISCOVERY_CANDIDATES}} : {})}, exhausted ? "failed" : "queued");
  }
  async function run(job) {
    const known = await catalog(), current = job.identityRevision === known.revision ? job : {...job, ...RESET, identityRevision: known.revision};
    let candidate = current.candidateStory;
    const exact = known.items.find(record => record.titleKey === titleKey(candidate.canonicalTitle) && record.newsFactsKey === newsFactsKey(candidate.facts));
    if (exact) return reject(job, candidate);
    const large = known.items.length > domain.DIRECT_COMPARE_LIMIT;
    if (large && !current.identityTitleScanComplete) {
      const batch = known.items.slice(current.identityTitleCursor || 0, (current.identityTitleCursor || 0) + domain.TITLE_BATCH_SIZE);
      const selected = domain.normalizeTitleSelection(await selectTitles(candidate, batch), batch);
      candidate = domain.canonicalStory(candidate, selected.canonicalTitle);
      const cursor = (current.identityTitleCursor || 0) + batch.length;
      const exactTitles = known.items.filter(record => record.titleKey === titleKey(candidate.canonicalTitle)).map(record => record.storyId);
      return repository.checkpoint(job, {...currentState(current), candidateStory: candidate, identityRevision: known.revision, identityTitleCursor: cursor,
        identityTitleScanComplete: cursor >= known.items.length, identityCandidateIds: [...new Set([...(current.identityCandidateIds || []), ...selected.candidateIds, ...exactTitles])]});
    }
    const records = large ? known.items.filter(record => current.identityCandidateIds.includes(record.storyId)) : known.items;
    const cursor = current.identityFactCursor || 0, batch = domain.factBatch(records, cursor, candidate);
    let updateOf = current.identityUpdateOf || null;
    if (batch.length || candidate.canonicalTitleLanguage !== "English") {
      const decision = domain.normalizeComparison(await compare(candidate, batch), candidate, batch);
      candidate = domain.canonicalStory(candidate, decision.canonicalTitle);
      if (decision.matchType === "duplicate") return reject(job, candidate);
      if (decision.matchType === "new_development") updateOf = decision.matchedStoryId;
    } else candidate = domain.canonicalStory(candidate, candidate.canonicalTitle);
    const next = cursor + batch.length;
    if (next < records.length) return repository.checkpoint(job, {...currentState(current), candidateStory: candidate, identityRevision: known.revision, identityFactCursor: next, identityUpdateOf: updateOf});
    const {developmentOfStoryId, ...currentCandidate} = candidate;
    candidate = updateOf ? {...currentCandidate, developmentOfStoryId: updateOf} : currentCandidate;
    const accepted = await repository.acceptStoryIdentity(job, candidate, known.revision, job.kind === "discovery" ? {stage: "publish"} : {...editionKeys(candidate, job.settings, job.language), stage: "text"});
    if (accepted.duplicate) return reject(job, candidate);
    return accepted;
  }
  function currentState(job) {return Object.fromEntries(Object.keys(RESET).map(field => [field, job[field] ?? RESET[field]]));}
  return {catalog, run};
}
module.exports = {createNewsIdentity, compareNewsStories, findSimilarNewsTitles, RESET};
