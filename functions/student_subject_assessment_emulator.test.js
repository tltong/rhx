const {test} = require("node:test"), assert = require("node:assert/strict");

test("student dashboard start, generation, submission, result and interval lifecycle", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/); assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const {StudentSubjectAssessmentService} = require("./features/subject_assessment/application/student_subject_assessment_service");
  const {FirestoreStudentSubjectAssessmentRepository: Students} = require("./features/subject_assessment/infrastructure/firestore_student_subject_assessment_repository");
  const {FirestoreSubjectAssessmentGenerationRepository: Jobs} = require("./features/subject_assessment_generator/infrastructure/firestore_subject_assessment_generation_repository");
  const {FirestoreSubjectAssessmentSubmissionRepository: Submissions} = require("./features/subject_assessment/infrastructure/firestore_subject_assessment_submission_repository");
  const {createSubjectAssessmentGenerator} = require("./features/subject_assessment_generator/subject_assessment_generator_module");
  const {createSubjectAssessmentFeature} = require("./features/subject_assessment/subject_assessment_module");
  const {SubjectAssessmentContentPool} = require("./features/subject_assessment_generator/infrastructure/subject_assessment_content_pool");
  const {poolReference} = require("./features/subject_assessment/domain/subject_assessment");
  const {SCORING_POLICY} = require("./features/subject_assessment/domain/subject_assessment_submission");
  let clock = Date.parse("2026-11-08T08:00:00Z"), paid = 0, fail = false, subscribed = true;
  let scopes = [{syllabusId: "english", language: "English"}, {syllabusId: "math", language: "English"}];
  const student = {auth: {uid: "student"}};
  const authorize = async ({studentId}, context) => {
    if (!context?.auth?.uid) throw Object.assign(new Error("Sign in"), {code: "unauthenticated"});
    assert.equal(context.auth.uid, studentId); return {uid: studentId, canSubmit: true, assertAccess() {}};
  };
  const repository = new Students({now: () => clock});
  const deps = {getDb: () => db, random: () => 0, llmProfiles: {STANDARD_PRO: {}},
    getDefaultPrompt: async () => ({id: "default"}), getDiagramPercentage: async () => 0, generatePrompt: async () => "Generate a task",
    generateText: async () => {paid++; if (fail) throw new Error("Provider unavailable with sensitive details"); return {questions: [{questionText: "New task " + paid,
      options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", answerExplanation: "Two", topicName: "Numbers", hasDiagram: false}]};},
    writeQuestion: require("./features/question/question_module").writeQuestion};
  const service = new StudentSubjectAssessmentService({repository, authorize, listSubjects: async () => subscribed ? scopes : [],
    createGenerator: options => createSubjectAssessmentGenerator({...options, jobs: new Jobs({now: () => clock}), random: () => 0,
      createPool: run => new SubjectAssessmentContentPool(run, deps)})});
  const api = createSubjectAssessmentFeature({authorize, studentService: service, submissions: new Submissions({now: () => clock}),
    loadSettings: async () => ({policy: SCORING_POLICY, essay: {}, fill: {}})});
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await db.doc("students/student").set({name: "Student"});
  await db.doc("assessmentFrameworks/normal").set({frameworkType: "normal"});
  const config = require("./features/subject_assessment_config/subject_assessment_config_module").createSubjectAssessmentConfigFeature({authorize: async () => ({uid: "admin"})});
  for (const syllabusId of ["english", "math"]) {
    await db.doc(`syllabusSubscriptions/student/syllabuses/${syllabusId}`).set({state: "active", language: "English"});
    await db.doc("syllabuses/" + syllabusId).set({country: "MY", level: "primary", year: 4, subject: syllabusId, active: true, languages: ["English", "Tamil"]});
    await db.doc(`syllabuses/${syllabusId}/topics/numbers`).set({topicName: "Numbers", assessmentFrameworkIds: {english: "normal", tamil: "normal"}});
    for (const language of ["English", "Tamil"]) await config.saveSubjectAssessmentConfig({syllabusId, language, expectedVersion: 0,
      topics: [{topicId: "numbers", totalCount: 2, difficultyCounts: {easy: 2, medium: 0, hard: 0}}]});
  }
  const bank = n => ({id: "bank" + n, syllabusId: "english", topicId: "numbers", language: "English", difficulty: "easy", group: "assessment", hasDiagram: false,
    questionText: "Bank task " + n, options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", explanation: "Two"});
  for (let n = 0; n < 8; n++) await db.doc(poolReference("normal", bank(n))).set(bank(n));
  const overview = async () => api.getStudentSubjectAssessmentOverview({}, student);
  const start = requestId => api.startStudentSubjectAssessment({syllabusId: "english", requestId}, student);
  const generate = async launch => {
    const job = await repository.getJob(launch.generationId);
    return api.generateStudentSubjectAssessment(job.generationId, job.generationRequest);
  };
  let first, firstAssessment;
  await t.test("no default interval or unsubscribed/spoofed start can queue paid work", async () => {
    assert.equal((await overview()).subjects[0].canStart, false);
    await assert.rejects(start("missing-interval"), {code: "failed-precondition"});
    await assert.rejects(api.startStudentSubjectAssessment({syllabusId: "foreign", requestId: "x"}, student), {code: "permission-denied"});
    await assert.rejects(api.startStudentSubjectAssessment({syllabusId: "english", requestId: "x", studentId: "another"}, student), {code: "invalid-argument"});
    assert.equal((await db.collection("subjectAssessmentGenerations").get()).size, 0); assert.equal(paid, 0);
    await config.saveSubjectAssessmentSettings({intervalDays: 7, expectedVersion: 0});
    assert.ok((await overview()).subjects.every(subject => subject.canStart));
  });
  await t.test("parallel tabs with different request IDs reserve one generation", async () => {
    const launches = await Promise.all([start("tab-a"), start("tab-b")]);
    assert.equal(launches[0].generationId, launches[1].generationId); first = launches[0];
    assert.equal((await db.collection("subjectAssessmentGenerations").get()).size, 1);
    await assert.rejects(api.startStudentSubjectAssessment({syllabusId: "math", requestId: first.requestId}, student), {code: "already-exists"});
    const state = (await overview()).subjects.find(subject => subject.syllabusId === "english");
    assert.equal(state.generation.generationId, first.generationId); assert.equal(state.canStart, false);
    assert.equal(state.generation.configurationSnapshot, undefined); assert.equal(state.generation.leaseToken, undefined);
  });
  await t.test("worker reuses unseen bank content; repeated start resumes the same frozen assessment", async () => {
    firstAssessment = await generate(first); assert.equal(firstAssessment.items.length, 2); assert.equal(paid, 0);
    assert.equal(firstAssessment.studentId, "student"); assert.equal(firstAssessment.language, "English");
    assert.equal((await start("new-click")).assessmentId, firstAssessment.assessmentId);
    assert.equal((await start(first.requestId)).assessmentId, firstAssessment.assessmentId);
    const state = (await overview()).subjects.find(subject => subject.syllabusId === "english");
    assert.equal(state.activeAssessment.assessmentId, firstAssessment.assessmentId); assert.equal(state.generation, null);
  });
  await t.test("submission starts this subject's interval immediately, independently of marking/language", async () => {
    const concurrent = await Promise.allSettled([api.submitSubjectAssessment({assessmentId: firstAssessment.assessmentId, expectedRevision: 0,
      answers: firstAssessment.items.map(item => ({position: item.position, selectedOption: "b"}))}, student), start("racing-submit")]);
    assert.equal(concurrent[0].status, "fulfilled");
    if (concurrent[1].status === "fulfilled") assert.equal(concurrent[1].value.assessmentId, firstAssessment.assessmentId);
    else assert.equal(concurrent[1].reason.code, "failed-precondition");
    assert.equal((await db.collection("subjectAssessmentGenerations").get()).size, 1, "A concurrent submit/start cannot create another job");
    const states = (await overview()).subjects;
    const english = states.find(subject => subject.syllabusId === "english"), math = states.find(subject => subject.syllabusId === "math");
    assert.equal(english.canStart, false); assert.equal(english.reason, "cooldown"); assert.equal(english.latestSubmission.markingStatus, "pending");
    assert.equal(+new Date(english.nextAvailableAt), clock + 7 * 86400000); assert.equal(math.canStart, true);
    await assert.rejects(start("early"), {code: "failed-precondition"});
    scopes = [{syllabusId: "english", language: "Tamil"}, scopes[1]];
    await db.doc("syllabusSubscriptions/student/syllabuses/english").update({language: "Tamil"});
    await assert.rejects(start("language-change"), {code: "failed-precondition"});
    scopes = [{syllabusId: "english", language: "English"}, scopes[1]];
    await db.doc("syllabusSubscriptions/student/syllabuses/english").update({language: "English"});
    await api.markSubjectAssessmentSubmission(firstAssessment.assessmentId);
    assert.equal((await overview()).subjects[0].latestResult.score, 100);
  });
  await t.test("exact interval boundary permits another assessment with different content", async () => {
    clock += 7 * 86400000 - 1;
    await assert.rejects(start("one-ms-early"), {code: "failed-precondition"}); clock++;
    assert.equal((await overview()).subjects[0].canStart, true);
    const launch = await start("second"), second = await generate(launch);
    assert.notEqual(second.assessmentId, firstAssessment.assessmentId);
    const used = new Set(firstAssessment.items.map(item => item.sourceKey)); assert.ok(second.items.every(item => !used.has(item.sourceKey)));
    assert.equal((await start("second-duplicate")).assessmentId, second.assessmentId);
    await api.submitSubjectAssessment({assessmentId: second.assessmentId, expectedRevision: 0, answers: []}, student);
    assert.equal((await overview()).subjects[0].latestResult.assessmentId, firstAssessment.assessmentId, "The prior result stays visible while the next is marking");
  });
  await t.test("current global interval changes affect future availability", async () => {
    clock += 86400000;
    await config.saveSubjectAssessmentSettings({intervalDays: 1, expectedVersion: 1});
    assert.equal((await overview()).subjects[0].canStart, true);
    await config.saveSubjectAssessmentSettings({intervalDays: 7, expectedVersion: 2});
    assert.equal((await overview()).subjects[0].canStart, false);
  });
  await t.test("failed generation resumes one request; long preparation continues across invocations", async () => {
    fail = true;
    const math = await api.startStudentSubjectAssessment({syllabusId: "math", requestId: "math"}, student);
    await assert.rejects(generate(math), /Provider unavailable/);
    const failed = (await overview()).subjects.find(subject => subject.syllabusId === "math").generation;
    assert.equal(failed.canRetry, true); assert.doesNotMatch(failed.errorMessage, /sensitive/);
    fail = false; const retry = await api.startStudentSubjectAssessment({syllabusId: "math", requestId: failed.requestId}, student);
    assert.equal(retry.generationId, math.generationId);
    service.maxRunMs = -1;
    const partial = await generate(retry); assert.equal(partial.status, "queued");
    assert.equal((await repository.getJob(retry.generationId)).progress.prepared, 1);
    const ready = await generate(retry); assert.equal(ready.items.length, 2);
    service.maxRunMs = 60000;
  });
  await t.test("subject jobs share the student lease and expired workers cannot resume or write", async () => {
    const mathState = (await overview()).subjects.find(subject => subject.syllabusId === "math");
    await api.submitSubjectAssessment({assessmentId: mathState.activeAssessment.assessmentId, expectedRevision: 0, answers: []}, student);
    clock += 7 * 86400000;
    const english = await start("busy-english"), math = await api.startStudentSubjectAssessment({syllabusId: "math", requestId: "busy-math"}, student);
    const jobs = new Jobs({now: () => clock}), queued = await repository.getJob(english.generationId);
    const held = await jobs.claim({studentId: "student", syllabusId: "english", language: "English", requestId: english.generationId,
      generationRequest: queued.generationRequest}, queued.configurationSnapshot, {uid: "student"});
    const before = paid;
    await assert.rejects(generate(math), {code: "generation-in-progress"}); assert.equal(paid, before);
    assert.equal((await repository.getJob(math.generationId)).status, "queued");
    clock += 11 * 60000;
    assert.equal((await overview()).subjects[0].generation.canRetry, true);
    assert.equal((await start("busy-english")).generationId, english.generationId);
    assert.equal(await api.generateStudentSubjectAssessment(english.generationId, queued.generationRequest), null, "Delayed old events are ignored");
    await assert.rejects(jobs.saveCheckpoint(held, 1, {}, {}, {assertAccess() {}}), {code: "generation-lease-lost"});
    assert.equal((await generate(math)).items.length, 2);
    const completed = await generate(english); assert.equal(completed.items.length, 2);
    await api.submitSubjectAssessment({assessmentId: completed.assessmentId, expectedRevision: 0, answers: []}, student);
  });
  await t.test("worker rejects withdrawn subscriptions before touching model providers", async () => {
    clock += 7 * 86400000; const launch = await start("withdrawn"); const before = paid;
    subscribed = false; await assert.rejects(generate(launch), {code: "permission-denied"});
    assert.equal(paid, before); assert.equal((await repository.getJob(launch.generationId)).status, "failed"); subscribed = true;
  });
  await t.test("subject history filters preserve isolation and regular practice remains untouched", async () => {
    const english = await api.listStudentSubjectAssessments({syllabusId: "english"}, student);
    assert.ok(english.assessments.every(item => item.syllabusId === "english"));
    assert.equal((await api.listStudentSubjectAssessmentResults({syllabusId: "math"}, student)).results.length, 0);
    assert.equal((await api.listStudentSubjectAssessmentResults({syllabusId: "english"}, student)).results[0].score, 100);
    for (const collection of ["studentPractices", "studentDailyMissions", "studentAssessmentProgress", "rewards", "essayResults", "practiceResults", "reliability"]) assert.equal((await db.collection(collection).get()).size, 0, collection);
  });
});
