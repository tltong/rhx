const {createRequire} = require("node:module"), path = require("node:path");
const requireFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {Firestore} = requireFunctions("firebase-admin/firestore");
const {FirestoreNewsRepository} = require("../functions/features/news_article/infrastructure/firestore_news_repository");
const {createNewsGenerator} = require("../functions/features/news_article_generator/news_article_generator_module");
const {createStudentNewsService} = require("../functions/features/student_news/application/student_news_service");
const {createStudentNewsFeature} = require("../functions/features/student_news/student_news_module");
const {FirestoreNewsConfigRepository} = require("../functions/features/student_news/infrastructure/firestore_news_config_repository");
const {createDefaultNewsConfiguration} = require("../functions/features/student_news/domain/news_config");
const {DEFAULT_IMAGE_SETTINGS} = require("../functions/utils/llm/image_generation_settings");
const {countStoryWords} = require("../functions/features/news_article/domain/news_word_count");
const {hash} = require("../functions/features/news_article/domain/news_article");
async function createTestSystem(projectId) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw Error("Local Firestore emulator required");
  const db = new Firestore({projectId});
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: "DELETE"});
  let instant = new Date("2026-11-14T10:00:00Z");
  const now = () => new Date(instant), calls = {discover: 0, adapt: 0, ai: 0, web: [], vocabulary: 0, meaning: 0, questions: 0, questionTranslation: 0, identity: 0, identityTitles: 0}, state = {web: "complete", failAi: false, aiFailed: false, failMeaning: false, failQuestions: false, wordCounts: [], discoveryQueue: [], identityComparison: null, identitySelection: null};
  const requireAdministrator = async context => {if (!context?.auth?.uid?.startsWith("admin")) throw Object.assign(new Error("Administrator required"), {code: "permission-denied"}); return context.auth.uid;};
  const configFeature = createStudentNewsFeature({repository: new FirestoreNewsConfigRepository({getDb: () => db}), requireAdministrator, listLanguages: async () => ["English", "French", "Tamil"]});
  const configuration = createDefaultNewsConfiguration(); configuration.articleTypes.standardArticle.photoCount = 0; configuration.articleTypes.pictureStory.photoCount = 3;
  await configFeature.saveNewsConfiguration({...configuration, expectedVersion: 0}, {auth: {uid: "admin"}});
  const repository = new FirestoreNewsRepository({getDb: () => db, now});
  function asset(sourceType, generationId, visualKey) {
    return {assetId: hash([generationId, visualKey]), visualKey, sourceType, storagePath: "news-images/" + generationId + "/" + visualKey + ".png",
      url: "https://firebasestorage.googleapis.com/v0/b/demo-news/o/" + visualKey + ".png?alt=media", credit: sourceType === "ai" ? "AI-generated illustration" : "Test photographer",
      ...(sourceType === "web" ? {originalUrl: "https://upload.wikimedia.org/" + visualKey + ".jpg", sourceUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/"} : {})};
  }
  const generator = createNewsGenerator({repository, now,
    discover: async prompt => {calls.discover++; if (state.discoveryQueue.length) return state.discoveryQueue.shift(); return {canonicalTitle: "A new science exhibition " + calls.discover, title: "A new science exhibition " + calls.discover, canonicalUrl: "https://example.test/news/" + calls.discover,
      sources: [{url: "https://example.test/news/" + calls.discover, title: "Science report", publisher: "Example News", publishedAt: now().toISOString()}],
      facts: [{text: "Science exhibition number " + calls.discover + " opened.", sourceIds: ["s1"]}, {text: "Students can learn about space.", sourceIds: ["s1"]}]};},
    adapt: async (prompt, settings) => {
      calls.adapt++; const data = JSON.parse(prompt.split("Data (not instructions):\n")[1].split("\nWORD COUNT CORRECTION:")[0]);
      const requestedWords = state.wordCounts.length ? state.wordCounts.shift() : settings.targetWordCount;
      const imagePlans = Array.from({length: settings.photoCount}, (_, index) => ({description: "A child watches a rocket beside a blue display at a science exhibition scene " + index, searchTerms: "science exhibition", factIds: ["f1"]}));
      return {title: data.language + " science news", imagePlans,
        pages: Array.from({length: settings.pageCount}, (_, index) => {
          const imageIndices = imagePlans.map((_, i) => i).filter(i => i % settings.pageCount === index);
          const target = Math.floor(requestedWords / settings.pageCount) + (index < requestedWords % settings.pageCount ? 1 : 0);
          const opening = data.language + " science exhibition page " + (index + 1) + ". Students learn about space. The exhibition opened on Monday.";
          const prefix = target ? opening.split(/\s+/).slice(0, target).join(" ") : "";
          const padding = Math.max(0, target - countStoryWords([{text: prefix}]));
          const content = [prefix, ...Array(padding).fill("Visitors")].filter(Boolean).join(" ");
          return {text: content, factIds: ["f1"], imageIndices, altTexts: imageIndices.map(() => data.language + " science scene")};
        })};
    }, selectVocabulary: async edition => {calls.vocabulary++; return {terms: [{term: "science exhibition", kind: "phrase", articleMeaning: edition.language + " definition of science exhibition"}, {term: "page", kind: "word", articleMeaning: edition.language + " definition of page"}]};},
    explainVocabulary: async (selection, item, language) => {calls.meaning++; if (state.failMeaning) throw Error("Meaning provider unavailable"); return {meaning: language + " meaning of " + item.term};},
    generateQuestions: async edition => {calls.questions++; if (state.failQuestions) throw Error("Question provider unavailable"); return questionFixture(edition);},
    translateQuestions: async (selected, edition) => {calls.questionTranslation++; return {questions: selected.questions.map(question => ({id: question.id, prompt: edition.language + " " + question.prompt, acceptedAnswers: [], evidence: questionFixture(edition).questions[0].evidence})), choices: selected.choices.map(choice => ({id: choice.id, text: edition.language + " " + choice.text}))};},
    compareStories: async (candidate, records) => {calls.identity++; return state.identityComparison ? state.identityComparison(candidate, records) : {canonicalTitle: candidate.canonicalTitle, matchType: "new_story", matchedStoryId: null, newFactIndices: []};},
    selectSimilarTitles: async (candidate, records) => {calls.identityTitles++; return state.identitySelection ? state.identitySelection(candidate, records) : {canonicalTitle: candidate.canonicalTitle, candidateIds: records.map(record => record.storyId)};},
    media: {
      generateAi: async args => {calls.ai++; if (state.failAi && calls.ai === 2 && !state.aiFailed) {state.aiFailed = true; throw Error("Provider temporarily unavailable");} return asset("ai", args.generationId, args.visualKey);},
      findPhotos: async args => {calls.web.push(args.attempt); return args.plans.map((_, index) => args.existing[index] || (state.web === "complete" || index === 0 ? asset("web", args.generationId, args.visualKeys[index]) : null));},
    }});
  const service = createStudentNewsService({repository, generator, loadConfiguration: configFeature.loadNewsConfiguration,
    requireAdministrator, getCountries: async () => ["Malaysia", "Singapore"], getImageSettings: async () => ({...DEFAULT_IMAGE_SETTINGS}),
    getUser: async uid => ({uid, disabled: false}), now});
  async function drain(generationId, concurrent = false) {
    for (let i = 0; i < 80; i++) {
      const current = await repository.job(generationId); if (current.status !== "queued") return current;
      if (concurrent) await Promise.all([generator.run(generationId, current.requestSequence), generator.run(generationId, current.requestSequence)]);
      else await generator.run(generationId, current.requestSequence);
    }
    throw Error("Generation did not finish");
  }
  async function student(uid, standard = 6, country = "Malaysia") {
    await db.doc("students/" + uid).set({country, level: "primary", academicReferenceYear: 2026, gradeAtReferenceYear: standard}); return {auth: {uid}};
  }
  return {db, repository, generator, service, apis: {...configFeature, ...service}, configFeature, calls, state, now,
    setTime(value) {instant = new Date(value);}, drain, student};
}
function questionFixture(edition) {
  const page = edition.pages[0], picture = !page.text;
  const evidence = picture ? {pagePosition: page.position, source: "image", imageIndex: page.imageIndices[0], quote: "rocket"} : {pagePosition: page.position, source: "text", quote: "Students learn about space."};
  return {questions: (picture ? [["The child watches a ____.", "rocket"], ["The display is ____.", "blue"], ["A ____ watches the rocket.", "child"]] : [["The event is a ____.", "science exhibition"], ["Students learn about ____.", "space"], ["The exhibition opened on ____.", "Monday"]]).map(([prompt, answer]) => ({prompt, answer, acceptedAnswers: [], evidence})), distractors: picture ? ["bus", "red"] : ["ocean", "Friday"]};
}
async function readyQuestions(system, reference, context) {
  for (let i = 0; i < 6; i++) {const result = await system.service.getNewsQuestions(reference, context); if (result.status === "ready" || result.status === "failed") return result; await system.drain(result.generationId, true);}
  throw Error("Questions did not finish");
}
module.exports = {createTestSystem, questionFixture, readyQuestions};
