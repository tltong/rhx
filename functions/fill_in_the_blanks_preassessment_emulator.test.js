// Isolated Firestore integration. All generation/marking providers are mocked.
const test = require("node:test"), assert = require("node:assert/strict");
test("single-passage pre-assessment lifecycle", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const cleared = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(cleared.status, 200);
  const {getFirestoreDb} = require("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {normaliseConfig} = require("./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
  const {createFillInTheBlanksQuestionGenerator} = require("./features/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module");
  const {createFillInTheBlanksPracticeGenerator} = require("./features/fill_in_the_blanks_practice_generator/fill_in_the_blanks_practice_generator_module");
  const practices = require("./features/fill_in_the_blanks_practice/fill_in_the_blanks_practice_module");
  const students = require("./features/student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module");
  const {createStudentFillInTheBlanksPracticeGenerator} = require("./features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module");
  const {createFillInTheBlanksScoringFeature} = require("./features/fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module");
  const {createFillInTheBlanksPracticeSession} = require("./features/fill_in_the_blanks_practice_session/fill_in_the_blanks_practice_session_module");
  const {processCompletedFillInTheBlanksPractice} = require("./triggers/student_fill_in_the_blanks_practice_completion_trigger");
  const {assignSubscriptionPreAssessmentPractices} = require("./triggers/syllabus_subscription_trigger");
  const assessment = require("./features/student_assessment_progress/student_assessment_progress_module");
  const daily = require("./features/daily_mission/daily_mission_module");
  const bands = require("./schema/assessment_framework_schema").assessmentFrameworkPreAssessmentScoreBands;
  const scope = {syllabusId: "pre-english", topicId: "vocabulary", language: "English"};
  const mapping = Object.fromEntries(bands.map(({field}, index) => [field, index === 6 ? "endLevel" : index >= 2 ? "second" : "first"]));
  const meta = {updatedBy: "admin", updatedAt: new Date()};
  await Promise.all([
    db.doc("syllabuses/pre-english").set({country: "MY", level: "primary", year: 1, subject: "English", active: true, languages: ["English"]}),
    db.doc("syllabuses/pre-english/topics/vocabulary").set({topicName: "Vocabulary", pausable: true, assessmentFrameworkIds: {english: "pre-framework"}}),
    db.doc("assessmentFrameworks/pre-framework").set({name: "Placement", frameworkType: "fillInTheBlanks", endLevelName: "Mastered"}),
    ...["first", "second"].map((id, index) => db.doc("assessmentFrameworks/pre-framework/levels/" + id).set({levelName: id, sequenceOrder: index + 1,
      criteria: {requiredPracticeCount: 2, minimumScore: 60, questionsPerPractice: 1, difficultyLevel: index ? "hard" : "easy"}})),
    db.doc("assessmentFrameworks/pre-framework/preAssessment/default").set({scoreLevelSplit: mapping}),
    db.doc("fillInTheBlanksQuestionGenerator/config").set({...normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 5}}}}), ...meta}),
    db.doc("rewards/config").set({...require("./schema/reward_schema").DEFAULT_REWARD_CONFIG, ...meta}),
    db.doc("rewards/config/assessmentFrameworks/pre-framework").set({levelCoins: {first: 0, second: 7, endLevel: 10}, ...meta}),
    db.doc("readinessConfigs/default").set({numberOfPractices: 5, preAssessmentWeight: .5, difficultyWeights: {easy: .75, medium: 1, hard: 1.75}, ...meta}),
  ]);
  let textCalls = 0, failMarking = false, markCalls = 0;
  const questions = createFillInTheBlanksQuestionGenerator({authorize: async () => "admin", generateText: async () => {
    textCalls++;
    return {passageText: "We saw {{q1}} and {{q2}}. Then {{q3}}, {{q4}}, and {{q5}} came.", summary: "Visit " + textCalls,
      imagePrompt: null, questions: Array.from({length: 5}, (_, i) => ({questionId: "q" + (i + 1), requiredWordCount: 1, correctAnswer: "birds"}))};
  }});
  const adminGenerator = createFillInTheBlanksPracticeGenerator({authorize: async () => "admin", questions});
  const generation = createStudentFillInTheBlanksPracticeGenerator({questions, choose: () => 0});
  const scoring = createFillInTheBlanksScoringFeature({generateText: async () => {
    markCalls++; if (failMarking) throw new Error("Marking unavailable");
    return {answers: [{questionId: "q1", isCorrect: true}]};
  }});
  const sessions = createFillInTheBlanksPracticeSession({scoring});
  let template, assigned;
  const submit = (studentId, practiceId, correct = 4) => sessions.submitFillInTheBlanksPracticeSession({studentId, practiceId, timeTakenSeconds: 12,
    answers: Object.fromEntries(Array.from({length: 5}, (_, i) => ["q" + (i + 1), i < correct ? "birds" : ""]))});
  await t.test("admin generates one Medium passage with the grade-configured blank count and attaches it", async () => {
    const generated = await adminGenerator.generateFillInTheBlanksPractice(scope, {trusted: true});
    template = generated.practice;
    assert.equal(template.type, "pre assessment"); assert.equal(template.difficulty, "medium");
    assert.equal(template.questions.length, 5); assert.equal(template.assessmentFrameworkId, "pre-framework");
    assert.equal(template.preAssessmentConfig.preAssessment.scoreLevelSplit.over80Percent, "second");
    assert.equal((await adminGenerator.loadFillInTheBlanksPractice(scope)).practice.id, template.id);
  });
  await t.test("syllabus subscription assigns the attached pre-assessment, reuses it for other students and replays safely", async () => {
    const assign = studentId => assignSubscriptionPreAssessmentPractices({studentId, ...scope}, {assignFillInTheBlanksPractice: input => generation.assignInitialStudentFillInTheBlanksPractice(input)});
    await assign("pre-student"); await assign("pre-student"); await assign("pre-other");
    assigned = (await students.listAssignedFillInTheBlanksPractices({studentId: "pre-student"})).practices;
    assert.equal(assigned.length, 1); assert.equal(assigned[0].practiceId, template.id); assert.equal(assigned[0].type, "pre assessment");
    assert.equal(textCalls, 1);
    assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId: "pre-other"})).practices[0].practiceId, template.id);
  });
  await t.test("the pre-assessment is the first mission for the topic even when regular work is also assigned", async () => {
    const extra = await practices.createFillInTheBlanksPractice({passageId: template.passageId, practiceId: "regular-extra"});
    const data = {...assigned[0], type: "assessment"}; delete data.studentId; delete data.practiceId;
    await db.doc("studentFillInTheBlanksPractices/pre-student/assignedPractices/" + extra.id).set(data);
    const mission = await daily.getNextCoreDailyMission({studentId: "pre-student", syllabusId: scope.syllabusId});
    assert.equal(mission.practiceId, template.id);
    await daily.acceptCoreDailyMission({studentId: "pre-student", practiceId: template.id, practiceType: "fillInTheBlanks"});
    await db.doc("studentFillInTheBlanksPractices/pre-student/assignedPractices/regular-extra").delete();
  });
  await t.test("an interrupted grade cannot place the student before all marking is complete", async () => {
    failMarking = true;
    await assert.rejects(sessions.submitFillInTheBlanksPracticeSession({studentId: "pre-other", practiceId: template.id, timeTakenSeconds: 12,
      answers: {q1: "sparrows", q2: "birds", q3: "birds", q4: "birds", q5: ""}}), /Marking unavailable/);
    assert.equal(await scoring.getFillInTheBlanksResult({studentId: "pre-other", practiceId: template.id}), null);
    assert.equal(await assessment.getStudentTopicLevel({studentId: "pre-other", ...scope}), null);
    failMarking = false;
  });
  await t.test("placement retains the assigned mapping when administrators change the live configuration", async () => {
    await db.doc("assessmentFrameworks/pre-framework/preAssessment/default").set({difficultyLevel: "hard", scoreLevelSplit: Object.fromEntries(bands.map(({field}) => [field, "endLevel"]))});
    await submit("pre-student", template.id);
    const input = {studentId: "pre-student", practiceId: template.id};
    const outcomes = await Promise.all([assessment.assessStudentFillInTheBlanksPractice(input), assessment.assessStudentFillInTheBlanksPractice(input)]);
    assert.ok(outcomes.every(outcome => outcome.levelId === "second"));
    const progress = (await db.doc("studentAssessmentProgress/pre-student/syllabuses/pre-english/topics/vocabulary").get()).data();
    assert.equal(progress.initialLevel.levelId, "second"); assert.equal(progress.assessmentRevision, 1);
    assert.equal((await assessment.getStudentPracticeAssessment(input)).assessmentType, "pre assessment");
  });
  let nextId;
  await t.test("existing completion processing awards once and generates regular work at the placed level", async () => {
    const input = {studentId: "pre-student", practiceId: template.id};
    const processed = await processCompletedFillInTheBlanksPractice(input, {generation});
    nextId = processed.generation.nextPracticeId;
    const next = await practices.getFillInTheBlanksPracticeById(nextId);
    assert.equal(next.type, "assessment"); assert.equal(next.difficulty, "hard");
    const readiness = require("./features/readiness/readiness_module");
    assert.equal(await readiness.calculateReadinessScore({studentId: "pre-student", ...scope}), 40);
    const rewards = require("./features/reward/reward_module");
    const balance = await rewards.getStudentRewardTotal({studentId: "pre-student"}); assert.equal(balance, 32);
    await processCompletedFillInTheBlanksPractice(input, {generation});
    assert.equal(await rewards.getStudentRewardTotal({studentId: "pre-student"}), balance);
  });
  await t.test("the placement score does not count as a regular practice toward promotion", async () => {
    await submit("pre-student", nextId);
    const result = await processCompletedFillInTheBlanksPractice({studentId: "pre-student", practiceId: nextId}, {generation});
    assert.equal(result.assessment.levelId, "second"); assert.equal(result.assessment.eligiblePracticeCount, 1);
    nextId = result.generation.nextPracticeId;
  });
  await t.test("re-subscription after an administrator replaces the template preserves an established level", async () => {
    const replacement = await adminGenerator.generateFillInTheBlanksPractice(scope, {trusted: true});
    assert.equal(replacement.practice.difficulty, "hard");
    const before = (await students.listAssignedFillInTheBlanksPractices({studentId: "pre-student"})).practices.map(p => p.practiceId);
    await generation.assignInitialStudentFillInTheBlanksPractice({studentId: "pre-student", ...scope, practiceId: replacement.practice.id});
    assert.deepEqual((await students.listAssignedFillInTheBlanksPractices({studentId: "pre-student"})).practices.map(p => p.practiceId), before);
    assert.equal(await assessment.getStudentTopicLevel({studentId: "pre-student", ...scope}), "second");
  });
  await t.test("a late pre-assessment cannot overwrite an established level", async () => {
    const replacement = await adminGenerator.generateFillInTheBlanksPractice(scope, {trusted: true});
    await students.assignFillInTheBlanksPracticeToStudent({studentId: "pre-student", practiceId: replacement.practice.id});
    await submit("pre-student", replacement.practice.id, 5);
    const result = await assessment.assessStudentFillInTheBlanksPractice({studentId: "pre-student", practiceId: replacement.practice.id});
    assert.equal(result.reason, "pre-assessment-already-applied"); assert.equal(result.assessed, false);
    assert.equal(await assessment.getStudentTopicLevel({studentId: "pre-student", ...scope}), "second");
  });
  await t.test("a top-band pre-assessment can complete the framework without creating regular work", async () => {
    await generation.assignInitialStudentFillInTheBlanksPractice({studentId: "pre-mastered", ...scope, practiceId: template.id});
    await submit("pre-mastered", template.id, 5);
    const result = await processCompletedFillInTheBlanksPractice({studentId: "pre-mastered", practiceId: template.id}, {generation});
    assert.equal(result.assessment.isFrameworkCompleted, true); assert.equal(result.generation.nextPracticeId, null);
    assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId: "pre-mastered"})).practices.length, 0);
  });
});
