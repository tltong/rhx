const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../../utils/firebase/firebase_ops");
const {getImageGenerationConfig} = require("../../image_generation/image_generation_module");
const {DEFAULT_IMAGE_SETTINGS, normalizeImageSettings} = require("../../../utils/llm/image_generation_settings");
const {listSyllabusScopeCountries} = require("../../syllabusscope/syllabusscope_module");
const {currentGrade} = require("../../student/domain/student_profile");
const {requireNewsAdministrator, requireSignedIn} = require("../infrastructure/news_config_access");
const {resolveNewsGradeSettings} = require("../domain/news_config");
const {dayWindow, timeZone} = require("../domain/news_day");
const {FirestoreNewsRepository, millis} = require("../../news_article/infrastructure/firestore_news_repository");
const {createNewsGenerator} = require("../../news_article_generator/news_article_generator_module");
const {fail, id, text, key, hash, scope, publicArticle} = require("../../news_article/domain/news_article");
const {createNewsQuestionsService} = require("./news_questions_service");
const {createNewsRewards} = require("../../reward/news_reward_module");
const {createNewsCompletion} = require("./news_completion");

function input(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(field => !fields.includes(field))) throw fail("Invalid news request fields.");
  return value;
}
function createStudentNewsService({loadConfiguration, repository = new FirestoreNewsRepository(), generator = createNewsGenerator({repository}),
  requireAdministrator = requireNewsAdministrator, getCountries = listSyllabusScopeCountries,
  getImageSettings = async () => normalizeImageSettings(await getImageGenerationConfig() || DEFAULT_IMAGE_SETTINGS),
  getUser = uid => getAuth(getFirebaseApp()).getUser(uid), now = () => new Date()} = {}) {
  const db = () => repository.db();
  const rewards = createNewsRewards({getDb: db, now}), completion = createNewsCompletion({repository, rewards, now});
  function language(config, value) {
    const result = config.supportedLanguages.find(item => key(item) === key(value));
    if (!result) throw fail("Choose a language available in Syllabus Scope.");
    return result;
  }
  async function settings(config, criteria) {return {...resolveNewsGradeSettings(config, criteria), imageSettings: await getImageSettings()};}
  async function student(context) {
    const uid = requireSignedIn(context), user = await getUser(uid);
    if (user.disabled) throw fail("This account is disabled.", "permission-denied");
    const profile = (await db().doc("students/" + uid).get()).data();
    if (!profile) throw fail("A student profile is required.", "permission-denied");
    return {uid, country: text(profile.country, "student country", 200), level: profile.level, standard: currentGrade(profile, now())};
  }
  async function job(idValue) {
    let result = await repository.job(idValue);
    if (!result) throw fail("Generation was not found.", "not-found");
    if (result.status === "running" && millis(result.leaseUntil) < now().getTime()) result = await repository.retry(idValue);
    return result;
  }
  async function assignmentSummary(assignment) {
    const story = assignment.storyId ? await repository.story(assignment.storyId) : null;
    const readingLanguage = assignment.readingLanguage || null, preferred = readingLanguage && assignment.editionIdsByLanguage?.[hash(key(readingLanguage))];
    const edition = preferred ? await repository.edition(preferred) : null;
    const result = {assignmentId: assignment.assignmentId, newsType: assignment.newsType, country: assignment.country, localDate: assignment.localDate,
      status: assignment.status, storyId: assignment.storyId || null, title: edition?.title || story?.canonicalTitle || story?.sourceTitle || null,
      readingLanguage, canOpen: !!assignment.storyId || millis(assignment.windowEndAt) > now().getTime(),
      score: assignment.score ?? null, rewards: assignment.rewards || null, rewardSettings: assignment.rewardSettings || null, completedAt: assignment.completedAt || null};
    if (assignment.status === "preparing") {
      const dependency = (readingLanguage && assignment.generationIdsByLanguage?.[hash(key(readingLanguage))]) || Object.values(assignment.generationIdsByLanguage || {})[0] || assignment.discoveryId;
      if (dependency) {
        // Overview is read-only: it never creates work or restarts a worker.
        const pending = await repository.job(dependency);
        if (pending) {result.preparation = generator.jobView(pending); if (pending.status === "failed") result.status = "failed";
          else if (pending.status === "completed") result.status = "ready";}
      }
    }
    return result;
  }
  async function getOverview(context) {
    const owner = await student(context), [rootSnapshot, config, rewardSettings] = await Promise.all([db().doc("studentNews/" + owner.uid).get(), loadConfiguration(), rewards.settings()]);
    const root = rootSnapshot.data(), common = {country: owner.country, languages: config.supportedLanguages, rewardSettings};
    if (!root?.timeZone) return {...common, timeZoneRequired: true, slots: {international: null, local: null}};
    const window = dayWindow(now(), root.timeZone), slots = {};
    for (const category of ["international", "local"]) {
      const assignment = (await db().doc(`studentNews/${owner.uid}/daily/${window.localDate}_${category}`).get()).data();
      slots[category] = assignment ? await assignmentSummary(assignment) : null;
    }
    return {...common, ...window, slots};
  }
  async function history(raw, context) {
    input(raw, ["limit", "cursor"]); const owner = await student(context), limit = raw.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw fail("Choose a history page size from 1 to 50.");
    const collection = db().collection(`studentNews/${owner.uid}/daily`);
    let query = collection.orderBy("createdAt", "desc").orderBy("__name__", "desc");
    if (raw.cursor) {
      const cursor = id(raw.cursor, "history cursor"); if (!/^\d{4}-\d{2}-\d{2}_(international|local)$/.test(cursor)) throw fail("Invalid news history cursor.");
      const record = await collection.doc(cursor).get(); if (!record.exists) throw fail("News history cursor was not found.", "not-found"); query = query.startAfter(record);
    }
    const page = await query.limit(limit + 1).get(), records = page.docs.slice(0, limit);
    return {items: await Promise.all(records.map(record => assignmentSummary(record.data()))), nextCursor: page.docs.length > limit ? records.at(-1).id : null};
  }
  async function requestArticle(raw, context) {
    input(raw, ["newsType", "language", "timeZone", "clientRequestId"]);
    const owner = await student(context), config = await loadConfiguration(), selectedLanguage = language(config, raw.language);
    id(raw.clientRequestId, "request ID"); scope(raw.newsType, owner.country);
    const [effective, rewardSettings] = await Promise.all([settings(config, owner), rewards.settings()]);
    const rootRef = db().doc("studentNews/" + owner.uid);
    const assignment = await db().runTransaction(async tx => {
      const root = (await tx.get(rootRef)).data();
      const zone = root?.timeZone || timeZone(raw.timeZone), window = dayWindow(now(), zone);
      const assignmentId = window.localDate + "_" + raw.newsType, ref = rootRef.collection("daily").doc(assignmentId), current = (await tx.get(ref)).data();
      if (current) return current;
      const created = {assignmentId, studentId: owner.uid, newsType: raw.newsType, country: raw.newsType === "local" ? owner.country : null,
        ...window, gradeKey: effective.gradeKey, settings: effective, vocabularyCount: config.gradeSettings[owner.level][owner.standard].vocabularyCount,
        rewardSettings, readingLanguage: selectedLanguage,
        questionAnswerMode: config.gradeSettings[owner.level][owner.standard].questionAnswerMode, discoveryInstructions: config.discoveryInstructions,
        status: "preparing", storyId: null, editionIdsByLanguage: {}, generationIdsByLanguage: {}, createdAt: now()};
      tx.set(rootRef, {...window}, {merge: true}); tx.create(ref, created); return created;
    });
    return advance(assignment, selectedLanguage);
  }
  async function persist(assignment, fields) {
    const ref = db().doc(`studentNews/${assignment.studentId}/daily/${assignment.assignmentId}`);
    return db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!current || current.storyId && fields.storyId && current.storyId !== fields.storyId) throw fail("The daily news selection changed. Retry.", "aborted");
      if (current.status === "completed" && fields.status === "ready") delete fields.status;
      const updated = {...current, ...fields, editionIdsByLanguage: {...current.editionIdsByLanguage, ...fields.editionIdsByLanguage},
        generationIdsByLanguage: {...current.generationIdsByLanguage, ...fields.generationIdsByLanguage}};
      tx.set(ref, updated); return updated;
    });
  }
  async function advance(assignment, selectedLanguage) {
    if (!assignment.rewardSettings) {
      const fallback = await rewards.settings(), ref = db().doc(`studentNews/${assignment.studentId}/daily/${assignment.assignmentId}`);
      assignment = await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (!current.rewardSettings) {tx.update(ref, {rewardSettings: fallback}); return {...current, rewardSettings: fallback};}
        return current;
      });
    }
    const languageKey = hash(key(selectedLanguage));
    if (assignment.editionIdsByLanguage[languageKey]) {
      const edition = await repository.edition(assignment.editionIdsByLanguage[languageKey]), story = await repository.story(assignment.storyId);
      if (!edition || !story) throw fail("The assigned article is unavailable.", "failed-precondition");
      await persist(assignment, {readingLanguage: selectedLanguage});
      return {assignmentId: assignment.assignmentId, status: "ready", completed: assignment.status === "completed", rewards: assignment.rewards || null, rewardSettings: assignment.rewardSettings || null, article: publicArticle(story, edition)};
    }
    if (!assignment.storyId && millis(assignment.windowEndAt) <= now().getTime()) throw fail("The daily news window ended. Request today's news.", "failed-precondition");
    let story = assignment.storyId ? await repository.story(assignment.storyId) : null;
    if (!story) {
      const history = await db().collection(`studentNews/${assignment.studentId}/history`).get();
      const completed = new Set(history.docs.filter(doc => doc.data().completedAt).map(doc => doc.id));
      if (assignment.discoveryId) {
        const discovery = await job(assignment.discoveryId);
        if (discovery.status === "failed") return {assignmentId: assignment.assignmentId, ...generator.jobView(discovery)};
        if (discovery.status !== "completed") return {assignmentId: assignment.assignmentId, ...generator.jobView(discovery)};
        story = await repository.story(discovery.resultStoryId);
        if (!story || story.status !== "active" || completed.has(story.storyId)) story = null;
      }
      if (!story) {
        let after = null;
        do {
          const candidates = await repository.stories(assignment.newsType, assignment.country, {limit: 100, after});
          story = candidates.find(candidate => !completed.has(candidate.storyId)) || null;
          if (story || candidates.length < 100) break;
          after = candidates[candidates.length - 1].storyId;
        } while (after);
      }
      if (!story) {
        const discovery = await generator.enqueueDiscovery({newsType: assignment.newsType, country: assignment.country}, completed, assignment.discoveryInstructions);
        assignment = await persist(assignment, {discoveryId: discovery.generationId});
        if (discovery.status !== "completed") return {assignmentId: assignment.assignmentId, ...generator.jobView(discovery)};
        story = await repository.story(discovery.resultStoryId);
      }
      assignment = await persist(assignment, {storyId: story.storyId});
    }
    let preparation = await generator.enqueueEdition(story, assignment.settings, selectedLanguage, {vocabularyCount: assignment.vocabularyCount});
    if (preparation.status === "running" && millis(preparation.leaseUntil) < now().getTime()) preparation = await repository.retry(preparation.generationId);
    if (preparation.status !== "completed") {
      await persist(assignment, {readingLanguage: selectedLanguage, generationIdsByLanguage: {[languageKey]: preparation.generationId}});
      return {assignmentId: assignment.assignmentId, ...generator.jobView(preparation)};
    }
    const edition = await repository.edition(preparation.resultEditionId);
    if (!edition) throw fail("The prepared edition is unavailable.", "failed-precondition");
    assignment = await db().runTransaction(async tx => {
      const ref = db().doc(`studentNews/${assignment.studentId}/daily/${assignment.assignmentId}`), current = (await tx.get(ref)).data();
      if (!current.storyId && millis(current.windowEndAt) <= now().getTime()) throw fail("The daily news window ended. Request today's news.", "failed-precondition");
      const updated = {...current, readingLanguage: selectedLanguage, status: current.status === "completed" ? "completed" : "ready", openedAt: current.openedAt || now(),
        editionIdsByLanguage: {...current.editionIdsByLanguage, [languageKey]: edition.editionId}};
      tx.set(ref, updated); return updated;
    });
    return {assignmentId: assignment.assignmentId, status: "ready", completed: assignment.status === "completed", rewards: assignment.rewards || null, rewardSettings: assignment.rewardSettings || null, article: publicArticle(story, edition)};
  }
  async function assigned(raw, context, retry = false) {
    input(raw, ["assignmentId", "language", "clientRequestId"]);
    const owner = await student(context), assignment = (await db().doc(`studentNews/${owner.uid}/daily/${id(raw.assignmentId, "assignment ID")}`).get()).data();
    if (!assignment) throw fail("Assignment was not found.", "not-found");
    const existing = assignment.editionIdsByLanguage[hash(key(raw.language))], config = await loadConfiguration();
    const selectedLanguage = existing ? raw.language : language(config, raw.language);
    if (retry) {
      const dependency = assignment.generationIdsByLanguage[hash(key(selectedLanguage))] || assignment.discoveryId;
      if (dependency) await repository.retry(dependency);
    }
    return advance(assignment, selectedLanguage);
  }
  async function finish(raw, context) {
    input(raw, ["assignmentId"]);
    return completion.finish((await student(context)).uid, id(raw.assignmentId, "assignment ID"));
  }
  async function previewOptions(_raw, context) {
    await requireAdministrator(context);
    const [countries, config] = await Promise.all([getCountries(), loadConfiguration()]);
    return {countries, languages: config.supportedLanguages};
  }
  async function startPreview(raw, context) {
    const uid = await requireAdministrator(context);
    input(raw, ["newsType", "country", "level", "standard", "language", "storyId", "clientRequestId"]);
    const config = await loadConfiguration(), selectedLanguage = language(config, raw.language), criteria = {newsType: raw.newsType, country: null};
    scope(raw.newsType, raw.country);
    if (raw.newsType === "local") {
      criteria.country = (await getCountries()).find(country => key(country) === key(raw.country));
      if (!criteria.country) throw fail("Choose a country available in Syllabus Scope.");
    }
    if (raw.storyId) {
      const story = await repository.story(id(raw.storyId, "story ID"));
      if (!story || story.status !== "active" || story.poolScope !== scope(criteria.newsType, criteria.country)) throw fail("Choose a matching pooled story.");
    }
    const effective = await settings(config, raw);
    const prepared = await generator.enqueuePreview({ownerUid: uid, clientRequestId: id(raw.clientRequestId, "request ID"), criteria,
      settings: effective, vocabularyCount: config.gradeSettings[effective.level][effective.standard].vocabularyCount,
      questionAnswerMode: config.gradeSettings[effective.level][effective.standard].questionAnswerMode, discoveryInstructions: config.discoveryInstructions, language: selectedLanguage,
      sourceStoryId: raw.storyId ? raw.storyId : null});
    return generator.jobView(prepared);
  }
  async function previewJob(raw, context, retry = false) {
    const uid = await requireAdministrator(context); input(raw, ["generationId"]);
    let prepared = await repository.job(id(raw.generationId, "generation ID"));
    if (!prepared) throw fail("Preview was not found.", "not-found");
    if (prepared.mode !== "preview" || prepared.ownerUid !== uid) throw fail("This preview belongs to another administrator.", "permission-denied");
    if (retry || prepared.status === "running" && millis(prepared.leaseUntil) < now().getTime()) prepared = await repository.retry(prepared.generationId);
    return generator.jobView(prepared);
  }
  async function previewLanguage(raw, context) {
    const uid = await requireAdministrator(context); input(raw, ["generationId", "language"]);
    const prepared = await repository.job(id(raw.generationId, "generation ID"));
    if (!prepared) throw fail("Preview was not found.", "not-found");
    if (prepared.mode !== "preview" || prepared.ownerUid !== uid) throw fail("This preview belongs to another administrator.", "permission-denied");
    const base = prepared.basePreviewId ? await repository.job(prepared.basePreviewId) : prepared;
    if (base?.mode !== "preview" || base.ownerUid !== uid) throw fail("The original preview is unavailable.", "permission-denied");
    if (base.status !== "completed") throw fail("Finish the original preview before switching languages.", "failed-precondition");
    const selectedLanguage = language(await loadConfiguration(), raw.language);
    let translated = await generator.enqueuePreviewLanguage(base, selectedLanguage);
    if (translated.status === "running" && millis(translated.leaseUntil) < now().getTime()) translated = await repository.retry(translated.generationId);
    return generator.jobView(translated);
  }
  async function publishPreview(raw, context) {
    const uid = await requireAdministrator(context); input(raw, ["generationId"]);
    const prepared = await repository.job(id(raw.generationId, "generation ID"));
    if (!prepared) throw fail("Preview was not found.", "not-found");
    if (prepared.mode !== "preview" || prepared.ownerUid !== uid) throw fail("This preview belongs to another administrator.", "permission-denied");
    if (prepared.status !== "completed") throw fail("Finish article preparation before adding it to the pool.", "failed-precondition");
    return repository.publish(prepared.story, prepared.edition, {previewId: prepared.generationId});
  }
  async function listStories(raw, context) {
    await requireAdministrator(context); input(raw, ["newsType", "country", "cursor"]);
    const stories = await repository.stories(raw.newsType, raw.country, {after: raw.cursor ? id(raw.cursor) : null});
    return {stories: stories.map(story => ({storyId: story.storyId, title: story.sourceTitle, publishedAt: story.publishedAt, newsType: story.newsType, country: story.country})), nextCursor: stories.length === 50 ? stories[49].storyId : null};
  }
  async function vocabularySource(raw, context, fields) {
    input(raw, ["previewGenerationId", "assignmentId", "articleLanguage", ...fields]);
    if ((raw.previewGenerationId !== undefined) === (raw.assignmentId !== undefined)) throw fail("Choose one news preview or your own assignment.");
    let uid, edition;
    if (raw.previewGenerationId !== undefined) {
      uid = await requireAdministrator(context);
      const preview = await repository.job(id(raw.previewGenerationId, "preview ID"));
      if (!preview) throw fail("Preview was not found.", "not-found");
      if (preview.mode !== "preview" || preview.ownerUid !== uid) throw fail("This preview belongs to another administrator.", "permission-denied");
      if (preview.status !== "completed") throw fail("Finish preparing the article before requesting vocabulary.", "failed-precondition");
      edition = preview.edition;
    } else {
      const owner = await student(context); uid = owner.uid;
      const assignment = (await db().doc(`studentNews/${uid}/daily/${id(raw.assignmentId, "assignment ID")}`).get()).data();
      if (!assignment) throw fail("Assignment was not found.", "not-found");
      const editionId = assignment.editionIdsByLanguage?.[hash(key(raw.articleLanguage))];
      if (!editionId) throw fail("Open the complete article in this language before requesting vocabulary.", "failed-precondition");
      edition = await repository.edition(editionId);
      if (!edition || edition.storyId !== assignment.storyId) throw fail("The assigned article is unavailable.", "failed-precondition");
    }
    const config = await loadConfiguration();
    const [level, standard] = edition.gradeKey.split("_"), grade = config.gradeSettings[level]?.[standard];
    if (!grade) throw fail("The article grade is unavailable.", "failed-precondition");
    return {uid, edition, config, requestedCount: grade.vocabularyCount};
  }
  async function articleVocabulary(raw, context) {
    const source = await vocabularySource(raw, context, ["retry"]);
    if (raw.retry !== undefined && typeof raw.retry !== "boolean") throw fail("Invalid vocabulary retry option.");
    const selected = await generator.vocabulary.selection(source.edition, source.requestedCount, {retry: raw.retry === true});
    const preference = (await db().doc("studentNews/" + source.uid).get()).data();
    return {editionId: selected.editionId, setId: selected.setId, requestedCount: selected.requestedCount, actualCount: selected.actualCount,
      status: selected.status, generationId: selected.generationId || null, errorMessage: selected.errorMessage || null,
      items: selected.items.map(({id, term, kind, pagePosition, startOffset, endOffset, articleMeaning}) => ({id, term, kind, pagePosition, startOffset, endOffset, articleMeaning})),
      languages: source.config.supportedLanguages, lastMeaningLanguage: preference?.lastMeaningLanguage || null};
  }
  async function articleMeaning(raw, context, create) {
    const source = await vocabularySource(raw, context, ["setId", "termId", "meaningLanguage"]);
    if (source.requestedCount === 0) throw fail("Vocabulary is disabled for this grade.", "failed-precondition");
    const selected = await repository.vocabulary(source.edition.editionId, id(raw.setId, "vocabulary set ID"));
    if (selected?.status !== "ready") throw fail("Prepare the article vocabulary first.", "failed-precondition");
    const item = selected.items.find(item => item.id === id(raw.termId, "vocabulary term ID"));
    if (!item) throw fail("Choose a highlighted vocabulary item.", "not-found");
    const target = language(source.config, raw.meaningLanguage);
    if (create) await db().doc("studentNews/" + source.uid).set({lastMeaningLanguage: target, lastMeaningLanguageAt: now()}, {merge: true});
    const result = await generator.vocabulary.meaning(selected, item, target, {create});
    return {...result, lastMeaningLanguage: create ? target : undefined};
  }
  return {...createNewsQuestionsService({repository, questions: generator.questions, student, requireAdministrator, loadConfiguration, completion, rewards, now}),
    getStudentNewsOverview: (_raw, context) => getOverview(context), listStudentNewsHistory: history, requestStudentNews: requestArticle,
    getStudentNewsAssignment: (raw, context) => assigned(raw, context), requestStudentNewsLanguage: (raw, context) => assigned(raw, context),
    retryStudentNews: (raw, context) => assigned(raw, context, true), finishStudentNews: finish,
    getNewsVocabulary: articleVocabulary, requestNewsMeaning: (raw, context) => articleMeaning(raw, context, true), getNewsMeaning: (raw, context) => articleMeaning(raw, context, false),
    getNewsPreviewOptions: previewOptions, generateNewsPreview: startPreview, requestNewsPreviewLanguage: previewLanguage, getNewsPreview: (raw, context) => previewJob(raw, context),
    retryNewsPreview: (raw, context) => previewJob(raw, context, true), addNewsPreviewToPool: publishPreview, listNewsStories: listStories,
    async retireNewsStory(raw, context) {const uid = await requireAdministrator(context); input(raw, ["storyId"]); return repository.retire(id(raw.storyId), uid);}};
}
module.exports = {createStudentNewsService};
