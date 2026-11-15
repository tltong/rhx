const assert = require("node:assert/strict"), test = require("node:test");
const {createTestSystem, readyQuestions} = require("../../../tests/news_test_support.cjs");
const {languageId, attemptId} = require("../news_article/domain/news_questions");
const admin = {auth: {uid: "admin"}}, host = process.env.FIRESTORE_EMULATOR_HOST;
const input = {newsType: "international", level: "primary", standard: 6, language: "English", clientRequestId: "questions-preview"};
async function preview(s, changes = {}) {const result = await s.service.generateNewsPreview({...input, ...changes}, admin); await s.drain(result.generationId, true); return result;}
test("private previews share questions across languages and preserve one immutable reviewed submission", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-questions-preview");
  try {
    const start = await preview(s), ref = {previewGenerationId: start.generationId}, before = await s.repository.job(start.generationId);
    await assert.rejects(s.service.getNewsQuestions(ref, {auth: {uid: "admin-other"}}), e => e.code === "permission-denied");
    await assert.rejects(s.service.getNewsQuestions({...ref, editionId: "injected"}, admin), e => e.code === "invalid-argument");
    const pending = await s.service.getNewsQuestions(ref, admin);
    const french = await s.service.requestNewsPreviewLanguage({generationId: start.generationId, language: "French"}, admin); await s.drain(french.generationId);
    const frenchRef = {previewGenerationId: french.generationId};
    assert.equal((await s.service.getNewsQuestions(frenchRef, admin)).generationId, pending.generationId);
    await s.drain(pending.generationId, true);
    const questions = await readyQuestions(s, ref, admin), translated = await readyQuestions(s, frenchRef, admin);
    assert.equal(questions.answerMode, "typed"); assert.equal(questions.setId, translated.setId); assert.equal(questions.attemptId, translated.attemptId);
    assert.equal(s.calls.questions, 1); assert.equal(s.calls.questionTranslation, 1);
    assert.deepEqual(questions.questions.map(q => q.id), translated.questions.map(q => q.id)); assert.deepEqual(questions.wordBank, []);
    assert.doesNotMatch(JSON.stringify(questions), /acceptedAnswers|answerChoiceId|evidence/);
    const config = await s.configFeature.loadNewsConfiguration(); config.gradeSettings.primary[6].questionAnswerMode = "word_bank";
    await s.configFeature.saveNewsConfiguration({...config, expectedVersion: config.version}, admin);
    assert.equal((await s.service.getNewsQuestions(ref, admin)).answerMode, "typed", "an opened attempt retains its mode");
    const answers = [" SCIENCE   EXHIBITION ", "SPACE", "Tuesday"].map((value, i) => ({questionId: "q" + (i + 1), value}));
    await assert.rejects(s.service.submitNewsQuestions({...ref, setId: questions.setId, answers: answers.slice(0, 2)}, admin), e => e.code === "invalid-argument");
    const submitted = await s.service.submitNewsQuestions({...ref, setId: questions.setId, answers}, admin);
    assert.equal(submitted.attempt.score, 2); assert.equal(submitted.attempt.review[2].correctAnswer, "Monday");
    const noRetry = await s.service.submitNewsQuestions({...frenchRef, setId: questions.setId, answers: []}, admin);
    assert.equal(noRetry.attempt.score, 2); assert.equal(noRetry.attempt.review[2].response, "Tuesday"); assert.equal(noRetry.attempt.review[2].correctAnswer, "French Monday");
    assert.equal((await s.service.getNewsQuestions(ref, admin)).attempt.score, 2);
    assert.deepEqual((await s.repository.job(start.generationId)).edition, before.edition); assert.equal((await s.db.collection("newsStories").get()).size, 0);
    assert.equal(s.calls.questions, 1); assert.equal(s.calls.questionTranslation, 1);
  } finally {await s.db.terminate();}
});
test("student submissions are private, shared-content only, atomic, and required for completion at any score", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-questions-student");
  try {
    const start = await preview(s), previewRef = {previewGenerationId: start.generationId}; await readyQuestions(s, previewRef, admin);
    await s.service.addNewsPreviewToPool({generationId: start.generationId}, admin);
    const a = await s.student("student-question-a"), b = await s.student("student-question-b"), stranger = await s.student("student-question-stranger");
    const request = {newsType: "international", language: "English", timeZone: "Asia/Kuala_Lumpur", clientRequestId: "read"};
    const opened = await s.service.requestStudentNews(request, a); await s.service.requestStudentNews(request, b);
    const ref = {assignmentId: opened.assignmentId, articleLanguage: "English"};
    await assert.rejects(s.service.finishStudentNews({assignmentId: opened.assignmentId}, a), /Submit all three/);
    await assert.rejects(s.service.getNewsQuestions(ref, stranger), e => e.code === "not-found");
    const qa = await readyQuestions(s, ref, a), qb = await readyQuestions(s, ref, b);
    assert.equal(qa.setId, qb.setId); assert.notEqual(qa.attemptId, qb.attemptId); assert.equal(s.calls.questions, 1);
    const wrong = qa.questions.map(question => ({questionId: question.id, value: "wrong"}));
    const [one, duplicate] = await Promise.all([s.service.submitNewsQuestions({...ref, setId: qa.setId, answers: wrong}, a), s.service.submitNewsQuestions({...ref, setId: qa.setId, answers: wrong}, a)]);
    assert.deepEqual(one, duplicate); assert.equal(one.attempt.score, 0); assert.equal((await s.service.getNewsQuestions(ref, b)).attempt, null);
    await s.service.finishStudentNews({assignmentId: opened.assignmentId}, a); await s.service.finishStudentNews({assignmentId: opened.assignmentId}, a);
    await assert.rejects(s.service.finishStudentNews({assignmentId: opened.assignmentId}, b), /Submit all three/);
    assert.equal((await s.db.doc(`studentNews/${a.auth.uid}/questionAttempts/${attemptId(opened.article)}`).get()).data().score, 0);
    const french = await s.service.requestStudentNewsLanguage({assignmentId: opened.assignmentId, language: "French"}, b); await s.drain(french.generationId);
    await s.service.getStudentNewsAssignment({assignmentId: opened.assignmentId, language: "French"}, b);
    const translated = await readyQuestions(s, {...ref, articleLanguage: "French"}, b);
    assert.equal(translated.setId, qa.setId); assert.equal(translated.attempt, null); assert.equal(s.calls.questionTranslation, 1);
  } finally {await s.db.terminate();}
});
test("picture-only word banks, failed preparation recovery and concurrent final submissions", {skip: !host}, async () => {
  const s = await createTestSystem("demo-rhx-news-questions-pictures");
  try {
    const config = await s.configFeature.loadNewsConfiguration(); config.gradeSettings.primary[1].targetWordCount = 0;
    await s.configFeature.saveNewsConfiguration({...config, expectedVersion: config.version}, admin);
    const started = await preview(s, {standard: 1}), ref = {previewGenerationId: started.generationId};
    s.state.failQuestions = true; const first = await s.service.getNewsQuestions(ref, admin); await s.drain(first.generationId);
    assert.equal((await s.service.getNewsQuestions(ref, admin)).status, "failed"); s.state.failQuestions = false;
    await s.service.getNewsQuestions({...ref, retry: true}, admin); await s.drain(first.generationId, true);
    const ready = await readyQuestions(s, ref, admin); assert.equal(ready.answerMode, "word_bank"); assert.equal(ready.wordBank.length, 5);
    const localized = await s.repository.questionLanguage(ready.setId, languageId("English"));
    assert.ok(localized.questions.every(q => q.evidence.source === "image"));
    const correct = localized.questions.map(q => ({questionId: q.id, value: q.answerChoiceId})), incorrect = localized.questions.map(q => ({questionId: q.id, value: ready.wordBank.find(choice => !localized.questions.some(q => q.answerChoiceId === choice.id)).id}));
    const [a, b] = await Promise.all([s.service.submitNewsQuestions({...ref, setId: ready.setId, answers: correct}, admin), s.service.submitNewsQuestions({...ref, setId: ready.setId, answers: incorrect}, admin)]);
    assert.equal(a.attempt.score, b.attempt.score); assert.ok([0, 3].includes(a.attempt.score)); assert.deepEqual(a.attempt.review, b.attempt.review);
    assert.equal(s.calls.questions, 2); assert.equal(s.calls.ai, 3); assert.equal(s.calls.vocabulary, 0);
  } finally {await s.db.terminate();}
});
