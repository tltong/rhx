const {hash, fail} = require("../news_article/domain/news_article");
const domain = require("../news_article/domain/news_questions");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const {questionsPrompt, questionsLanguagePrompt} = require("./domain/news_questions_prompts");
const generateNewsQuestions = edition => generateLlmText(questionsPrompt(edition), {provider: "deepseek", maxTokens: 5000, timeoutMs: 120000});
const translateNewsQuestions = (selected, edition) => generateLlmText(questionsLanguagePrompt(selected, edition), {provider: "deepseek", maxTokens: 5000, timeoutMs: 120000});
function createNewsQuestions({repository, generate = generateNewsQuestions, translate = translateNewsQuestions, now = () => new Date()} = {}) {
  const source = edition => ({editionId: edition.editionId, storyId: edition.storyId, baseKey: edition.baseKey, questionFamilyId: edition.questionFamilyId || edition.baseKey, gradeKey: edition.gradeKey,
    language: edition.language, title: edition.title, pages: edition.pages, imagePlans: edition.imagePlans});
  async function state(job, retry) {
    if (retry && job.status === "failed" || job.status === "running" && new Date(job.leaseUntil?.toDate?.() || job.leaseUntil).getTime() < now().getTime()) job = await repository.retry(job.generationId);
    return {status: job.status === "completed" ? "queued" : job.status, generationId: job.generationId, errorMessage: job.errorMessage || null};
  }
  async function selection(edition, {retry = false, fixedSetId = null} = {}) {
    const setId = fixedSetId || domain.setId(edition);
    let selected = await repository.questions(setId);
    if (!selected) {
      if (fixedSetId) throw fail("The article's questions are unavailable.", "failed-precondition");
      const job = await repository.ensureJob("questions_" + setId, {mode: "questions", kind: "questions", stage: "questions", setId, questionSource: source(edition)});
      const pending = await state(job, retry); selected = await repository.questions(setId);
      if (!selected) {if (job.status === "completed") throw fail("The prepared questions are unavailable.", "failed-precondition"); return {setId, ...pending};}
    }
    const languageId = domain.languageId(edition.language), existing = await repository.questionLanguage(setId, languageId);
    if (existing?.status === "ready") return existing;
    const job = await repository.ensureJob("question_language_" + hash([setId, languageId]), {mode: "questions", kind: "question_language", stage: "questions", setId, languageId, questionSource: source(edition)});
    const pending = await state(job, retry), saved = await repository.questionLanguage(setId, languageId);
    if (!saved && job.status === "completed") throw fail("The translated questions are unavailable.", "failed-precondition");
    return saved || {setId, ...pending};
  }
  async function run(job) {
    if (job.kind === "questions") {
      let selected = await repository.questions(job.setId);
      if (!selected) selected = {...domain.normalizeQuestionSet(await generate(job.questionSource), job.questionSource), createdAt: now()};
      const localized = {setId: selected.setId, language: selected.language, sourceEditionId: selected.sourceEditionId, status: "ready", questions: selected.questions, choices: selected.choices, createdAt: now()};
      return repository.checkpoint(job, {completedAt: now()}, "completed", [
        {ref: repository.questionsRef(job.setId), data: selected}, {ref: repository.questionLanguageRef(job.setId, domain.languageId(selected.language)), data: localized}]);
    }
    const selected = await repository.questions(job.setId); if (!selected) throw fail("Prepare the original questions first.", "failed-precondition");
    const localized = await repository.questionLanguage(job.setId, job.languageId) || {...domain.normalizeQuestionLanguage(await translate(selected, job.questionSource), selected, job.questionSource), createdAt: now()};
    return repository.checkpoint(job, {completedAt: now()}, "completed", [{ref: repository.questionLanguageRef(job.setId, job.languageId), data: localized}]);
  }
  return {selection, run};
}
module.exports = {createNewsQuestions, generateNewsQuestions, translateNewsQuestions};
