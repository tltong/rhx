const assert = require("node:assert/strict");
const {test} = require("node:test");
const {BuildResetPlan} = require("./application/build_reset_plan");
const {ResetStudentTopicPractices} = require("./application/reset_student_topic_practices");
const {FirestoreTopicResetRepository} = require("./infrastructure/firestore_topic_reset_repository");
const {CalculateSubjectReadinessScore} = require("../readiness/application/calculate_subject_readiness_score");
const {CalculateSubjectReliabilityScore} = require("../reliability/application/calculate_subject_reliability_score");
const {topicKey, resetScope} = require("./domain/reset_scope");
const {fakeFirestore, deferred} = require("./test_support");
const {withTopicResetGuard, guardResetTransaction, guardStudentMaintenance} = require("../../utils/student_topic_reset_guard");
const {FirestoreStudentPracticeRepository} = require("../student_practice/infrastructure/firestore_student_practice_repository");
const {FirestoreStudentEssayPracticeRepository} = require("../student_essay_practice/infrastructure/firestore_student_essay_practice_repository");
const {FirestoreReadinessScoreRepository} = require("../readiness/infrastructure/firestore_readiness_score_repository");
const {FirestoreReliabilityScoreRepository} = require("../reliability/infrastructure/firestore_reliability_score_repository");
const {FirestoreEssayResultRepository} = require("../essay_scoring/infrastructure/firestore_essay_result_repository");
const {FirestorePracticeCompletionProcessingRepository} = require("../student_practice/infrastructure/firestore_practice_completion_processing_repository");
const {FirestoreDailyMissionRepository} = require("../daily_mission/infrastructure/firestore_daily_mission_repository");

const scope = {studentId: "s", syllabusId: "language", topicId: "writing"};
const other = {...scope, topicId: "reading"}, actor = {updatedBy: "admin"};
const rootPath = "studentPracticeResets/s", jobPath = rootPath + "/requests/reset-1";
const normal = kind => `studentPractices/s/${kind}`;
const essays = kind => `studentEssayPractices/s/${kind}EssayPractices`;
const topicPath = collection => `${collection}/s/syllabuses/language/topics/writing`;
const now = Date.parse("2026-10-18T12:00:00Z");

function harness(extra = {}) {
  const data = {
    [normal("assignedPractices") + "/a"]: {},
    [normal("completedPractices") + "/p"]: {studentAnswers: ["a"]},
    [normal("completionProcessing") + "/p"]: {status: "processing"},
    [normal("assignedPractices") + "/keep"]: {},
    [normal("completedPractices") + "/keep"]: {studentAnswers: ["b"]},
    "practiceResults/p": {},
    "practiceResults/p/studentSubmissions/s": {score: 100, answers: {q: "a"}},
    "practiceResults/p/studentSubmissions/other": {score: 90},
    "practiceResults/keep/studentSubmissions/s": {score: 80},
    [essays("assigned") + "/e-next"]: {...scope, essayQuestionId: "q-next"},
    [essays("completed") + "/e"]: {...scope, essayQuestionId: "q", essayText: "My work", completedAt: new Date(now - 1000)},
    [essays("completed") + "/e-shared"]: {...scope, essayQuestionId: "q-shared"},
    [essays("completed") + "/e-keep"]: {...other, essayQuestionId: "q-shared"},
    "studentEssayPractices/s/questionUsage/q": {...scope, essayPracticeId: "e"},
    "studentEssayPractices/s/questionUsage/q-next": {...scope, essayPracticeId: "e-next"},
    "studentEssayPractices/s/questionUsage/q-shared": {...scope, essayPracticeId: "e-shared"},
    "studentEssayPractices/s/questionUsage/keep": {...other, essayPracticeId: "e-keep"},
    "essayResults/s/questions/q": {score: 90, answer: "My work"},
    "essayResults/s/questions/q/corrections/one": {text: "Fix"},
    "essayResults/s/questions/q-shared": {score: 65},
    "studentEssayPracticeGenerations/s/completions/e": {nextEssayPracticeId: "e-next"},
    "studentEssayPracticeGenerations/s/completions/deleted-source": {nextEssayPracticeId: "e-next"},
    "studentEssayPracticeGenerations/s/completions/e-keep": {nextEssayPracticeId: "e-other"},
    "studentAssessmentProgress/s/practiceAssessments/p": scope,
    [topicPath("studentAssessmentProgress")]: {currentLevel: 4},
    [topicPath("studentAssessmentProgress") + "/history/progress"]: {level: 3},
    [topicPath("studentReadiness")]: {score: 100},
    [topicPath("studentReadiness") + "/history/score"]: {score: 100},
    "studentReadiness/s/syllabuses/language": {score: 80},
    "studentReadiness/s/syllabuses/language/topics/reading": {score: 60},
    "studentReadiness/s/syllabuses/language/history/normal": {practiceId: "p", score: 90},
    "studentReadiness/s/syllabuses/language/history/essay": {practiceId: "e", practiceType: "essay", score: 95},
    "studentReadiness/s/syllabuses/language/history/keep": {practiceId: "keep", score: 80},
    [topicPath("reliability")]: {score: 70},
    "reliability/s/syllabuses/language": {score: 55},
    "reliability/s/syllabuses/language/topics/reading": {score: 40},
    "studentDailyMissions/s/acceptedDailyMissionPractices/p": scope,
    "studentDailyMissions/s/acceptedDailyMissionEssays/e": scope,
    "studentDailyMissions/s/acceptedAdditionalMissionEssays/e-next": {...scope, practiceType: "essay"},
    "studentDailyMissions/s/acceptedAdditionalMissionPractices/a": scope,
    "studentDailyMissions/s/acceptedDailyMissionPractices/keep": other,
    "studentDailyMissions/s/days/2026-10-18/syllabuses/language": {coreMission: {topicId: "writing", practiceId: "p"}, anotherField: "retain"},
    "studentDailyMissions/s/days/2026-10-18/syllabuses/language/coreTopics/writing/practices/p": {},
    "studentDailyMissions/s/days/2026-10-18/syllabuses/language/additionalTopics/writing/essays/e-next": {practiceType: "essay"},
    "studentDailyMissions/s/days/2026-10-18/syllabuses/language/additionalTopics/reading/practices/keep": {},
    "studentDailyMissions/s/pausedTopics/language/topics/writing": {paused: true},
    "studentDailyMissions/s/missionStats/language/topics/writing": {count: 4},
    "practices/p": {generated: true}, "questions/q": {}, "essayPractices/essay": {}, "essayQuestionGenerator/q": {},
    "rewards/s": {coins: 200}, "studentLogins/s/history/2026-10-18": {},
    "studentPractices/other/completedPractices/p": {score: 80},
    "syllabusSubscriptions/s": {syllabusIds: ["language"]},
    ...extra,
  };
  const store = fakeFirestore(data), syllabus = {subject: "Language", topics: [{id: "writing", topicName: "Writing"}, {id: "reading", topicName: "Reading"}]};
  const definitions = new Map([["p", {questions: [scope]}], ["a", {questions: [scope]}], ["keep", {questions: [other]}]]);
  let clock = now, authorized = true;
  const planner = new BuildResetPlan({getFirestoreDb: () => store.db, getStudentById: async id => id === "s" ? {name: "Student"} : null,
    getSyllabusById: async id => id === "language" ? syllabus : null, getPracticeById: async id => definitions.get(id) ?? null});
  const repository = new FirestoreTopicResetRepository({getFirestoreDb: () => store.db, now: () => clock, serverTimestamp: () => new Date(clock)});
  const record = collection => async input => store.documents.get(`${collection}/s/syllabuses/language/topics/${input.topicId}`) ?? null;
  const readiness = new CalculateSubjectReadinessScore({getSyllabusById: async () => syllabus, getReadinessScore: record("studentReadiness")});
  const reliability = new CalculateSubjectReliabilityScore({getSyllabusById: async () => syllabus, getTopicReliabilityScore: record("reliability")});
  const feature = new ResetStudentTopicPractices({planner, repository, requireAdministrator: async context => {
    if (!authorized || context?.updatedBy !== "admin") throw Object.assign(new Error("Admin only"), {code: "permission-denied"}); return {uid: "admin"};
  }, calculateSubjectReadinessScore: input => readiness.execute(input), calculateSubjectReliabilityScore: input => reliability.execute(input)});
  return {...store, planner, repository, definitions, feature, syllabus, advance: ms => {clock += ms;}, deny: () => {authorized = false;},
    run: (resetId = "reset-1") => feature.request({...scope, resetId}, actor)};
}

test("preview is read-only, includes missing-parent descendants, and protects other-topic essay results", async () => {
  const h = harness(), before = structuredClone(h.documents);
  const preview = await h.feature.preview(scope, actor);
  assert.deepEqual(h.documents, before); assert.equal(preview.operations, undefined);
  assert.equal(preview.counts.essayQuestionUsage, 2);
  assert.equal(preview.protectedEssayResults, 1); assert.equal(preview.counts.essayResults, 2);
  assert.equal(preview.counts.missionRecords, 9); assert.equal(preview.counts.subjectReadinessHistory, 2);
  assert.equal(preview.counts.topicProgression, 2); assert.equal(preview.counts.assignedEssays, 1);
});

test("reset removes target student work, retains shared content/coins/other topics and recomputes subjects", async () => {
  const h = harness(), plan = await h.planner.execute(scope), before = structuredClone(h.documents);
  const result = await h.run();
  assert.equal(result.status, "completed"); assert.equal(result.stage, "completed");
  assert.equal(result.subjectReadiness, 60); assert.equal(result.subjectReliability, 20);
  assert.equal(result.leaseToken, undefined); assert.deepEqual(result.deletedCounts, plan.counts);
  for (const operation of plan.operations) {
    if (operation.kind === "clearCoreMission") assert.deepEqual(h.documents.get(operation.path), {anotherField: "retain"});
    else assert.equal(h.documents.has(operation.path), false, operation.path);
  }
  const affected = new Set(plan.operations.map(op => op.path));
  affected.add("studentReadiness/s/syllabuses/language"); affected.add("reliability/s/syllabuses/language");
  for (const [path, data] of before) if (!affected.has(path)) assert.deepEqual(h.documents.get(path), data, path);
  assert.equal(h.documents.get(rootPath).activeResetId, null);
  assert.equal(h.documents.get(rootPath).topics[topicKey(scope)].revision, 1);
  assert.equal(h.documents.get("studentReadiness/s/syllabuses/language/history/topic-reset-reset-1").score, 60);
  const completedState = structuredClone(h.documents);
  assert.deepEqual(await h.run(), result); assert.deepEqual(h.documents, completedState, "same reset ID is idempotent");
  assert.equal([...h.documents.keys()].filter(key => key.startsWith(essays("assigned") + "/")).length, 0);
});

test("reset clears the last question usage reference even when its first assignment belonged to another topic", async () => {
  const h = harness();
  await h.run();
  assert.equal(h.documents.has("studentEssayPractices/s/questionUsage/q-shared"), true);
  const plan = await h.planner.execute(other);
  assert.ok(plan.operations.some(operation => operation.path === "studentEssayPractices/s/questionUsage/q-shared"));
});

test("partial batch failure retains the lock and resumes the saved plan after completions disappear", async () => {
  const extra = Object.fromEntries(Array.from({length: 320}, (_, n) => [topicPath("studentReadiness") + "/history/" + n, {score: n}]));
  const h = harness(extra), plan = await h.planner.execute(scope); let deletedBatches = 0;
  h.controls.beforeCommit = writes => {
    if (writes.some(write => write.delete) && ++deletedBatches === 2) throw new Error("Injected batch failure");
  };
  await assert.rejects(h.run(), /Injected batch failure/);
  assert.equal(h.documents.get(jobPath).status, "failed"); assert.equal(h.documents.get(rootPath).activeResetId, "reset-1");
  assert.equal(Object.values(h.documents.get(jobPath).deletedCounts).reduce((sum, n) => sum + n, 0), 150);
  assert.equal(h.documents.has(normal("completedPractices") + "/p"), false);
  await assert.rejects(h.run("reset-2"), {code: "reset-in-progress"});
  h.controls.beforeCommit = null;
  const result = await h.run(); assert.equal(result.status, "completed");
  assert.deepEqual(result.deletedCounts, plan.counts); assert.equal(h.documents.get(rootPath).topics[topicKey(scope)].revision, 1);
});

test("leases prevent parallel owners and stale owners cannot delete, fail or finish a resumed reset", async () => {
  const h = harness(), input = {...scope, resetId: "reset-1"};
  const first = await h.repository.claim(input, "admin");
  await assert.rejects(h.repository.claim(input, "admin"), {code: "reset-in-progress"});
  h.advance(600001); const current = await h.repository.claim(input, "admin");
  assert.notEqual(first.leaseToken, current.leaseToken);
  for (const operation of [() => h.repository.savePlan(input, first.leaseToken, {operations: []}),
    () => h.repository.fail(input, first.leaseToken, new Error("old")),
    () => h.repository.finish(input, first.leaseToken, {readiness: null, reliability: 0})]) await assert.rejects(operation, {code: "reset-lease-lost"});
  await assert.rejects(h.repository.claim({...input, topicId: "reading"}, "admin"), {code: "already-exists"});
});

test("plans fail closed on mixed-topic practices and flag unattributable missing definitions", async () => {
  const h = harness({[normal("assignedPractices") + "/missing"]: {}});
  assert.equal((await h.planner.execute(scope)).warnings.length, 1);
  h.definitions.set("p", {questions: [scope, other]});
  await assert.rejects(h.run(), {code: "failed-precondition"}); assert.equal(h.documents.has(rootPath), false);
});

test("scope and path validation cannot delete shared definitions, other students or other topic mission state", async () => {
  const h = harness();
  for (const value of [null, {}, {...scope, studentId: "../s"}, {...scope, topicId: ".."}]) assert.throws(() => resetScope(value), {code: "invalid-argument"});
  for (const path of ["questions/q", "studentPractices/other/completedPractices/p", topicPath("studentReadiness") + "-other",
    "studentDailyMissions/s/days/2026-10-18/syllabuses/language", "studentDailyMissions/s/missionStats/language/topics/reading",
    "studentDailyMissions/s/days/2026-10-18/syllabuses/language/additionalTopics/reading/practices/p"]) {
    assert.throws(() => h.repository.validateOperation({path, kind: "delete"}, scope), {code: "failed-precondition"}, path);
  }
});

test("administrator authorization is checked before preview, status and destructive requests", async () => {
  const h = harness(), before = structuredClone(h.documents); h.deny();
  for (const operation of [() => h.feature.preview(scope, actor), () => h.feature.status({...scope, resetId: "reset-1"}, actor), () => h.run()]) {
    await assert.rejects(operation, {code: "permission-denied"}); assert.deepEqual(h.documents, before);
  }
});

test("reset without any retained topic score clears stale subject readiness and calculates zero reliability", async () => {
  const h = harness(); h.documents.delete("studentReadiness/s/syllabuses/language/topics/reading");
  h.documents.delete("reliability/s/syllabuses/language/topics/reading");
  const result = await h.run(); assert.equal(result.subjectReadiness, null); assert.equal(result.subjectReliability, 0);
  assert.equal(h.documents.has("studentReadiness/s/syllabuses/language"), false);
  assert.equal(h.documents.get("reliability/s/syllabuses/language").score, 0);
});

test("old completion workers cannot recreate assignment or metrics after a completed topic reset", async () => {
  const h = harness(), captured = deferred(), resume = deferred();
  const repository = new FirestoreStudentPracticeRepository({getFirestoreDb: () => h.db, getDocumentRef: (collection, id) => h.db.doc(`${collection}/${id}`)});
  const pending = withTopicResetGuard({studentId: "s", scopes: [scope]}, async () => {
    captured.resolve(); await resume.promise;
    await repository.assign({studentId: "s", practiceId: "late"});
  }, {getFirestoreDb: () => h.db});
  await captured.promise; await h.run(); resume.resolve();
  await assert.rejects(pending, {code: "topic-practice-reset"}); assert.equal(h.documents.has(normal("assignedPractices") + "/late"), false);
  await assert.rejects(withTopicResetGuard({studentId: "s", scopes: [scope], createdAt: new Date(now - 1000)}, async () => {
    throw new Error("Should never enter a cancelled event");
  }, {getFirestoreDb: () => h.db}), {code: "topic-practice-reset"});
  await withTopicResetGuard({studentId: "s", scopes: [other], createdAt: new Date(now - 1000)}, () => h.db.runTransaction(async tx => {
    await guardResetTransaction(tx, h.db); tx.set(h.db.doc("studentReadiness/s/syllabuses/language/topics/reading"), {score: 70});
  }), {getFirestoreDb: () => h.db});
  await withTopicResetGuard({studentId: "s", scopes: [scope], createdAt: new Date(now + 1)}, () => repository.assign({studentId: "s", practiceId: "new"}), {getFirestoreDb: () => h.db});
  assert.equal(h.documents.has(normal("assignedPractices") + "/new"), true);
});

test("active maintenance blocks submissions and stale essay sources cannot assign a follow-up after reset", async () => {
  const h = harness(), ref = h.db.doc(rootPath);
  await h.repository.claim({...scope, resetId: "reset-1"}, "admin");
  await assert.rejects(h.db.runTransaction(tx => guardStudentMaintenance(tx, ref)), {code: "student-maintenance"});
  h.advance(600001); await h.run();
  const repository = new FirestoreStudentEssayPracticeRepository({getFirestoreDb: () => h.db, serverTimestamp: () => new Date(now)});
  await assert.rejects(repository.assign({...scope, essayPracticeId: "late", essayQuestionId: "q-late"}, {
    sourceCompletion: {essayPracticeId: "e", completedAt: new Date(now - 1000)},
  }), {code: "topic-practice-reset"});
  assert.equal(h.documents.has(essays("assigned") + "/late"), false);
});

test("delayed scoring, readiness, reliability and processing transactions all retain their captured reset revision", async () => {
  const h = harness(), captured = deferred(), resume = deferred();
  const dependencies = {getFirestoreDb: () => h.db, getDocumentRef: (collection, id) => h.db.doc(`${collection}/${id}`),
    getCollectionRef: path => h.db.collection(path), serverTimestamp: () => new Date(now)};
  const readiness = new FirestoreReadinessScoreRepository(dependencies), reliability = new FirestoreReliabilityScoreRepository(dependencies);
  const scoring = new FirestoreEssayResultRepository(dependencies), processing = new FirestorePracticeCompletionProcessingRepository(dependencies);
  const pending = withTopicResetGuard({studentId: "s", scopes: [scope]}, async () => {
    captured.resolve(); await resume.promise;
    for (const operation of [
      () => readiness.save({...scope, score: 80, practiceId: "p"}),
      () => readiness.saveSubject({studentId: "s", syllabusId: "language", score: 80, practiceId: "p"}),
      () => reliability.saveTopic({...scope, score: 50, completedPracticeCount: 5}),
      () => scoring.save({studentId: "s", questionId: "q", answer: "Old essay", score: 90, reviewComment: "Review", corrections: []}, {submittedAt: new Date(now - 1000)}),
      () => processing.markProcessing({studentId: "s", practiceId: "p", eventId: "old-event"}),
    ]) await assert.rejects(operation, {code: "topic-practice-reset"});
  }, {getFirestoreDb: () => h.db});
  await captured.promise; await h.run(); resume.resolve(); await pending;
  for (const path of [topicPath("studentReadiness"), topicPath("reliability"), "essayResults/s/questions/q", normal("completionProcessing") + "/p"]) assert.equal(h.documents.has(path), false);
});

test("student mission acceptance and pausing reject active maintenance before writing", async () => {
  const h = harness(); await h.repository.claim({...scope, resetId: "reset-1"}, "admin");
  const before = structuredClone(h.documents), repository = new FirestoreDailyMissionRepository({getFirestoreDb: () => h.db,
    getDocumentRef: (collection, id) => h.db.doc(`${collection}/${id}`)});
  for (const operation of [
    () => repository.acceptCoreMission({...scope, practiceId: "a", date: "2026-10-18"}),
    () => repository.acceptAdditionalMission({...scope, practiceId: "a", date: "2026-10-18"}),
    () => repository.pauseTopic({...scope, pausedDate: "2026-10-18"}),
  ]) {await assert.rejects(operation, {code: "student-maintenance"}); assert.deepEqual(h.documents, before);}
});
