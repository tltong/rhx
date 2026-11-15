const {hash, key, id, fail} = require("../../news_article/domain/news_article");
const domain = require("../../news_article/domain/news_questions");
function createNewsQuestionsService({repository, questions, student, requireAdministrator, loadConfiguration, completion, rewards, now}) {
  const db = () => repository.db();
  async function source(raw, context, fields) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(field => !["previewGenerationId", "assignmentId", "articleLanguage", ...fields].includes(field))) throw fail("Invalid news question request fields.");
    if ((raw.previewGenerationId !== undefined) === (raw.assignmentId !== undefined)) throw fail("Choose one news preview or your own assignment.");
    let uid, edition, mode, attemptRef, assignmentRef = null;
    if (raw.previewGenerationId !== undefined) {
      if (raw.articleLanguage !== undefined) throw fail("A preview already identifies its article language.");
      uid = await requireAdministrator(context);
      const preview = await repository.job(id(raw.previewGenerationId, "preview ID"));
      const check = value => {
        if (value?.mode !== "preview" || value.ownerUid !== uid) throw fail("This preview belongs to another administrator.", "permission-denied");
        if (value.status !== "completed") throw fail("Finish article preparation before opening its questions.", "failed-precondition");
      };
      check(preview); edition = preview.edition; mode = preview.questionAnswerMode;
      let root = preview; const visited = new Set([root.generationId]);
      while (root.basePreviewId) {
        if (visited.has(root.basePreviewId) || visited.size > 100) throw fail("The original preview is unavailable.", "failed-precondition");
        root = await repository.job(root.basePreviewId); check(root); visited.add(root.generationId);
      }
      mode = root.questionAnswerMode || mode;
      attemptRef = db().doc(`newsGenerations/${root.generationId}/questionAttempts/${uid}`);
    } else {
      uid = (await student(context)).uid;
      assignmentRef = db().doc(`studentNews/${uid}/daily/${id(raw.assignmentId, "assignment ID")}`);
      const assignment = (await assignmentRef.get()).data();
      if (!assignment) throw fail("Assignment was not found.", "not-found");
      const editionId = assignment.editionIdsByLanguage?.[hash(key(raw.articleLanguage))];
      if (!editionId) throw fail("Open the complete article in this language before its questions.", "failed-precondition");
      edition = await repository.edition(editionId);
      if (!edition || edition.storyId !== assignment.storyId) throw fail("The assigned article is unavailable.", "failed-precondition");
      mode = assignment.questionAnswerMode;
      attemptRef = db().doc(`studentNews/${uid}/questionAttempts/${domain.attemptId(edition)}`);
    }
    if (!mode) {const [level, standard] = edition.gradeKey.split("_"); mode = (await loadConfiguration()).gradeSettings[level][standard].questionAnswerMode;}
    return {uid, edition, mode, attemptRef, assignmentRef};
  }
  async function get(raw, context) {
    const target = await source(raw, context, ["retry"]);
    if (raw.retry !== undefined && typeof raw.retry !== "boolean") throw fail("Invalid questions retry option.");
    let attempt = (await target.attemptRef.get()).data();
    for (let count = 0; count < 3; count++) {
      const selected = await questions.selection(target.edition, {retry: raw.retry === true, fixedSetId: attempt?.setId || null});
      if (selected.status !== "ready") return {status: selected.status, setId: selected.setId, generationId: selected.generationId, errorMessage: selected.errorMessage || null, questions: []};
      attempt = await db().runTransaction(async tx => {
        const existing = (await tx.get(target.attemptRef)).data(); if (existing) return existing;
        const created = {status: "open", ownerUid: target.uid, setId: selected.setId, answerMode: target.mode, storyId: target.edition.storyId, gradeKey: target.edition.gradeKey, createdAt: now()};
        tx.create(target.attemptRef, created); return created;
      });
      if (attempt.setId === selected.setId) return {attemptId: hash(target.attemptRef.path), ...domain.publicQuestions(selected, attempt.answerMode, attempt), ...(attempt.completion ? {completion: attempt.completion} : {})};
    }
    throw fail("The article questions changed. Open them again.", "aborted");
  }
  async function submit(raw, context) {
    const target = await source(raw, context, ["setId", "answers"]), setId = id(raw.setId, "question set ID");
    const selected = await repository.questionLanguage(setId, domain.languageId(target.edition.language));
    if (selected?.status !== "ready") throw fail("Finish preparing the questions before submitting.", "failed-precondition");
    const fallbackSettings = target.assignmentRef ? await rewards.settings() : null;
    const attempt = await db().runTransaction(async tx => {
      const current = (await tx.get(target.attemptRef)).data();
      if (!current || current.setId !== setId) throw fail("Open this article's questions before submitting.", "failed-precondition");
      // A lost submission response can be retried; it always returns the first
      // result and can never replace answers or create another attempt.
      if (current.status === "submitted") {
        if (target.assignmentRef) {const completed = await completion.stage(tx, {assignmentRef: target.assignmentRef, attempt: current, uid: target.uid, fallbackSettings}); return {...current, completion: completed};}
        return current;
      }
      const responses = domain.markAnswers(raw.answers, selected, current.answerMode);
      const saved = {...current, status: "submitted", language: target.edition.language, sourceEditionId: target.edition.editionId,
        responses, score: responses.filter(item => item.correct).length, submittedAt: now()};
      if (target.assignmentRef) saved.completion = await completion.stage(tx, {assignmentRef: target.assignmentRef, attempt: saved, uid: target.uid, fallbackSettings});
      tx.set(target.attemptRef, saved); return saved;
    });
    return {attemptId: hash(target.attemptRef.path), ...domain.publicQuestions(selected, attempt.answerMode, attempt), ...(attempt.completion ? {completion: attempt.completion} : {})};
  }
  return {getNewsQuestions: get, submitNewsQuestions: submit};
}
module.exports = {createNewsQuestionsService};
