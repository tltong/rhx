// A mixed-format syllabus using actual feature APIs and isolated Firestore; no paid generation.
const {test} = require('node:test'), assert = require('node:assert/strict');
test('one syllabus provisions MCQ, essay and fill-in-the-blanks using each topic framework', {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.GCLOUD_PROJECT || '', /^demo-/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: 'DELETE'});
  const db = require('./utils/firebase/firebase_ops').getFirestoreDb();
  const syllabus = require('./features/syllabus/syllabus_module');
  const frames = require('./features/assessment_framework/assessment_framework_module');
  const essays = require('./features/essay_question_generator/essay_question_generator_module');
  const essayPractices = require('./features/essay_practice/essay_practice_module');
  const {GenerateEssayPractice} = require('./features/essay_practice_generator/application/generate_essay_practice');
  const {createFillInTheBlanksQuestionGenerator} = require('./features/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module');
  const {createFillInTheBlanksPracticeGenerator} = require('./features/fill_in_the_blanks_practice_generator/fill_in_the_blanks_practice_generator_module');
  const {createStudentFillInTheBlanksPracticeGenerator} = require('./features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module');
  const {assignSubscriptionPreAssessmentPractices, subscriptionEssayAttemptId} = require('./triggers/syllabus_subscription_trigger');
  const config = require('./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks').normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 2}}}});
  const bands = require('./schema/assessment_framework_schema').assessmentFrameworkPreAssessmentScoreBands;
  await db.doc('syllabuses/mixed').set({country: 'MY', level: 'primary', year: 1, subject: 'English', active: true, languages: ['English'], assessmentFrameworkId: 'essay'});
  for (const [id, type] of [['reading', 'normal'], ['writing', 'essay'], ['vocabulary', 'fillInTheBlanks']]) {
    await db.doc('syllabuses/mixed/topics/' + id).set({topicName: id, assessmentFrameworkIds: {english: type}});
    await db.doc('assessmentFrameworks/' + type).set({name: type, frameworkType: type, endLevelName: 'Mastered'});
    await db.doc('assessmentFrameworks/' + type + '/levels/first').set({levelName: 'First', sequenceOrder: 1,
      criteria: {requiredPracticeCount: 2, minimumScore: 80, questionsPerPractice: type === 'normal' ? 2 : 1, difficultyLevel: 'medium'}});
    if (type !== 'essay') await db.doc('assessmentFrameworks/' + type + '/preAssessment/default').set({
      ...(type === 'normal' ? {numberOfQuestions: 2, difficultySplit: {easyPercentage: 0, mediumPercentage: 100, hardPercentage: 0}} : {difficultyLevel: 'medium'}),
      scoreLevelSplit: Object.fromEntries(bands.map(({field}) => [field, 'first'])),
    });
  }
  let essayCalls = 0, fillCalls = 0;
  const essayGenerator = new GenerateEssayPractice({getSyllabusById: syllabus.getSyllabusById, getAssessmentFrameworkById: frames.getAssessmentFrameworkById,
    getRandomQuestionSeedEntry: async () => 'A park', requireAdministrator: async () => ({uid: 'admin'}),
    generateEssayQuestion: async input => {essayCalls++; return essays.saveEssayQuestion({...input, questionId: 'essay-q', seedUsed: 'A park', questionText: 'Describe your visit to a park.', wordCountRequirement: {minWords: 20}}, {updatedBy: 'admin'});},
    createEssayPractice: essayPractices.createEssayPractice, assignTopicPreAssessmentPractice: syllabus.assignTopicPreAssessmentPractice});
  await db.doc('fillInTheBlanksQuestionGenerator/config').set({...config, updatedBy: 'admin', updatedAt: new Date()});
  const questions = createFillInTheBlanksQuestionGenerator({authorize: async () => 'admin', generateText: async () => {
    fillCalls++; return {passageText: 'We saw {{q1}} near the {{q2}}.', summary: 'Park visit', imagePrompt: null,
      questions: [{questionId: 'q1', requiredWordCount: 1, correctAnswer: 'birds'}, {questionId: 'q2', requiredWordCount: 1, correctAnswer: 'pond'}]};
  }});
  const fillGenerator = createFillInTheBlanksPracticeGenerator({authorize: async () => 'admin', questions});
  const initialFill = createStudentFillInTheBlanksPracticeGenerator({questions, choose: () => 0});
  const scope = {syllabusId: 'mixed', language: 'English'};
  let essay, fill;
  await t.test('generation chooses the topic framework and rejects a wrong format before generation', async () => {
    await assert.rejects(essayGenerator.execute({...scope, topicId: 'reading'}), /essay assessment framework/);
    await assert.rejects(fillGenerator.generateFillInTheBlanksPractice({...scope, topicId: 'writing'}), /fill-in-the-blanks/);
    assert.equal(essayCalls, 0); assert.equal(fillCalls, 0);
    essay = await essayGenerator.execute({...scope, topicId: 'writing'});
    fill = await fillGenerator.generateFillInTheBlanksPractice({...scope, topicId: 'vocabulary'});
    assert.equal(fill.practice.assessmentFrameworkId, 'fillInTheBlanks');
    await db.doc('practices/mcq-initial').set({type: 'pre assessment', dateGenerated: new Date(),
      questions: [{syllabusId: 'mixed', topicId: 'reading', questionId: 'mcq-q', language: 'English'}]});
    await syllabus.assignTopicPreAssessmentPractice('mixed', 'reading', 'English', 'mcq-initial', 'normal');
    assert.equal(essayCalls, 1); assert.equal(fillCalls, 1);
  });
  const assign = studentId => assignSubscriptionPreAssessmentPractices({studentId, ...scope}, {assignFillInTheBlanksPractice: input => initialFill.assignInitialStudentFillInTheBlanksPractice(input)});
  await t.test('subscription assigns each format to its own collection and reuses shared questions', async () => {
    for (const id of ['student-a', 'student-a', 'student-b']) await assign(id);
    for (const student of ['student-a', 'student-b']) {
      assert.equal((await db.collection(`studentPractices/${student}/assignedPractices`).get()).size, 1);
      assert.equal((await db.collection(`studentEssayPractices/${student}/assignedEssayPractices`).get()).size, 1);
      assert.equal((await db.collection(`studentFillInTheBlanksPractices/${student}/assignedPractices`).get()).size, 1);
      assert.ok((await db.doc(`studentEssayPractices/${student}/assignedEssayPractices/${subscriptionEssayAttemptId('mixed', 'writing', essay.practice.id)}`).get()).exists);
    }
    assert.equal(essayCalls, 1); assert.equal(fillCalls, 1);
  });
  await t.test('missing topic mapping and mismatched attachments cause zero student assignments', async () => {
    await db.doc('syllabuses/mixed/topics/vocabulary').update({assessmentFrameworkIds: {}});
    await assert.rejects(assign('student-missing'), /not configured/);
    assert.equal((await db.collection('studentPractices/student-missing/assignedPractices').get()).size, 0);
    await db.doc('syllabuses/mixed/topics/vocabulary').update({assessmentFrameworkIds: {english: 'normal'}});
    await assert.rejects(assign('student-mismatch'), /does not match/);
    assert.equal((await db.collection('studentEssayPractices/student-mismatch/assignedEssayPractices').get()).size, 0);
    await db.doc('syllabuses/mixed/topics/vocabulary').update({assessmentFrameworkIds: {english: 'fillInTheBlanks'}});
  });
  await t.test('changing a framework cannot silently invalidate attached content or existing student progress', async () => {
    await db.doc('studentAssessmentProgress/student-a/syllabuses/mixed/topics/writing').set({currentLevelId: 'first', assessmentRevision: 5});
    await assert.rejects(syllabus.assignTopicAssessmentFramework({...scope, topicId: 'writing', assessmentFrameworkId: 'normal'}), /attached practice type/);
    await assert.rejects(syllabus.assignTopicAssessmentFramework({...scope, topicId: 'writing', assessmentFrameworkId: null}), /requires an assessment framework/);
    assert.deepEqual((await db.doc('studentAssessmentProgress/student-a/syllabuses/mixed/topics/writing').get()).data(), {currentLevelId: 'first', assessmentRevision: 5});
    assert.equal(await syllabus.getTopicAssessmentFrameworkId({...scope, topicId: 'writing'}), 'essay');
  });
  await t.test('migration dry-run is read-only and apply updates only references while preserving progress and assignments', async () => {
    const {migrate} = require('../scripts/migrate-topic-frameworks.cjs');
    const prefix = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/`;
    const client = {
      async get(path, {queryParams} = {}) {
        const response = await fetch(prefix + path + '?' + new URLSearchParams(queryParams));
        assert.equal(response.status, 200); return {body: await response.json()};
      },
      async post(path, body) {
        const response = await fetch(prefix + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
        const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return {body: result};
      },
    };
    await db.doc('syllabuses/mixed').update({assessmentFrameworkId: 'normal'});
    await db.doc('syllabuses/mixed/topics/legacy').set({topicName: 'Legacy reading'});
    const before = (await db.doc('studentAssessmentProgress/student-a/syllabuses/mixed/topics/writing').get()).data();
    const report = await migrate({client, project: process.env.GCLOUD_PROJECT});
    assert.equal(report.applied, 0); assert.equal(report.syllabuses[0].assignments[0].assessmentFrameworkIds.english, 'normal');
    assert.deepEqual((await db.doc('syllabuses/mixed/topics/legacy').get()).data(), {topicName: 'Legacy reading'});
    const applied = await migrate({client, project: process.env.GCLOUD_PROJECT, apply: true}); assert.equal(applied.applied, 1);
    assert.equal((await db.doc('syllabuses/mixed').get()).data().assessmentFrameworkId, undefined);
    assert.equal((await db.doc('syllabuses/mixed/topics/legacy').get()).data().assessmentFrameworkIds.english, 'normal');
    assert.equal(await syllabus.getTopicAssessmentFrameworkId({...scope, topicId: 'writing'}), 'essay');
    assert.equal(await syllabus.getTopicAssessmentFrameworkId({...scope, topicId: 'vocabulary'}), 'fillInTheBlanks');
    assert.deepEqual((await db.doc('studentAssessmentProgress/student-a/syllabuses/mixed/topics/writing').get()).data(), before);
    assert.equal((await db.collection('studentEssayPractices/student-a/assignedEssayPractices').get()).size, 1);
    assert.equal((await migrate({client, project: process.env.GCLOUD_PROJECT, apply: true})).applied, 0);
  });

});
