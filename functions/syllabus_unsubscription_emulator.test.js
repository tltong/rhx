const {test} = require("node:test"), assert = require("node:assert/strict");

test("syllabus unsubscription recursively cleans assessment history with durable recovery", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const {FirestoreSyllabusUnsubscriptionRepository: Cleanup} = require("./features/syllabus_subscription/infrastructure/firestore_syllabus_unsubscription_repository");
  const {FirestoreSubjectAssessmentSubmissionRepository: Submissions} = require("./features/subject_assessment/infrastructure/firestore_subject_assessment_submission_repository");
  const {FirestoreSubjectAssessmentGenerationRepository: Jobs} = require("./features/subject_assessment_generator/infrastructure/firestore_subject_assessment_generation_repository");
  const {FirestoreStudentSubjectAssessmentRepository: Students} = require("./features/subject_assessment/infrastructure/firestore_student_subject_assessment_repository");
  const {createSyllabusUnsubscriptionFeature} = require("./features/syllabus_subscription/syllabus_subscription_module");
  const {createUnsubscriptionAuthorizer} = require("./features/syllabus_subscription/infrastructure/syllabus_unsubscription_access");
  const {createUnsubscribeStudentSyllabusHandler} = require("./syllabus_subscription");
  const {subjectStateReference} = require("./features/subject_assessment/domain/student_subject_assessment");
  const stateRef = subjectStateReference(db, "student", "english");
  const repo = new Cleanup(), papers = new Submissions(), jobs = new Jobs(), students = new Students();
  const authorize = createUnsubscriptionAuthorizer({getDb: () => db,
    getUser: async uid => ({uid, email: uid + "@example.test", emailVerified: true}), isAdministrator: async email => email === "admin@example.test"});
  const feature = createSyllabusUnsubscriptionFeature({repository: repo, authorize});
  const handler = createUnsubscribeStudentSyllabusHandler({execute: feature.unsubscribeStudentSyllabus});
  const guardian = {auth: {uid: "guardian"}}, admin = {auth: {uid: "admin"}};
  const input = requestId => ({studentId: "student", syllabusId: "english", requestId});
  const exists = async path => (await db.doc(path).get()).exists;
  const scope = {studentId: "student", syllabusId: "english", language: "English"};
  const access = {uid: "student", assertAccess() {}};
  const assessment = {assessmentId: "old", ...scope, items: [{position: 1, questionType: "normal"}]};
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(reset.status, 200);
  await db.doc("guardians/guardian").set({}); await db.doc("guardianStudentLinks/guardian__student").set({state: "active"});
  await db.doc("syllabusSubscriptions/student").set({});
  for (const subject of ["english", "math"]) await db.doc("syllabusSubscriptions/student/syllabuses/" + subject).set({state: "active", language: "English"});
  await db.doc("subjectAssessments/old").set(scope);
  await db.doc("subjectAssessments/old/items/00000001").set({questionText: "Frozen"});
  await db.doc("subjectAssessments/old/private/00000001").set({correctAnswer: "b"});
  await db.doc("subjectAssessmentSubmissions/old").set({...scope, status: "submitted", markingStatus: "pending", markingRequest: 1, markedItemCount: 0});
  await db.doc("subjectAssessmentSubmissions/old/items/00000001").set({position: 1, selectedOption: "b"});
  await db.doc("subjectAssessmentSubmissions/old/private/marking").set({leaseToken: null});
  await db.doc("subjectAssessmentResults/completed").set({...scope, score: 80});
  await db.doc("subjectAssessmentResults/completed/items/00000001").set({score: 80});
  await db.doc("subjectAssessmentGenerations/old-job").set({...scope, assessmentId: "staged", status: "generating", leaseToken: "worker", entryPoint: "student", generationRequest: 1});
  await db.doc("subjectAssessmentGenerations/old-job/items/00000001").set({private: "draft"});
  await db.doc("subjectAssessments/staged/items/00000001").set({questionText: "Staged without parent"});
  await db.doc("subjectAssessments/staged/private/00000001").set({marking: "private"});
  await db.doc("subjectAssessmentGenerations/_locks/students/student").set({requestId: "old-job", leaseToken: "worker", leaseUntil: new Date(Date.now() + 600000)});
  await stateRef.set({...scope, activeGenerationId: "old-job", lastSubmittedAssessmentId: "old", lastSubmittedAt: new Date()});
  const preserved = {"subjectAssessments/math": {...scope, syllabusId: "math"},
    "subjectAssessments/another-student": {...scope, studentId: "another"},
    "subjectAssessmentSubmissions/math": {...scope, syllabusId: "math", status: "draft"},
    "studentSubjectAssessmentUsage/student/items/used": {...scope, assessmentId: "old", sourceKey: "used"},
    "subjectAssessmentConfigs/english/languages/english": {version: 2}, "subjectAssessmentSettings/config": {intervalDays: 30},
    "questions/shared": {questionText: "Shared bank"}, "studentPractices/student/practices/regular": {status: "assigned"}};
  for (const [path, data] of Object.entries(preserved)) await db.doc(path).set(data);
  let marking, cleanup;

  await t.test("authorization rejects students and unrelated guardians without deleting subscriptions", async () => {
    for (const uid of ["student", "unrelated"]) await assert.rejects(handler({auth: {uid}, data: input("denied")}), {code: "permission-denied"});
    assert.equal(await exists("syllabusSubscriptions/student/syllabuses/english"), true);
  });
  await t.test("begin atomically unsubscribes and fences start, answers, generation and marking", async () => {
    marking = await papers.claimMarking("old", 1);
    cleanup = await repo.begin(input("first"), await authorize("student", guardian));
    assert.equal(await exists("syllabusSubscriptions/student/syllabuses/english"), false);
    assert.equal(await exists("syllabusSubscriptions/student"), true);
    assert.equal((await stateRef.get()).data().cleanup.status, "pending");
    await assert.rejects(papers.save(assessment, {expectedRevision: 0, answers: []}, access), {code: "failed-precondition"});
    await assert.rejects(papers.retry("old", access), {code: "failed-precondition"});
    await assert.rejects(papers.renew(marking), {code: "failed-precondition"});
    await assert.rejects(papers.publishResult(marking, [], {}), {code: "failed-precondition"});
    await assert.rejects(jobs.saveCheckpoint({...scope, generationId: "old-job", leaseToken: "worker"}, 1, {}, {}, access), {code: "failed-precondition"});
    await assert.rejects(jobs.claim({...scope, requestId: "late"}, {language: "English", topics: []}, access), {code: "failed-precondition"});
    await assert.rejects(students.start("student", scope, "late", access), {code: "failed-precondition"});
    assert.deepEqual(await students.subscribedSubjects("student", [scope, {...scope, syllabusId: "math"}]), [{...scope, syllabusId: "math"}]);
  });
  await t.test("API retry deletes nested answers, keys, results and staged children while preserving other data", async () => {
    const result = await handler({...guardian, data: input("first")}); assert.equal(result.cleanupStatus, "completed");
    for (const path of ["subjectAssessments/old", "subjectAssessments/old/items/00000001", "subjectAssessments/old/private/00000001",
      "subjectAssessmentSubmissions/old", "subjectAssessmentSubmissions/old/items/00000001", "subjectAssessmentSubmissions/old/private/marking",
      "subjectAssessmentResults/completed", "subjectAssessmentResults/completed/items/00000001", "subjectAssessmentGenerations/old-job",
      "subjectAssessmentGenerations/old-job/items/00000001", "subjectAssessments/staged/items/00000001", "subjectAssessments/staged/private/00000001",
      "subjectAssessmentGenerations/_locks/students/student"]) assert.equal(await exists(path), false, path);
    for (const [path, data] of Object.entries(preserved)) assert.deepEqual((await db.doc(path).get()).data(), data, path);
    const state = (await stateRef.get()).data(); assert.equal(state.cleanup.status, "completed");
    assert.equal(state.lastSubmittedAt, null); assert.equal(state.lastSubmittedAssessmentId, null); assert.equal(state.activeGenerationId, null);
  });
  await t.test("old workers and saved sessions cannot recreate deleted records after cleanup", async () => {
    await assert.rejects(papers.save(assessment, {expectedRevision: 0, answers: []}, access), {code: "not-found"});
    await assert.rejects(papers.publishResult(marking, [], {}), {code: "marking-lease-lost"});
    await assert.rejects(jobs.saveCheckpoint({...scope, generationId: "old-job", leaseToken: "worker"}, 1, {}, {}, access), {code: "generation-lease-lost"});
    await assert.rejects(students.start("student", scope, "after-cleanup", access), {code: "permission-denied"});
    assert.equal(await exists("subjectAssessmentResults/old"), false);
  });
  await t.test("a lost-response retry preserves a new subscription; a new request cleans its new assessments", async () => {
    await db.doc("syllabusSubscriptions/student/syllabuses/english").set({state: "active", language: "Chinese"});
    await db.doc("subjectAssessments/new").set({...scope, language: "Chinese"});
    assert.equal((await handler({...guardian, data: input("first")})).cleanupStatus, "completed");
    assert.equal(await exists("subjectAssessments/new"), true);
    assert.equal(await exists("syllabusSubscriptions/student/syllabuses/english"), true);
    const next = await repo.begin(input("second"), await authorize("student", admin));
    assert.notEqual(next.cleanupId, cleanup.cleanupId);
    assert.equal((await stateRef.get()).data().cleanup.planReady, false);
    assert.equal((await repo.clean(cleanup)).cleanupStatus, "completed", "An old event cannot clean a later subscription");
    assert.equal(await exists("subjectAssessments/new"), true);
    assert.equal((await repo.clean(next)).cleanupStatus, "completed"); assert.equal(await exists("subjectAssessments/new"), false);
  });
  await t.test("an interrupted cleanup resumes its manifest even after its generation pointer is deleted", async () => {
    await db.doc("syllabusSubscriptions/student/syllabuses/english").set({state: "active", language: "English"});
    await db.doc("subjectAssessmentGenerations/recovery").set({...scope, assessmentId: "orphan"});
    await db.doc("subjectAssessments/orphan/private/00000001").set({key: "staged"});
    await db.doc("subjectAssessmentGenerations/math-job").set({...scope, syllabusId: "math", assessmentId: "math-staged"});
    await db.doc("subjectAssessmentGenerations/_locks/students/student").set({requestId: "math-job", leaseToken: "other-subject"});
    const recovering = await repo.begin(input("recovery"), await authorize("student", guardian));
    let fail = true;
    const proxy = new Proxy(db, {get(target, key) {
      if (key === "recursiveDelete") return async ref => {if (fail && ref.path === "subjectAssessments/orphan") {fail = false; throw new Error("Interrupted");} return target.recursiveDelete(ref);};
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    }});
    await assert.rejects(new Cleanup({getDb: () => proxy}).clean(recovering), /Interrupted/);
    assert.equal(await exists("subjectAssessmentGenerations/recovery"), false); assert.equal(await exists("subjectAssessments/orphan/private/00000001"), true);
    assert.equal((await stateRef.get()).data().cleanup.status, "pending");
    assert.equal((await repo.clean(recovering)).cleanupStatus, "completed");
    assert.equal(await exists("subjectAssessments/orphan/private/00000001"), false);
    assert.equal((await db.doc("subjectAssessmentGenerations/_locks/students/student").get()).data().leaseToken, "other-subject");
    assert.equal(await exists("subjectAssessmentGenerations/math-job"), true);
    assert.equal((await stateRef.collection("cleanupItems").get()).empty, true, "Completed cleanup removes its temporary deletion manifest");
  });
  await t.test("parallel requests join one cleanup and an expired lease can be recovered", async () => {
    await db.doc("syllabusSubscriptions/student/syllabuses/english").set({state: "active", language: "English"});
    const actor = await authorize("student", guardian);
    const requests = await Promise.all([repo.begin(input("tab-a"), actor), repo.begin(input("tab-b"), actor)]);
    assert.equal(requests[0].cleanupId, requests[1].cleanupId);
    const current = (await stateRef.get()).data().cleanup;
    await stateRef.update({cleanup: {...current, status: "running", leaseToken: "dead-worker", leaseUntil: new Date(Date.now() + 60000)}});
    assert.equal((await repo.clean(requests[0])).cleanupStatus, "pending");
    await stateRef.update({"cleanup.leaseUntil": new Date(0)});
    assert.equal((await repo.clean(requests[1])).cleanupStatus, "completed");
  });
  await t.test("deactivation retains history; removing the last subject deletes only the empty subscription parent", async () => {
    await db.doc("syllabusSubscriptions/student/syllabuses/math").update({state: "inactive"});
    assert.equal(await exists("subjectAssessments/math"), true);
    assert.deepEqual(await students.subscribedSubjects("student", [{...scope, syllabusId: "math"}]), []);
    await handler({...admin, data: {studentId: "student", syllabusId: "math", requestId: "last"}});
    assert.equal(await exists("syllabusSubscriptions/student"), false); assert.equal(await exists("subjectAssessments/math"), false);
    assert.equal(await exists("subjectAssessments/another-student"), true);
  });
});
