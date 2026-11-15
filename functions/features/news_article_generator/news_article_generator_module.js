const {FirestoreNewsRepository} = require("../news_article/infrastructure/firestore_news_repository");
const {hash, key, fail, normalizeStory, normalizeDraft, editionKeys, publicArticle} = require("../news_article/domain/news_article");
const {discoveryPrompt, editionPrompt, wordCountRevisionPrompt} = require("./domain/news_prompts");
const {meetsWordCount, closestDraft} = require("../news_article/domain/news_word_count");
const {generationFailure} = require("./domain/news_generation_errors");
const providers = require("./infrastructure/news_providers");
const {createNewsVocabulary} = require("./news_vocabulary_module");
const {createNewsQuestions} = require("./news_questions_module");
const {createNewsIdentity} = require("./news_identity_module");
const {discoveryExclusions} = require("./domain/news_identity");
const {defaultVocabularyCount} = require("../student_news/domain/news_config");
function createNewsGenerator({repository = new FirestoreNewsRepository(), discover = providers.discoverNews, adapt = providers.adaptNews,
  media = providers.createNewsMediaProvider(), now = () => new Date(), selectVocabulary, explainVocabulary, generateQuestions, translateQuestions, compareStories, selectSimilarTitles} = {}) {
  const vocabulary = createNewsVocabulary({repository, now, select: selectVocabulary, explain: explainVocabulary});
  const questions = createNewsQuestions({repository, now, generate: generateQuestions, translate: translateQuestions});
  const identity = createNewsIdentity({repository, compare: compareStories, selectTitles: selectSimilarTitles});
  async function enqueuePreview(input) {
    const generationId = "preview_" + hash([input.ownerUid, input.clientRequestId]);
    const existing = await repository.job(generationId);
    const inputHash = hash([input.criteria, input.settings.gradeKey, input.language, input.sourceStoryId]);
    if (existing && existing.inputHash !== inputHash) throw fail("This request ID was used with different preview options.", "already-exists");
    return repository.ensureJob(generationId, {...input, inputHash, mode: "preview", kind: "edition", stage: "source"});
  }
  async function enqueueEdition(story, settings, language, {vocabularyCount} = {}) {
    const keys = editionKeys(story, settings, language), existing = await repository.indexedEdition("edition", keys.reuseKey);
    if (existing) return {status: "completed", resultEditionId: existing.editionId, resultStoryId: story.storyId};
    return repository.ensureJob("edition_" + keys.reuseKey, {mode: "pool", kind: "edition", stage: "text", story, settings, language,
      vocabularyCount: vocabularyCount ?? defaultVocabularyCount(settings.level, settings.standard), ...keys});
  }
  async function enqueuePreviewLanguage(base, language) {
    if (key(base.language) === key(language)) return base;
    const generationId = "preview_language_" + hash([base.generationId, key(language)]);
    return repository.ensureJob(generationId, {mode: "preview", kind: "edition", stage: "text", ownerUid: base.ownerUid,
      basePreviewId: base.generationId, story: base.story, settings: base.settings, language,
      ...(base.questionAnswerMode ? {questionAnswerMode: base.questionAnswerMode} : {}),
      vocabularyCount: base.vocabularyCount ?? defaultVocabularyCount(base.settings.level, base.settings.standard)});
  }
  async function enqueueDiscovery(criteria, completedIds, instructions) {
    return repository.sharedDiscovery(criteria, completedIds, {mode: "pool", kind: "discovery", stage: "source", criteria, discoveryInstructions: instructions});
  }
  async function run(generationId, sequence) {
    const job = await repository.claim(generationId, sequence); if (!job) return null;
    try {
      if (["vocabulary", "meaning"].includes(job.kind)) return await vocabulary.run(job);
      if (["questions", "question_language"].includes(job.kind)) return await questions.run(job);
      if (job.stage === "deduplicate") return await identity.run(job);
      if (job.stage === "publish" && job.kind === "discovery") return repository.publish(job.story, null, {job});
      if (job.stage === "source") {
        let story = job.sourceStoryId ? await repository.story(job.sourceStoryId) : null;
        if (job.sourceStoryId && (!story || story.status !== "active")) throw fail("The selected story is unavailable.", "failed-precondition");
        if (!story) {
          const known = await identity.catalog();
          story = normalizeStory(await discover(discoveryPrompt(job.criteria, job.discoveryInstructions, discoveryExclusions(known.items, job.duplicateRejections))), job.criteria, now());
          return repository.checkpoint(job, {candidateStory: story, stage: "deduplicate", discoveryCandidateCount: (job.discoveryCandidateCount || 0) + 1,
            identityRevision: null, identityTitleCursor: 0, identityTitleScanComplete: false, identityCandidateIds: [], identityFactCursor: 0, identityUpdateOf: null});
        }
        if (job.kind === "discovery") return repository.publish(story, null, {job});
        return repository.checkpoint(job, {story, ...editionKeys(story, job.settings, job.language), stage: "text"});
      }
      if (job.stage === "text") {
        const keys = editionKeys(job.story, job.settings, job.language);
        let base;
        if (job.basePreviewId) {
          const source = await repository.job(job.basePreviewId);
          if (source?.mode !== "preview" || source.status !== "completed" || source.ownerUid !== job.ownerUid) throw fail("The original preview is unavailable.", "failed-precondition");
          base = source.edition;
        } else base = await repository.indexedEdition("base", keys.baseKey);
        const draft = normalizeDraft(await adapt(editionPrompt(job.story, job.settings, job.language, base), job.settings), job.settings, job.story, base, {allowWordCountMismatch: true});
        const actualPhotoType = job.settings.photoCount ? base?.actualPhotoType || job.settings.photoType : null;
        const visualKeys = draft.imagePlans.map(plan => hash([job.story.storyId, plan, job.settings.imageSettings, actualPhotoType]));
        const reused = base ? base.images : await Promise.all(visualKeys.map(async visualKey => {
          const found = await repository.db().collection(`newsStories/${job.story.storyId}/media`).where("visualKey", "==", visualKey).limit(1).get(); return found.docs[0]?.data() || null;
        }));
        return repository.checkpoint(job, {...keys, questionFamilyId: base?.questionFamilyId || base?.baseKey || job.editionId,
          draft, images: reused, visualKeys, actualPhotoType, photoFallbackUsed: base?.photoFallbackUsed || false, webAttempts: 0,
          stage: meetsWordCount(draft, job.settings.targetWordCount) ? "vocabulary" : "word_count"});
      }
      if (job.stage === "word_count") {
        const target = job.settings.targetWordCount;
        function usable(candidate) {
          try {
            // A zero target selects a picture-only format. Keep its story text
            // empty even when the model adds captions during the optional rewrite.
            const value = target === 0 ? {...candidate, pages: candidate.pages.map(page => ({...page, text: ""}))} : candidate;
            const normalized = normalizeDraft(value, job.settings, job.story, job.draft);
            return target > 0 && normalized.actualWordCount === 0 ? null : normalized;
          } catch {return null;}
        }
        const original = usable(job.draft);
        // Older jobs stopped after a completed correction. Resume their saved
        // valid text directly instead of charging for another length rewrite.
        if (job.wordCountRevisions >= 1 && original) return repository.checkpoint(job, {draft: original, stage: "vocabulary", errorCode: null, errorMessage: null, errorDiagnostics: null});
        let revised = null, rewriteFailure = null;
        try {
          const raw = await adapt(wordCountRevisionPrompt(job.story, job.settings, job.language, job.draft), job.settings);
          const candidate = normalizeDraft({...raw, title: job.draft.title,
            pages: raw?.pages?.map((page, index) => ({...page, altTexts: job.draft.pages[index]?.altTexts}))}, job.settings, job.story, job.draft, {allowWordCountMismatch: true});
          revised = usable(candidate);
        } catch (error) {
          if (error.code === "generation-lease-lost") throw error;
          rewriteFailure = error;
        }
        const draft = closestDraft(original, revised, target);
        if (!draft) throw rewriteFailure || fail("The article has no usable story text. Retry preparation.", "invalid-news");
        if (rewriteFailure) require("firebase-functions/logger").warn("News length rewrite failed; keeping the existing valid draft", {generationId, ...generationFailure(rewriteFailure, "word_count").errorDiagnostics});
        return repository.checkpoint(job, {draft, wordCountRevisions: (job.wordCountRevisions || 0) + 1,
          wordCountDraft: draft === revised ? "rewritten" : "original", stage: "vocabulary", errorCode: null, errorMessage: null, errorDiagnostics: null});
      }
      if (job.stage === "vocabulary") {
        const edition = {...job.draft, editionId: job.editionId, gradeKey: job.settings.gradeKey, language: job.language};
        const selected = await vocabulary.prepare(edition, job.vocabularyCount ?? defaultVocabularyCount(job.settings.level, job.settings.standard));
        return repository.checkpoint(job, {stage: "images"}, "queued", [{ref: repository.vocabularyRef(edition.editionId, selected.setId), data: selected}]);
      }
      if (job.stage === "images") {
        if (job.images.every(Boolean)) return repository.checkpoint(job, {stage: "finish"});
        if (job.actualPhotoType === "web") {
          const attempt = job.webAttempts + 1;
          const images = await media.findPhotos({story: job.story, plans: job.draft.imagePlans, existing: job.images, generationId, visualKeys: job.visualKeys, attempt});
          if (!Array.isArray(images) || images.length !== job.settings.photoCount || images.some(image => image && image.sourceType !== "web")) throw fail("Invalid web-photo result.", "invalid-news");
          if (images.every(Boolean) || attempt < 2) return repository.checkpoint(job, {images, webAttempts: attempt, stage: images.every(Boolean) ? "finish" : "images"});
          return repository.checkpoint(job, {images: Array(job.settings.photoCount).fill(null), actualPhotoType: "ai", photoFallbackUsed: true, webAttempts: attempt,
            visualKeys: job.draft.imagePlans.map(plan => hash([job.story.storyId, plan, job.settings.imageSettings, "ai"]))});
        }
        const index = job.images.findIndex(image => !image), images = [...job.images];
        const cached = await repository.db().collection(`newsStories/${job.story.storyId}/media`).where("visualKey", "==", job.visualKeys[index]).limit(1).get();
        images[index] = cached.docs[0]?.data() || await media.generateAi({story: job.story, plan: job.draft.imagePlans[index], imageSettings: job.settings.imageSettings, generationId, visualKey: job.visualKeys[index]});
        if (!images[index] || images[index].sourceType !== "ai") throw fail("No usable illustration was prepared.", "image-generation-failed");
        return repository.checkpoint(job, {images, stage: images.every(Boolean) ? "finish" : "images"});
      }
      if (job.stage === "finish") {
        if (job.images.length !== job.settings.photoCount || job.images.some(image => !image || image.sourceType !== job.actualPhotoType)) throw fail("The image set is incomplete.", "invalid-news");
        const edition = {editionId: job.editionId, storyId: job.story.storyId, storyRevision: job.story.revision, ...editionKeys(job.story, job.settings, job.language),
          gradeKey: job.settings.gradeKey, questionFamilyId: job.questionFamilyId || job.baseKey, level: job.settings.level, standard: job.settings.standard, language: job.language, articleTypeId: job.settings.articleTypeId,
          configurationSnapshot: job.settings, effectiveSettingsHash: hash(job.settings), ...job.draft, images: job.images,
          targetWordCount: job.settings.targetWordCount, requestedPhotoType: job.settings.photoType, actualPhotoType: job.actualPhotoType, photoFallbackUsed: job.photoFallbackUsed, status: "ready"};
        if (job.mode === "preview") return repository.checkpoint(job, {edition, completedAt: now()}, "completed");
        return repository.publish(job.story, edition, {job});
      }
      throw fail("Unknown generation stage.", "failed-precondition");
    } catch (error) {
      if (error.code === "generation-lease-lost") return null;
      const failure = generationFailure(error, job.stage);
      require("firebase-functions/logger").error("News generation step failed", {generationId, stage: job.stage, ...failure.errorDiagnostics});
      await repository.checkpoint(job, failure, "failed");
      return null;
    }
  }
  function jobView(job) {
    return {generationId: job.generationId, status: job.status, stage: job.stage, pooled: job.pooled || false,
      progress: {prepared: job.images?.filter(Boolean).length || 0, total: job.settings?.photoCount || 0},
      errorCode: job.errorCode || null, errorMessage: job.errorMessage || null,
      article: job.mode === "preview" && job.status === "completed" ? publicArticle(job.story, job.edition) : null};
  }
  return {enqueuePreview, enqueuePreviewLanguage, enqueueEdition, enqueueDiscovery, run, jobView, repository, vocabulary, questions, identity};
}
module.exports = {createNewsGenerator};
