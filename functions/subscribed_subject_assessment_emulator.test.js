const {test} = require("node:test"), assert = require("node:assert/strict");

test("new subscriptions automatically prepare one assessment through the existing queue", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const {StudentSubjectAssessmentService} = require("./features/subject_assessment/application/student_subject_assessment_service");
  const {FirestoreStudentSubjectAssessmentRepository: Students} = require("./features/subject_assessment/infrastructure/firestore_student_subject_assessment_repository");
  const {FirestoreSubjectAssessmentGenerationRepository: Jobs} = require("./features/subject_assessment_generator/infrastructure/firestore_subject_assessment_generation_repository");
  const {FirestoreSubjectAssessmentSubmissionRepository: Submissions} = require("./features/subject_assessment/infrastructure/firestore_subject_assessment_submission_repository");
  const {FirestoreSyllabusUnsubscriptionRepository: Cleanup} = require("./features/syllabus_subscription/infrastructure/firestore_syllabus_unsubscription_repository");
  const {createSubjectAssessmentFeature} = require("./features/subject_assessment/subject_assessment_module");
  const {createSubjectAssessmentGenerator} = require("./features/subject_assessment_generator/subject_assessment_generator_module");
  const {SubjectAssessmentContentPool} = require("./features/subject_assessment_generator/infrastructure/subject_assessment_content_pool");
  const {poolReference} = require("./features/subject_assessment/domain/subject_assessment");
  const {SCORING_POLICY} = require("./features/subject_assessment/domain/subject_assessment_submission");
  const {subscriptionKey} = require("./features/subject_assessment/domain/student_subject_assessment");
  const {processSubscribedSubjectAssessment: subscriptionEvent} = require("./triggers/subscribed_subject_assessment_trigger");
  const {processStudentSubjectAssessmentGeneration: generationEvent} = require("./triggers/student_subject_assessment_generation_trigger");
  let clock = Date.parse("2026-11-08T08:00:00Z"), paid = 0, fail = false;
  const student = {auth: {uid: "student"}}, scope = {syllabusId: "chinese", language: "English"};
  const authorize = async ({studentId}, context) => {assert.equal(studentId, context.auth.uid); return {uid: studentId, canSubmit: true, assertAccess() {}};};
  const repository = new Students({now: () => clock}), jobs = new Jobs({now: () => clock});
  const deps = {getDb: () => db, random: () => 0, llmProfiles: {STANDARD_PRO: {}},
    getDefaultPrompt: async () => ({id: "default"}), getDiagramPercentage: async () => 0, generatePrompt: async () => "Generate a task",
    generateText: async () => {paid++; if (fail) throw new Error("Provider unavailable"); return {questions: [{questionText: "New task " + paid,
      options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", answerExplanation: "Two", topicName: "Numbers", hasDiagram: false}]};},
    writeQuestion: require("./features/question/question_module").writeQuestion};
  const service = new StudentSubjectAssessmentService({repository, authorize,
    listSubjects: async () => [scope, {syllabusId: "math", language: "English"}],
    createGenerator: options => createSubjectAssessmentGenerator({...options, jobs, random: () => 0,
      createPool: run => new SubjectAssessmentContentPool(run, deps)})});
  const api = createSubjectAssessmentFeature({authorize, studentService: service, submissions: new Submissions({now: () => clock}),
    loadSettings: async () => ({policy: SCORING_POLICY, essay: {}, fill: {}})});
  const subscriptionRef = db.doc("syllabusSubscriptions/student/syllabuses/chinese");
  const prepare = data => api.prepareSubscribedSubjectAssessment(data);
  const event = (data, type = "google.cloud.firestore.document.v1.created") => ({type, params: {studentId: "student", syllabusId: data.id}, data});
  const prepareEvent = data => subscriptionEvent(event(data), {prepare});
  const generate = async launch => {
    const job = await repository.getJob(launch.generationId);
    return generationEvent({params: {generationId: job.generationId}, data: {before: {data: () => undefined}, after: {data: () => job}}},
      {generate: api.generateStudentSubjectAssessment, getJob: id => repository.getJob(id)});
  };
  const countJobs = async () => (await db.collection("subjectAssessmentGenerations").get()).size;
  const cleanup = new Cleanup({now: () => clock});
  const unsubscribe = async requestId => cleanup.clean(await cleanup.begin({studentId: "student", syllabusId: "chinese", requestId}, {uid: "admin", administrator: true}));
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(reset.status, 200);
  await db.doc("students/student").set({name: "Student"});
  await db.doc("assessmentFrameworks/normal").set({frameworkType: "normal"});
  for (const id of ["chinese", "math"]) {
    await db.doc("syllabuses/" + id).set({country: "MY", level: "primary", year: 4, subject: id, active: true, languages: ["Chinese", "English"]});
    await db.doc(`syllabuses/${id}/topics/numbers`).set({topicName: "Numbers", assessmentFrameworkIds: {chinese: "normal", english: "normal"}});
  }
  const config = require("./features/subject_assessment_config/subject_assessment_config_module").createSubjectAssessmentConfigFeature({authorize: async () => ({uid: "admin"})});
  await config.saveSubjectAssessmentConfig({syllabusId: "chinese", language: "Chinese", expectedVersion: 0,
    topics: [{topicId: "numbers", totalCount: 1, difficultyCounts: {easy: 1, medium: 0, hard: 0}}]});
  const bankPaths = [];
  for (let n = 0; n < 4; n++) {
    const bank = {id: "bank" + n, syllabusId: "chinese", topicId: "numbers", language: "Chinese", difficulty: "easy", hasDiagram: false, group: "assessment",
      questionText: "Bank task " + n, options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", explanation: "Two"};
    const path = poolReference("normal", bank); bankPaths.push(path); await db.doc(path).set(bank);
  }
  await subscriptionRef.set({state: "active", language: "Chinese"});
  const firstSubscription = await subscriptionRef.get();
  await db.doc("studentPractices/student/practices/regular").set({status: "assigned"});
  let first, firstAssessment, next;

  await t.test("an unset interval or missing/invalid configuration leaves subscription successful", async () => {
    assert.deepEqual(await prepareEvent(firstSubscription), {status: "skipped", reason: "intervalNotConfigured"});
    await config.saveSubjectAssessmentSettings({intervalDays: 30, expectedVersion: 0});
    const math = db.doc("syllabusSubscriptions/student/syllabuses/math"); await math.set({state: "active", language: "English"});
    assert.deepEqual(await prepareEvent(await math.get()), {status: "skipped", reason: "subjectNotConfigured"});
    const configuration = db.doc("subjectAssessmentConfigs/chinese/languages/chinese"), original = (await configuration.get()).data();
    await configuration.update({topics: []});
    assert.deepEqual(await prepareEvent(firstSubscription), {status: "skipped", reason: "subjectNotConfigured"});
    await configuration.set(original);
    assert.equal((await subscriptionRef.get()).data().state, "active"); assert.equal((await math.get()).data().state, "active");
    assert.equal(await countJobs(), 0); assert.equal(paid, 0);
    assert.equal((await api.getStudentSubjectAssessmentOverview({}, student)).subjects.find(subject => subject.syllabusId === "math").reason, "subjectNotConfigured");
    await config.saveSubjectAssessmentSettings({repeatMode: "none", intervalDays: null, expectedVersion: 1});
  });
  await t.test("subscription events and student clicks share one queued assessment in the actual subscription language", async () => {
    first = await prepareEvent(firstSubscription);
    const launches = await Promise.all([prepareEvent(firstSubscription), prepareEvent(firstSubscription), api.startStudentSubjectAssessment({syllabusId: "chinese", requestId: "clicked"}, student)]);
    assert.ok(launches.every(launch => launch.generationId === first.generationId)); assert.equal(await countJobs(), 1);
    const job = await repository.getJob(first.generationId);
    assert.equal(job.origin, "subscription"); assert.equal(job.language, "Chinese"); assert.equal(job.subscriptionKey, subscriptionKey(firstSubscription));
    assert.equal(job.entryPoint, "student"); assert.equal(job.generationRequest, 1); assert.equal(paid, 0);
  });
  await t.test("the existing worker publishes the assessment automatically without starting its interval", async () => {
    firstAssessment = await generate(first); assert.equal(firstAssessment.language, "Chinese"); assert.equal(paid, 0);
    const job = await repository.getJob(first.generationId);
    assert.equal(job.status, "completed"); assert.equal(job.origin, "subscription"); assert.equal(job.subscriptionKey, subscriptionKey(firstSubscription));
    const state = (await api.getStudentSubjectAssessmentOverview({}, student)).subjects.find(subject => subject.syllabusId === "chinese");
    assert.equal(state.activeAssessment.assessmentId, firstAssessment.assessmentId); assert.equal(state.lastSubmittedAt, null); assert.equal(state.nextAvailableAt, null);
    assert.equal((await db.collection("subjectAssessmentSubmissions").get()).empty, true);
  });
  await t.test("automatic assessments use existing marking and begin cooldown only at submission", async () => {
    assert.equal((await api.getStudentSubjectAssessmentOverview({}, student)).repeatMode, "none", "The initial assessment was prepared under no-repeat settings");
    await config.saveSubjectAssessmentSettings({repeatMode: "interval", intervalDays: 30, expectedVersion: 2});
    clock += 86400000;
    await api.submitSubjectAssessment({assessmentId: firstAssessment.assessmentId, expectedRevision: 0, answers: [{position: 1, selectedOption: "b"}]}, student);
    await api.markSubjectAssessmentSubmission(firstAssessment.assessmentId);
    const state = (await api.getStudentSubjectAssessmentOverview({}, student)).subjects.find(subject => subject.syllabusId === "chinese");
    assert.equal(state.latestResult.score, 100); assert.equal(+new Date(state.nextAvailableAt), clock + 30 * 86400000);
    clock += 31 * 86400000;
    await prepareEvent(firstSubscription); assert.equal(await countJobs(), 1, "A late create event cannot generate a repeat assessment after cooldown");
  });
  await t.test("deactivation and reactivation preserve the assessment and result without queuing another", async () => {
    const saved = (await db.doc("subjectAssessmentResults/" + firstAssessment.assessmentId).get()).data();
    await subscriptionRef.update({state: "inactive"});
    assert.equal(await subscriptionEvent(event(await subscriptionRef.get(), "google.cloud.firestore.document.v1.updated"), {prepare}), null);
    await subscriptionRef.update({state: "active"});
    assert.equal(await subscriptionEvent(event(await subscriptionRef.get(), "google.cloud.firestore.document.v1.updated"), {prepare}), null);
    assert.equal(subscriptionKey(await subscriptionRef.get()), subscriptionKey(firstSubscription));
    assert.deepEqual((await db.doc("subjectAssessmentResults/" + firstAssessment.assessmentId).get()).data(), saved);
    assert.equal(await countJobs(), 1);
  });
  await t.test("unsubscribe/resubscribe prepares a fresh assessment and ignores the previous subscription's delayed events", async () => {
    assert.equal((await unsubscribe("first-unsubscribe")).cleanupStatus, "completed");
    assert.equal(await countJobs(), 0);
    await subscriptionRef.set({state: "active", language: "Chinese"}); const current = await subscriptionRef.get();
    assert.notEqual(subscriptionKey(current), subscriptionKey(firstSubscription));
    assert.deepEqual(await prepareEvent(firstSubscription), {status: "skipped", reason: "subscriptionUnavailable"});
    const launches = await Promise.all([prepareEvent(current), api.startStudentSubjectAssessment({syllabusId: "chinese", requestId: "resubscribe-click"}, student)]);
    next = launches[0]; assert.equal(launches[1].generationId, next.generationId); assert.notEqual(next.generationId, first.generationId);
    assert.equal(await countJobs(), 1); assert.equal((await repository.getJob(next.generationId)).subscriptionKey, subscriptionKey(current));
    assert.equal((await db.doc("subjectAssessmentResults/" + firstAssessment.assessmentId).get()).exists, false);
    assert.equal((await db.collection("studentSubjectAssessmentUsage").doc("student").collection("items").get()).size, 1);
  });
  await t.test("provider failures retain one retryable attempt; duplicate subscription events do not requeue failed work", async () => {
    for (const path of bankPaths) await db.doc(path).delete();
    fail = true; await generate(next);
    const failed = await repository.getJob(next.generationId); assert.equal(failed.status, "failed"); assert.equal(paid, 1);
    const retryCount = failed.generationRequest;
    await prepareEvent(await subscriptionRef.get());
    assert.equal((await repository.getJob(next.generationId)).generationRequest, retryCount); assert.equal(paid, 1);
    fail = false;
    const retry = await api.startStudentSubjectAssessment({syllabusId: "chinese", requestId: "retry"}, student);
    assert.equal(retry.generationId, next.generationId);
    const assessment = await generate(retry); assert.notEqual(assessment.assessmentId, firstAssessment.assessmentId); assert.equal(paid, 2);
  });
  await t.test("no repeat blocks fresh starts across languages after submission and can be changed back to an interval", async () => {
    await config.saveSubjectAssessmentSettings({repeatMode: "none", intervalDays: null, expectedVersion: 3});
    const {assessmentId} = await repository.getJob(next.generationId);
    await api.submitSubjectAssessment({assessmentId, expectedRevision: 0, answers: [{position: 1, selectedOption: "b"}]}, student);
    let overview = await api.getStudentSubjectAssessmentOverview({}, student);
    assert.equal(overview.repeatMode, "none"); assert.equal(overview.intervalDays, null);
    assert.equal(overview.subjects.find(subject => subject.syllabusId === "chinese").reason, "noRepeat");
    const before = await countJobs();
    for (const requestId of ["forbidden-repeat", "another-tab"]) await assert.rejects(api.startStudentSubjectAssessment({syllabusId: "chinese", requestId}, student), error => error.code === "failed-precondition" && /Repeat assessments are disabled/.test(error.message));
    await api.markSubjectAssessmentSubmission(assessmentId);
    clock += 400 * 86400000;
    await config.saveSubjectAssessmentConfig({syllabusId: "chinese", language: "English", expectedVersion: 0,
      topics: [{topicId: "numbers", totalCount: 1, difficultyCounts: {easy: 1, medium: 0, hard: 0}}]});
    await subscriptionRef.update({language: "English"});
    await assert.rejects(api.startStudentSubjectAssessment({syllabusId: "chinese", requestId: "different-language"}, student), error => error.code === "failed-precondition" && /Repeat assessments are disabled/.test(error.message));
    await subscriptionRef.update({language: "Chinese"});
    assert.equal(await countJobs(), before);
    overview = await api.getStudentSubjectAssessmentOverview({}, student);
    assert.equal(overview.subjects.find(subject => subject.syllabusId === "chinese").reason, "noRepeat");
    assert.equal(overview.subjects.find(subject => subject.syllabusId === "chinese").latestResult.score, 100);
    await config.saveSubjectAssessmentConfig({syllabusId: "math", language: "English", expectedVersion: 0,
      topics: [{topicId: "numbers", totalCount: 1, difficultyCounts: {easy: 1, medium: 0, hard: 0}}]});
    const other = await api.startStudentSubjectAssessment({syllabusId: "math", requestId: "math-initial"}, student);
    assert.equal(other.status, "generating", "No repeat permits a separate initial assessment for each subject");
    await config.saveSubjectAssessmentSettings({repeatMode: "interval", intervalDays: 7, expectedVersion: 4});
    assert.equal((await api.getStudentSubjectAssessmentOverview({}, student)).subjects.find(subject => subject.syllabusId === "chinese").canStart, true);
    await config.saveSubjectAssessmentSettings({repeatMode: "none", intervalDays: null, expectedVersion: 5});
  });
  await t.test("a worker from a replaced subscription cannot call providers or publish", async () => {
    await unsubscribe("second-unsubscribe"); await subscriptionRef.set({state: "active", language: "Chinese"});
    const launch = await prepareEvent(await subscriptionRef.get()), job = await repository.getJob(launch.generationId), before = paid;
    await subscriptionRef.delete(); await subscriptionRef.set({state: "active", language: "Chinese"});
    await generate(launch); assert.equal(paid, before);
    await assert.rejects(jobs.claim({...job, requestId: job.generationId}, job.configurationSnapshot, {uid: "student"}), {code: "generation-request-superseded"});
    assert.equal((await db.doc("subjectAssessments/" + job.assessmentId).get()).exists, false);
    await unsubscribe("stale-worker-cleanup"); await subscriptionRef.set({state: "active", language: "Chinese"});
    const freshLaunch = await prepareEvent(await subscriptionRef.get()), freshJob = await repository.getJob(freshLaunch.generationId);
    const claimed = await jobs.claim({...freshJob, requestId: freshJob.generationId}, freshJob.configurationSnapshot, {uid: "student"});
    await subscriptionRef.delete(); await subscriptionRef.set({state: "active", language: "Chinese"});
    await assert.rejects(jobs.saveCheckpoint(claimed, 1, {draft: "late content"}, {prepared: 1, total: 1}, {uid: "student"}), {code: "generation-request-superseded"});
    assert.equal((await db.doc(`subjectAssessmentGenerations/${claimed.generationId}/items/00000001`).get()).exists, false);
    assert.deepEqual((await db.doc("studentPractices/student/practices/regular").get()).data(), {status: "assigned"});
  });
});
