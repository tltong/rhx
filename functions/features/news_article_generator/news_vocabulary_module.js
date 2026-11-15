const {hash, key, fail} = require("../news_article/domain/news_article");
const domain = require("../news_article/domain/news_vocabulary");
const {selectionPrompt, meaningPrompt} = require("./domain/news_vocabulary_prompts");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const selectNewsVocabulary = (edition, count) => generateLlmText(selectionPrompt(edition, count), {provider: "deepseek", maxTokens: Math.min(16000, 1500 + count * 250), maxTokenLimit: 16000, timeoutMs: 120000});
const explainNewsVocabulary = (selection, item, language) => generateLlmText(meaningPrompt(selection, item, language), {provider: "deepseek", maxTokens: 1000, temperature: 0, timeoutMs: 90000});
function createNewsVocabulary({repository, select = selectNewsVocabulary, explain = explainNewsVocabulary, now = () => new Date()} = {}) {
  async function prepare(edition, requestedCount) {
    const existing = await repository.vocabulary(edition.editionId, domain.setId(requestedCount)); if (existing?.status === "ready") return existing;
    const empty = !requestedCount || !edition.pages.some(page => page.text.trim());
    return {...domain.normalizeVocabulary(empty ? {terms: []} : await select(edition, requestedCount), edition, requestedCount), createdAt: now()};
  }
  async function jobState(job, retry) {
    if ((retry && job.status === "failed") || (job.status === "running" && new Date(job.leaseUntil?.toDate?.() || job.leaseUntil).getTime() < now().getTime())) job = await repository.retry(job.generationId);
    return {status: job.status, generationId: job.generationId, errorMessage: job.errorMessage || null};
  }
  async function selection(edition, requestedCount, {retry = false} = {}) {
    const setId = domain.setId(requestedCount), existing = await repository.vocabulary(edition.editionId, setId);
    if (existing?.status === "ready") return existing;
    if (!requestedCount || !edition.pages.some(page => page.text.trim())) return repository.ensureVocabulary(await prepare(edition, requestedCount));
    const source = {editionId: edition.editionId, gradeKey: edition.gradeKey, language: edition.language, pages: edition.pages.map(page => ({position: page.position, text: page.text}))};
    const job = await repository.ensureJob("vocabulary_" + hash([edition.editionId, setId]), {mode: "vocabulary", kind: "vocabulary", stage: "vocabulary", vocabularySource: source, requestedCount, setId});
    const state = await jobState(job, retry);
    // A worker can finish between the first cache read and the job read.
    if (state.status === "completed") {const saved = await repository.vocabulary(edition.editionId, setId); if (saved) return saved; throw fail("Prepared vocabulary is unavailable.", "failed-precondition");}
    return {editionId: edition.editionId, setId, requestedCount, actualCount: 0, items: [], ...state};
  }
  async function meaning(selection, item, language, {create = true} = {}) {
    if (key(language) === key(selection.language) && item.articleMeaning) return {termId: item.id, language, meaning: item.articleMeaning, status: "ready", generationId: null};
    const meaningId = domain.meaningId(item.id, language), existing = await repository.meaning(selection.editionId, selection.setId, meaningId);
    if (existing?.status === "ready") return existing;
    const generationId = "meaning_" + hash([selection.editionId, selection.setId, meaningId]);
    let job = create ? await repository.ensureJob(generationId, {mode: "vocabulary", kind: "meaning", stage: "meaning", sourceEditionId: selection.editionId, setId: selection.setId, termId: item.id, meaningId, meaningLanguage: language}) : await repository.job(generationId);
    if (!job) throw fail("Request the meaning before checking its preparation.", "not-found");
    const state = await jobState(job, create);
    if (state.status === "completed") {const saved = await repository.meaning(selection.editionId, selection.setId, meaningId); if (saved) return saved; throw fail("Prepared meaning is unavailable.", "failed-precondition");}
    return {termId: item.id, language, meaning: null, ...state};
  }
  async function run(job) {
    if (job.kind === "vocabulary") {
      const saved = await prepare(job.vocabularySource, job.requestedCount);
      return repository.checkpoint(job, {completedAt: now()}, "completed", [{ref: repository.vocabularyRef(saved.editionId, saved.setId), data: saved}]);
    }
    const selected = await repository.vocabulary(job.sourceEditionId, job.setId), item = selected?.items.find(item => item.id === job.termId);
    if (!item) throw fail("The vocabulary item is unavailable.", "failed-precondition");
    let saved = await repository.meaning(job.sourceEditionId, job.setId, job.meaningId);
    if (!saved) saved = {termId: item.id, language: job.meaningLanguage, meaning: domain.normalizeMeaning(await explain(selected, item, job.meaningLanguage)),
      status: "ready", generationId: job.generationId, updatedAt: now()};
    return repository.checkpoint(job, {completedAt: now()}, "completed", [{ref: repository.meaningRef(job.sourceEditionId, job.setId, job.meaningId), data: saved}]);
  }
  return {prepare, selection, meaning, run};
}
module.exports = {createNewsVocabulary, selectNewsVocabulary, explainNewsVocabulary};
