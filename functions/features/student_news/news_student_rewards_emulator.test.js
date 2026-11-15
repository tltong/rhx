const assert = require("node:assert/strict"), test = require("node:test");
const {createTestSystem, readyQuestions} = require("../../../tests/news_test_support.cjs");
const {languageId, attemptId} = require("../news_article/domain/news_questions");
const host = process.env.FIRESTORE_EMULATOR_HOST, admin = {auth: {uid: "admin"}};
async function pooled(s) {
  const result = await s.service.generateNewsPreview({newsType: "international", level: "primary", standard: 6, language: "English", clientRequestId: "pool"}, admin);
  await s.drain(result.generationId); await s.service.addNewsPreviewToPool({generationId: result.generationId}, admin); return result;
}
async function open(s, context, newsType = "international") {
  const input = {newsType, language: "English", timeZone: "Asia/Kuala_Lumpur", clientRequestId: "read"};
  for (let i = 0; i < 4; i++) {const result = await s.service.requestStudentNews(input, context); if (result.status === "ready") return result; await s.drain(result.generationId);}
  throw Error("Article was not ready");
}
async function submit(s, context, article, correct = true) {
  const ref = {assignmentId: article.assignmentId, articleLanguage: "English"}, ready = await readyQuestions(s, ref, context);
  const selected = await s.repository.questionLanguage(ready.setId, languageId("English"));
  const answers = selected.questions.map(q => ({questionId: q.id, value: correct ? selected.choices.find(c => c.id === q.answerChoiceId).text : "wrong"}));
  return {input: {...ref, setId: ready.setId, answers}, result: await s.service.submitNewsQuestions({...ref, setId: ready.setId, answers}, context)};
}
test("news submission atomically completes and awards frozen amounts once across races, retries and languages", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-student-rewards");
  try {
    await pooled(s); const student = await s.student("reward-student"), article = await open(s, student);
    assert.equal((await s.db.doc(`studentNews/${student.auth.uid}/daily/${article.assignmentId}`).get()).data().rewardSettings.completionCoins, 2);
    await s.db.doc("rewards/config").set({newsArticleCompletionCoins: 40, newsAllCorrectCoins: 60});
    const ref = {assignmentId: article.assignmentId, articleLanguage: "English"}, ready = await readyQuestions(s, ref, student), selected = await s.repository.questionLanguage(ready.setId, languageId("English"));
    const input = {...ref, setId: ready.setId, answers: selected.questions.map(q => ({questionId: q.id, value: selected.choices.find(c => c.id === q.answerChoiceId).text}))};
    const [first, concurrent] = await Promise.all([s.service.submitNewsQuestions(input, student), s.service.submitNewsQuestions(input, student)]);
    assert.deepEqual(first, concurrent); assert.equal(first.attempt.score, 3); assert.deepEqual(first.completion.rewards, {completionCoins: 2, allCorrectCoins: 2, totalCoins: 4});
    assert.equal((await s.db.doc("rewards/reward-student").get()).data().totalCoins, 4);
    assert.equal((await s.service.getStudentNewsOverview({}, student)).slots.international.status, "completed");
    assert.equal((await s.db.collection("studentNews/reward-student/history").get()).size, 1);
    await s.service.submitNewsQuestions({...input, answers: []}, student); await s.service.finishStudentNews({assignmentId: article.assignmentId}, student);
    const language = await s.service.requestStudentNewsLanguage({assignmentId: article.assignmentId, language: "French"}, student); await s.drain(language.generationId);
    await s.service.getStudentNewsAssignment({assignmentId: article.assignmentId, language: "French"}, student);
    const reviewed = await readyQuestions(s, {assignmentId: article.assignmentId, articleLanguage: "French"}, student);
    assert.equal(reviewed.attempt.score, 3); assert.equal(reviewed.completion.rewards.totalCoins, 4);
    assert.equal((await s.db.doc("rewards/reward-student").get()).data().totalCoins, 4);
    const entries = await s.db.collection("rewards/reward-student/categories").get(); assert.equal(entries.size, 2);
    for (const category of entries.docs) assert.equal((await category.ref.collection("history").get()).size, 1);
  } finally {await s.db.terminate();}
});
test("wrong answers receive completion coins, disabled rewards remain zero, and previews earn none", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-student-zero-rewards");
  try {
    const preview = await pooled(s), previewRef = {previewGenerationId: preview.generationId};
    const ready = await readyQuestions(s, previewRef, admin), selected = await s.repository.questionLanguage(ready.setId, languageId("English"));
    await s.service.submitNewsQuestions({...previewRef, setId: ready.setId, answers: selected.questions.map(q => ({questionId: q.id, value: selected.choices.find(c => c.id === q.answerChoiceId).text}))}, admin);
    assert.equal((await s.db.collection("rewards").get()).size, 0);
    const a = await s.student("wrong-student"), first = await open(s, a), wrong = await submit(s, a, first, false);
    assert.equal(wrong.result.attempt.score, 0); assert.equal(wrong.result.completion.rewards.totalCoins, 2);
    await s.db.doc("rewards/config").set({newsArticleCompletionCoins: 0, newsAllCorrectCoins: 0});
    const b = await s.student("zero-student"), second = await open(s, b), zero = await submit(s, b, second);
    assert.equal(zero.result.completion.rewards.totalCoins, 0); assert.equal((await s.db.doc("rewards/zero-student").get()).data().totalCoins, 0);
    await s.db.doc("rewards/config").set({newsArticleCompletionCoins: 50, newsAllCorrectCoins: 50});
    await s.service.submitNewsQuestions(zero.input, b); assert.equal((await s.db.doc("rewards/zero-student").get()).data().totalCoins, 0);
  } finally {await s.db.terminate();}
});
test("a failed coin transaction leaves answers open, article unfinished and totals intact, then safely retries", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-student-reward-rollback");
  try {
    await pooled(s); const student = await s.student("overflow-student"), article = await open(s, student);
    await s.db.doc("rewards/overflow-student").set({totalCoins: Number.MAX_SAFE_INTEGER});
    await assert.rejects(submit(s, student, article), /safe integer/);
    assert.equal((await s.db.doc(`studentNews/overflow-student/questionAttempts/${attemptId(article.article)}`).get()).data().status, "open");
    assert.equal((await s.db.doc(`studentNews/overflow-student/daily/${article.assignmentId}`).get()).data().status, "ready");
    assert.equal((await s.db.collection("studentNews/overflow-student/history").get()).size, 0); assert.equal((await s.db.collection("rewards/overflow-student/categories").get()).size, 0);
    await s.db.doc("rewards/overflow-student").set({totalCoins: 5});
    await submit(s, student, article); assert.equal((await s.db.doc("rewards/overflow-student").get()).data().totalCoins, 9);
  } finally {await s.db.terminate();}
});
test("overview never generates news; history is paginated and private, and older articles allow new language editions", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-student-history");
  try {
    const student = await s.student("history-student"), stranger = await s.student("history-stranger");
    const empty = await s.service.getStudentNewsOverview({}, student); assert.equal(empty.country, "Malaysia"); assert.deepEqual(empty.languages, ["English", "French", "Tamil"]);
    assert.equal(s.calls.discover, 0); assert.equal((await s.db.collection("studentNews/history-student/daily").get()).size, 0);
    const first = await open(s, student); await submit(s, student, first);
    s.setTime("2026-11-15T10:00:00Z"); const second = await open(s, student);
    const one = await s.service.listStudentNewsHistory({limit: 1}, student), two = await s.service.listStudentNewsHistory({limit: 1, cursor: one.nextCursor}, student);
    assert.equal(one.items[0].assignmentId, second.assignmentId); assert.equal(two.items[0].assignmentId, first.assignmentId); assert.equal(two.nextCursor, null);
    assert.equal(two.items[0].canOpen, true);
    await s.db.doc("studentNews/history-student/daily/2026-11-13_local").set({assignmentId: "2026-11-13_local", newsType: "local", country: "Malaysia", localDate: "2026-11-13", status: "preparing", storyId: null,
      createdAt: new Date("2026-11-13T10:00:00Z"), windowEndAt: new Date("2026-11-13T16:00:00Z")});
    assert.equal((await s.service.listStudentNewsHistory({}, student)).items.find(item => item.assignmentId === "2026-11-13_local").canOpen, false, "an expired search without an assigned story is not advertised as readable");
    assert.deepEqual((await s.service.listStudentNewsHistory({}, stranger)).items, []);
    await assert.rejects(s.service.listStudentNewsHistory({studentId: "history-student"}, stranger), e => e.code === "invalid-argument");
    const before = s.calls.discover;
    const language = await s.service.requestStudentNewsLanguage({assignmentId: first.assignmentId, language: "French"}, student); await s.drain(language.generationId);
    const old = await s.service.getStudentNewsAssignment({assignmentId: first.assignmentId, language: "French"}, student); assert.equal(old.article.storyId, first.article.storyId); assert.equal(old.completed, true); assert.equal(s.calls.discover, before);
    assert.equal((await s.service.getStudentNewsOverview({}, student)).slots.international.assignmentId, second.assignmentId);
  } finally {await s.db.terminate();}
});
