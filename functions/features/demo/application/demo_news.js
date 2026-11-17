const d = require("../domain/demo");
const articleDomain = require("../../news_article/domain/news_article");
const questionDomain = require("../../news_article/domain/news_questions");
const vocabularyDomain = require("../../news_article/domain/news_vocabulary");
const {resolveNewsGradeSettings} = require("../../student_news/domain/news_config");
const {newsRewardSettings} = require("../../reward/news_reward_module");

function createDemoNews({
  repository,
  articles = new (require("../../news_article/infrastructure/firestore_news_repository").FirestoreNewsRepository)(),
  generator = require("../../news_article_generator/news_article_generator_module").createNewsGenerator({repository: articles}),
  loadConfiguration = () => require("../../student_news/student_news_module").loadNewsConfiguration(),
  getRewards = () => require("../../reward/reward_module").getRewardConfig(),
  getImageSettings = async () => {
    const {normalizeImageSettings, DEFAULT_IMAGE_SETTINGS} = require("../../../utils/llm/image_generation_settings");
    return normalizeImageSettings(await require("../../image_generation/image_generation_module").getImageGenerationConfig() || DEFAULT_IMAGE_SETTINGS);
  },
  now = () => new Date(),
} = {}) {
  async function owner(token) {
    const result = await repository.read(token);
    if (!result.session.scope || !result.session.totals.practicesCompleted) throw d.fail("Complete a practice before continuing to news.", "failed-precondition");
    return result;
  }
  function language(configuration, input) {
    const selected = configuration.supportedLanguages.find(item => d.key(item) === d.key(input));
    if (!selected) throw d.fail("Choose an available news language.");
    return selected;
  }
  async function options(token, input) {
    d.fields(input, []); const {session} = await owner(token), configuration = await loadConfiguration();
    const grade = configuration.gradeSettings[d.key(session.scope.level)]?.[session.scope.grade];
    if (!grade) throw d.fail("News is not configured for this level and grade.", "failed-precondition");
    return {country: session.scope.country, languages: configuration.supportedLanguages, rewardSettings: newsRewardSettings(await getRewards() || {}),
      questionAnswerMode: grade.questionAnswerMode};
  }
  async function prepare(token, input) {
    d.fields(input, ["newsType", "language", "retry"]);
    const {sessionId, session} = await owner(token), ref = repository.newsRef(sessionId, input.newsType);
    const configuration = await loadConfiguration(), selectedLanguage = language(configuration, input.language);
    let assignment = (await ref.get()).data();
    if (!assignment) {
      const criteria = {level: d.key(session.scope.level), standard: session.scope.grade};
      const settings = {...resolveNewsGradeSettings(configuration, criteria), imageSettings: await getImageSettings()};
      const grade = configuration.gradeSettings[criteria.level][criteria.standard], rewardSettings = newsRewardSettings(await getRewards() || {});
      assignment = await repository.transaction(sessionId, async ({tx, session: current}) => {
        const existing = (await tx.get(ref)).data(); if (existing) return existing;
        if (d.hash(session.scope) !== d.hash(current.scope)) throw d.fail("Your demo setup changed.", "aborted");
        const created = {newsType: input.newsType, country: session.scope.country, settings,
          vocabularyCount: grade.vocabularyCount, questionAnswerMode: grade.questionAnswerMode, rewardSettings,
          discoveryInstructions: configuration.discoveryInstructions, storyId: null, editions: {}, generations: {}, createdAt: now()};
        tx.create(ref, created); return created;
      });
    }
    let story = assignment.storyId ? await articles.story(assignment.storyId) : null;
    async function jobView(job) {
      if (!job) throw d.fail("News preparation is unavailable. Please try another category.", "failed-precondition");
      if (job.status === "running" && d.millis(job.leaseUntil) < now().getTime() || job.status === "failed" && input.retry === true) {
        job = await articles.retry(job.generationId);
      }
      await repository.read(token);
      return {newsType: input.newsType, ...generator.jobView(job)};
    }
    if (!story && assignment.discoveryId) {
      const discovery = await articles.job(assignment.discoveryId);
      if (discovery?.status !== "completed") return jobView(discovery);
      story = await articles.story(discovery.resultStoryId);
    }
    if (!story) story = (await articles.stories(input.newsType, assignment.country, {limit: 1}))[0] || null;
    if (!story) {
      const discovery = await generator.enqueueDiscovery({newsType: input.newsType, country: assignment.country}, new Set(), assignment.discoveryInstructions);
      await repository.updateNews(sessionId, input.newsType, () => ({discoveryId: discovery.generationId}));
      if (discovery.status !== "completed") return jobView(discovery);
      story = await articles.story(discovery.resultStoryId);
    }
    if (!story || story.status !== "active" || story.poolScope !== articleDomain.scope(input.newsType, assignment.country)) {
      throw d.fail("This news story is no longer available. Try another news category.", "failed-precondition");
    }
    assignment = await repository.updateNews(sessionId, input.newsType, current => {
      if (current.storyId && current.storyId !== story.storyId) return {};
      return {storyId: story.storyId};
    });
    if (assignment.storyId !== story.storyId) story = await articles.story(assignment.storyId);
    const languageKey = d.hash(d.key(selectedLanguage));
    let edition = assignment.editions[languageKey] ? await articles.edition(assignment.editions[languageKey]) : null;
    if (!edition) {
      const preparation = await generator.enqueueEdition(story, assignment.settings, selectedLanguage, {vocabularyCount: assignment.vocabularyCount});
      if (preparation.status !== "completed") {
        await repository.updateNews(sessionId, input.newsType, current => ({generations: {...current.generations, [languageKey]: preparation.generationId}}));
        return jobView(preparation);
      }
      edition = await articles.edition(preparation.resultEditionId);
      if (!edition || edition.storyId !== story.storyId) throw d.fail("The prepared article is unavailable.", "failed-precondition");
      assignment = await repository.updateNews(sessionId, input.newsType, current => ({editions: {...current.editions, [languageKey]: edition.editionId}}));
    }
    await repository.read(token);
    return {status: "ready", newsType: input.newsType, article: articleDomain.publicArticle(story, edition),
      rewards: assignment.rewards || null, rewardSettings: assignment.rewardSettings};
  }
  async function source(token, input, extras) {
    d.fields(input, ["newsType", "articleLanguage", ...extras]);
    const context = await owner(token), ref = repository.newsRef(context.sessionId, input.newsType);
    const assignment = (await ref.get()).data(), editionId = assignment?.editions[d.hash(d.key(input.articleLanguage))];
    if (!editionId) throw d.fail("Read this article in the selected language first.", "failed-precondition");
    const edition = await articles.edition(editionId);
    if (!edition || edition.storyId !== assignment.storyId) throw d.fail("This news edition is unavailable.", "failed-precondition");
    return {...context, ref, assignment, edition};
  }
  async function getQuestions(token, input) {
    const target = await source(token, input, ["retry"]);
    const selected = await generator.questions.selection(target.edition, {retry: input.retry === true, fixedSetId: target.assignment.quiz?.setId || null});
    if (selected.status !== "ready") return {status: selected.status, errorMessage: selected.errorMessage || null, questions: []};
    const assignment = await repository.updateNews(target.sessionId, input.newsType, current => current.quiz ? {} : {
      quiz: {setId: selected.setId, status: "open", answerMode: current.questionAnswerMode},
    });
    if (assignment.quiz.setId !== selected.setId) throw d.fail("Open the news questions again.", "aborted");
    return {attemptId: d.hash([target.sessionId, assignment.storyId]), ...questionDomain.publicQuestions(selected, assignment.quiz.answerMode, assignment.quiz),
      ...(assignment.rewards ? {completion: {rewards: assignment.rewards}, summary: d.summary((await repository.read(token)).session)} : {})};
  }
  async function submit(token, input) {
    const target = await source(token, input, ["setId", "answers"]);
    if (!target.assignment.quiz || target.assignment.quiz.setId !== input.setId) throw d.fail("Open the article's questions before submitting.", "failed-precondition");
    const selected = await articles.questionLanguage(input.setId, questionDomain.languageId(target.edition.language));
    if (selected?.status !== "ready") throw d.fail("Wait for the news questions to be ready.", "failed-precondition");
    const responses = target.assignment.quiz.status === "submitted" ? null
      : questionDomain.markAnswers(input.answers, selected, target.assignment.quiz.answerMode);
    await repository.transaction(target.sessionId, async ({tx, ref: root, session}) => {
      const current = (await tx.get(target.ref)).data();
      if (!current || current.quiz?.setId !== input.setId) throw d.fail("The article questions are unavailable.", "failed-precondition");
      if (current.quiz.status === "submitted") return;
      const score = responses.filter(item => item.correct).length, setting = current.rewardSettings;
      const seen = session.newsAwardedStories?.[d.hash(current.storyId)];
      const rewards = seen || {completionCoins: setting.completionCoins, allCorrectCoins: score === 3 ? setting.allCorrectCoins : 0,
        totalCoins: setting.completionCoins + (score === 3 ? setting.allCorrectCoins : 0)};
      const totals = seen ? session.totals : d.addCoins(session, "newsCoins", rewards.totalCoins);
      if (!seen) totals.newsCompleted++;
      tx.update(target.ref, {quiz: {...current.quiz, status: "submitted", responses, score, language: target.edition.language, submittedAt: now()}, rewards});
      tx.update(root, {totals, newsAwardedStories: {...session.newsAwardedStories, [d.hash(current.storyId)]: rewards}});
    });
    return getQuestions(token, {newsType: input.newsType, articleLanguage: input.articleLanguage});
  }
  async function vocabulary(token, input) {
    const target = await source(token, input, ["retry"]), config = await loadConfiguration();
    const selected = await generator.vocabulary.selection(target.edition, target.assignment.vocabularyCount, {retry: input.retry === true});
    await repository.read(token);
    return {editionId: selected.editionId, setId: selected.setId, requestedCount: selected.requestedCount, actualCount: selected.actualCount,
      status: selected.status, generationId: selected.generationId || null, errorMessage: selected.errorMessage || null,
      items: selected.items.map(({id, term, kind, pagePosition, startOffset, endOffset, articleMeaning}) => ({id, term, kind, pagePosition, startOffset, endOffset, articleMeaning})),
      languages: config.supportedLanguages, lastMeaningLanguage: null};
  }
  async function meaning(token, input, create) {
    const target = await source(token, input, ["setId", "termId", "meaningLanguage"]), config = await loadConfiguration();
    if (input.setId !== vocabularyDomain.setId(target.assignment.vocabularyCount)) throw d.fail("Choose a word from this article.", "permission-denied");
    const selected = await articles.vocabulary(target.edition.editionId, input.setId), item = selected?.items.find(item => item.id === input.termId);
    if (!item) throw d.fail("Choose a highlighted word.", "not-found");
    const selectedLanguage = language(config, input.meaningLanguage);
    const result = await generator.vocabulary.meaning(selected, item, selectedLanguage, {create});
    await repository.read(token);
    return result;
  }
  return {getNewsOptions: options, prepareNews: prepare, getNewsQuestions: getQuestions, submitNewsQuestions: submit,
    getNewsVocabulary: vocabulary, requestNewsMeaning: (token, input) => meaning(token, input, true), getNewsMeaning: (token, input) => meaning(token, input, false)};
}
module.exports = {createDemoNews};
