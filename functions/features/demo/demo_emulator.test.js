const {test} = require("node:test"), assert = require("node:assert/strict"), {randomUUID} = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const {createDemoTestSystem, token} = require("./test_support.cjs");
const d = require("./domain/demo");
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
const fixture = async name => createDemoTestSystem("demo-rhx-demo-" + name);

test("guest isolation, scope filtering, bank shortfall, reuse and once-only practice rewards", {skip: !enabled}, async () => {
  const s = await fixture("practices");
  try {
    const secret = await s.start(), other = await s.start();
    assert.equal((await s.service.startDemo(secret, {}, {})).summary.totalCoins, 1);
    const subjects = await s.service.getSubjects(secret, {});
    assert.deepEqual(subjects.subjects.map(item => item.id), ["math", "english"]);
    await assert.rejects(s.service.getNewsOptions(secret, {}), {code: "failed-precondition"});
    await assert.rejects(s.service.preparePractice(secret, {requestId: randomUUID(), syllabusId: "other-country", topicId: "fractions", language: "English", practiceType: "normal", questionCount: 3, difficulty: "medium"}), {code: "permission-denied"});
    s.state.pool.push(s.bankQuestion(1), s.bankQuestion(2));
    const prepared = await s.prepare(secret, {questionCount: 9});
    assert.deepEqual(s.state.batches, [5, 2]); assert.equal(prepared.practice.questions.length, 9);
    assert.equal(JSON.stringify(prepared).includes("correctAnswer"), false);
    await assert.rejects(s.service.getPractice(other, {attemptId: prepared.practice.attemptId}), {code: "not-found"});
    const request = {attemptId: prepared.practice.attemptId, answers: prepared.practice.questions.map(q => ({questionId: q.id, selectedOption: "a"}))};
    const submitted = await Promise.all([s.service.submitPractice(secret, request), s.service.submitPractice(secret, request)]);
    assert.equal(submitted[0].summary.totalCoins, 21); assert.equal(submitted[1].summary.practicesCompleted, 1);
    await s.prepare(other, {questionCount: 9}); assert.deepEqual(s.state.batches, [5, 2], "future guests reuse the replenished pool");
    assert.equal((await s.db.collection("students").get()).size, 0);
    assert.equal((await s.db.collection("studentPractices").get()).size, 0);
    assert.equal((await s.db.collection("rewards").get()).size, 0);
  } finally {await s.db.terminate();}
});
test("essay and passage completions earn immediately; grading retries retain immutable answers", {skip: !enabled}, async () => {
  const s = await fixture("marking");
  try {
    const secret = await s.start();
    let result = await s.complete(secret, {syllabusId: "english", topicId: "writing", practiceType: "essay"});
    assert.equal(result.summary.totalCoins, 21); assert.equal(result.practice.submitted, true);
    s.state.failMarking = true;
    result = await s.drainPractice(secret, result.practice.attemptId); assert.equal(result.practice.status, "failed");
    const repeated = await s.service.submitPractice(secret, {attemptId: result.practice.attemptId, essayText: "different answer"});
    assert.equal(repeated.practice.submission.essayText, "I found treasure today.");
    assert.equal(repeated.summary.totalCoins, 21);
    s.state.failMarking = false;
    await s.service.getPractice(secret, {attemptId: result.practice.attemptId, retry: true});
    result = await s.drainPractice(secret, result.practice.attemptId); assert.equal(result.practice.result.score, 85);
    let fill = await s.prepare(secret, {syllabusId: "english", topicId: "grammar", practiceType: "fillInTheBlanks"});
    assert.equal(JSON.stringify(fill).includes("correctAnswer"), false);
    fill = await s.service.submitPractice(secret, {attemptId: fill.practice.attemptId, answers: {q1: "walks", q2: "reading"}});
    fill = await s.drainPractice(secret, fill.practice.attemptId);
    assert.equal(fill.practice.result.questionsCorrect, 2); assert.equal(fill.summary.totalCoins, 41);
  } finally {await s.db.terminate();}
});
test("fill answers require the owning ready demo passage and do not submit or award coins", {skip: !enabled}, async () => {
  const s = await fixture("fill-answers");
  try {
    const secret = await s.start(), other = await s.start();
    const queued = await s.service.preparePractice(secret, {requestId: randomUUID(), syllabusId: "english", topicId: "grammar", language: "English", practiceType: "fillInTheBlanks"});
    const input = {attemptId: queued.practice.attemptId};
    await assert.rejects(s.service.getFillInTheBlanksAnswers(secret, input), {code: "failed-precondition"});
    await s.drainPractice(secret, input.attemptId);
    await assert.rejects(s.service.getFillInTheBlanksAnswers(other, input), {code: "not-found"});
    await assert.rejects(s.service.getFillInTheBlanksAnswers(secret, {...input, passageId: "another-passage"}), {code: "invalid-argument"});
    const filled = await s.service.getFillInTheBlanksAnswers(secret, input);
    assert.deepEqual(filled, {...input, answers: {q1: "walks", q2: "reading"}});
    const unchanged = await s.service.getPractice(secret, input);
    assert.equal(unchanged.practice.submitted, false); assert.equal(unchanged.summary.totalCoins, 1);
    assert.equal(JSON.stringify(unchanged).includes("correctAnswer"), false);
    const mcq = await s.prepare(other);
    await assert.rejects(s.service.getFillInTheBlanksAnswers(other, {attemptId: mcq.practice.attemptId}), {code: "failed-precondition"});
    const completed = await s.service.submitPractice(secret, {...input, answers: filled.answers});
    assert.equal(completed.summary.totalCoins, 21);
    await assert.rejects(s.service.getFillInTheBlanksAnswers(secret, input), {code: "failed-precondition"});
    const abandoned = await s.prepare(secret, {syllabusId: "english", topicId: "grammar", practiceType: "fillInTheBlanks"});
    await s.service.cancelPractice(secret, {attemptId: abandoned.practice.attemptId});
    await assert.rejects(s.service.getFillInTheBlanksAnswers(secret, {attemptId: abandoned.practice.attemptId}), {code: "failed-precondition"});
    await s.service.finishDemo(secret, {});
    await assert.rejects(s.service.getFillInTheBlanksAnswers(secret, input), {code: "failed-precondition"});
  } finally {await s.db.terminate();}
});
test("simultaneous guests share replenishment and abandoned runs expire", {skip: !enabled}, async () => {
  const s = await fixture("pool-race"); let release, worker;
  try {
    const first = await s.start(), second = await s.start();
    const input = () => ({requestId: randomUUID(), syllabusId: "math", topicId: "fractions", language: "English",
      practiceType: "normal", questionCount: 3, difficulty: "medium"});
    const one = await s.service.preparePractice(first, input()), two = await s.service.preparePractice(second, input());
    s.state.generationGate = new Promise(resolve => {release = resolve;});
    worker = s.service.runPractice(d.sessionId(first), one.practice.attemptId, 1);
    for (let i = 0; i < 100 && !s.state.batches.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    await s.service.runPractice(d.sessionId(second), two.practice.attemptId, 1);
    assert.equal((await s.service.getPractice(second, {attemptId: two.practice.attemptId})).practice.status, "waiting");
    release(); await worker;
    s.setTime(new Date(s.now().getTime() + 6000));
    await s.service.getPractice(second, {attemptId: two.practice.attemptId});
    const ready = await s.drainPractice(second, two.practice.attemptId);
    assert.equal(ready.practice.status, "ready"); assert.deepEqual(s.state.batches, [3]);
    s.setTime(new Date(s.now().getTime() + 3 * 3600000));
    await assert.rejects(s.service.getSubjects(first, {}), {code: "failed-precondition"});
    await s.repository.cleanup();
    assert.equal((await s.db.collection("demoSessions").get()).size, 0);
    assert.equal(s.state.pool.length, 3);
  } finally {release?.(); await worker; await s.db.terminate();}
});
test("tutor requires an incorrect submitted question, redacts mini answers and rechecks policy", {skip: !enabled}, async () => {
  const s = await fixture("tutor");
  try {
    const secret = await s.start(), result = await s.complete(secret, {}, true), attemptId = result.practice.attemptId;
    await assert.rejects(s.service.getTutor(secret, {attemptId, questionIndex: 1}), {code: "permission-denied"});
    const guide = await s.service.getTutor(secret, {attemptId, questionIndex: 0});
    assert.equal(JSON.stringify(guide).includes("expectedAnswer"), false);
    assert.equal((await s.service.checkTutor(secret, {attemptId, questionIndex: 0, sequence: 1, answer: "2"})).isCorrect, true);
    s.state.tutorEnabled = false;
    await assert.rejects(s.service.checkTutor(secret, {attemptId, questionIndex: 0, sequence: 1, answer: "2"}), {code: "failed-precondition"});
  } finally {await s.db.terminate();}
});
test("tutor autofill reads only the opened guide's selected step and preserves its version", {skip: !enabled}, async () => {
  const s = await fixture("tutor-answers");
  try {
    const secret = await s.start(), other = await s.start(), result = await s.complete(secret, {}, true);
    const input = {attemptId: result.practice.attemptId, questionIndex: 0, sequence: 1};
    await assert.rejects(s.service.getTutorAnswer(secret, input), {code: "failed-precondition"});
    const guide = await s.service.getTutor(secret, {attemptId: input.attemptId, questionIndex: 0});
    assert.equal(JSON.stringify(guide).includes("expectedAnswer"), false);
    await assert.rejects(s.service.getTutorAnswer(other, input), {code: "not-found"});
    await assert.rejects(s.service.getTutorAnswer(secret, {...input, guideId: "arbitrary-guide"}), {code: "invalid-argument"});
    for (const sequence of [0, 1.5, 3]) await assert.rejects(s.service.getTutorAnswer(secret, {...input, sequence}), {code: "invalid-argument"});
    assert.deepEqual(await s.service.getTutorAnswer(secret, input), {questionIndex: 0, sequence: 1, answer: "2"});
    assert.equal((await s.service.getTutorAnswer(secret, {...input, sequence: 2})).answer, "3");
    s.state.tutorInstructions = "revised"; s.state.tutorAnswers = ["two", "three"];
    const {attempt} = await s.repository.readAttempt(secret, input.attemptId);
    const revised = await s.content.getTutor({...attempt, tutorGuides: {}}, 0);
    assert.notEqual(revised.guideId, guide.guideId); assert.equal(revised.miniQuestions[0].expectedAnswer, "two");
    const original = await s.service.getTutorAnswer(secret, input);
    assert.equal(original.answer, "2", "autofill follows the opened guide after tutor instructions change");
    assert.equal((await s.service.checkTutor(secret, {...input, answer: original.answer})).isCorrect, true);
    assert.equal((await s.service.getPractice(secret, {attemptId: input.attemptId})).summary.totalCoins, 21);
    s.state.tutorEnabled = false;
    await assert.rejects(s.service.getTutorAnswer(secret, input), {code: "failed-precondition"});
    await s.service.finishDemo(secret, {});
    await assert.rejects(s.service.getTutorAnswer(secret, input), {code: "failed-precondition"});
  } finally {await s.db.terminate();}
});
test("news follows practice, uses shared preparation, rewards 3/3 once across language changes", {skip: !enabled}, async () => {
  const s = await fixture("news");
  try {
    const secret = await s.start(); await s.complete(secret);
    let ready;
    for (let i = 0; i < 8; i++) {
      ready = await s.service.prepareNews(secret, {newsType: "local", language: "English"});
      if (ready.status === "ready") break; await s.drainNews();
    }
    assert.equal(ready.status, "ready"); assert.equal(ready.article.country, "Malaysia");
    let quiz;
    for (let i = 0; i < 5; i++) {
      quiz = await s.service.getNewsQuestions(secret, {newsType: "local", articleLanguage: "English"});
      if (quiz.status === "ready") break; await s.drainNews();
    }
    assert.equal(quiz.status, "ready"); assert.equal(JSON.stringify(quiz).includes("acceptedAnswers"), false);
    const localized = await s.newsRepository.questionLanguage(quiz.setId, require("../news_article/domain/news_questions").languageId("English"));
    const answers = localized.questions.map(q => ({questionId: q.id, value: q.answerChoiceId}));
    const request = {newsType: "local", articleLanguage: "English", setId: quiz.setId, answers};
    const completed = await Promise.all([s.service.submitNewsQuestions(secret, request), s.service.submitNewsQuestions(secret, request)]);
    assert.equal(completed[0].attempt.score, 3); assert.equal(completed[0].summary.totalCoins, 26);
    assert.equal(completed[1].completion.rewards.totalCoins, 5);
    for (let i = 0; i < 8; i++) {
      ready = await s.service.prepareNews(secret, {newsType: "local", language: "French"});
      if (ready.status === "ready") break; await s.drainNews();
    }
    for (let i = 0; i < 5; i++) {
      quiz = await s.service.getNewsQuestions(secret, {newsType: "local", articleLanguage: "French"});
      if (quiz.status === "ready") break; await s.drainNews();
    }
    assert.equal(quiz.attempt.score, 3); assert.equal(quiz.summary.totalCoins, 26);
    assert.equal((await s.db.collection("studentNews").get()).size, 0);
    assert.equal((await s.db.collection("rewards").get()).size, 0);
  } finally {await s.db.terminate();}
});
test("finish and cancellation fence late workers, retain pool content and clear personal activity", {skip: !enabled}, async () => {
  const s = await fixture("cleanup");
  let release, worker;
  try {
    const secret = await s.start(), requestId = randomUUID();
    await s.service.cancelPractice(secret, {requestId});
    await assert.rejects(s.service.preparePractice(secret, {requestId, syllabusId: "math", topicId: "fractions", language: "English",
      practiceType: "normal", questionCount: 3, difficulty: "medium"}), {code: "failed-precondition"});
    const pending = await s.service.preparePractice(secret, {requestId: randomUUID(), syllabusId: "math", topicId: "fractions", language: "English",
      practiceType: "normal", questionCount: 3, difficulty: "medium"});
    s.state.generationGate = new Promise(resolve => {release = resolve;});
    const attemptId = pending.practice.attemptId; worker = s.service.runPractice(d.sessionId(secret), attemptId, 1);
    for (let i = 0; i < 100 && !s.state.batches.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(s.state.batches.length, 1);
    const end = await s.service.finishDemo(secret, {}); assert.equal(end.summary.totalCoins, 1);
    release(); await worker;
    assert.equal(s.state.pool.length, 3, "valid shared questions survive ending the guest run");
    assert.equal((await s.repository.ref(d.sessionId(secret)).collection("attempts").get()).size, 0);
    await assert.rejects(s.service.getSubjects(secret, {}), {code: "failed-precondition"});
    assert.equal((await s.service.finishDemo(secret, {})).summary.totalCoins, 1, "lost finish response is retryable");
    s.setTime(new Date(s.now().getTime() + 3 * 3600000)); await s.repository.cleanup();
    assert.equal((await s.repository.ref(d.sessionId(secret)).get()).exists, false);
  } finally {release?.(); await worker; await s.db.terminate();}
});
test("demo roots remain private despite the legacy generic Firestore fallback", {skip: !enabled}, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST, project = "demo-rhx-demo-rules";
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const base = "http://" + host, prefix = "/v1/projects/" + project + "/databases/(default)/documents/";
  async function request(method, url, body, auth = "owner") {
    return fetch(base + url, {method, headers: {"Content-Type": "application/json", ...(auth ? {Authorization: "Bearer " + auth} : {})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  }
  const compiled = await request("PUT", "/emulator/v1/projects/" + project + ":securityRules",
    {rules: {files: [{name: "firestore.rules", content: fs.readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8")}]}});
  assert.equal(compiled.status, 200, await compiled.text());
  const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const instant = Math.floor(Date.now() / 1000);
  const signedIn = part({alg: "none", typ: "JWT"}) + "." + part({iss: "https://securetoken.google.com/" + project,
    aud: project, sub: "student", user_id: "student", iat: instant, exp: instant + 3600}) + ".";
  for (const name of ["demoSessions/run", "demoSessions/run/attempts/attempt", "demoSessions/run/news/local", "demoAdmission/sender", "demoQuestionPoolLeases/scope"]) {
    assert.equal((await request("PATCH", prefix + name, {fields: {private: {stringValue: "secret"}}})).status, 200);
    for (const auth of [null, signedIn]) {
      assert.equal((await request("GET", prefix + name, undefined, auth)).status, 403);
      assert.equal((await request("PATCH", prefix + name, {fields: {}}, auth)).status, 403);
    }
  }
});
