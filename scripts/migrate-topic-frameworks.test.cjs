const {test} = require('node:test'), assert = require('node:assert/strict');
const {planSyllabus, buildWrites, migrate} = require('./migrate-topic-frameworks.cjs');
const frameworks = new Map([['mcq', {}], ['essay', {frameworkType: 'essay'}], ['fill', {frameworkType: 'fillInTheBlanks'}]]);
const syllabus = {id: 's', languages: ['English', 'Tamil'], assessmentFrameworkId: 'mcq'};
test('copies compatible legacy defaults, preserves explicit formats and is idempotent', () => {
  const topic = {id: 't', assessmentFrameworkIds: {tamil: 'essay'}, preAssessmentPractices: {tamil: {practiceType: 'essay'}}};
  const plan = planSyllabus(syllabus, [topic], frameworks);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.assignments, [{topicId: 't', assessmentFrameworkIds: {tamil: 'essay', english: 'mcq'}}]);
  const {assessmentFrameworkId, ...migrated} = syllabus;
  const next = planSyllabus(migrated, [{...topic, ...plan.assignments[0]}], frameworks);
  assert.deepEqual(next.assignments, []); assert.equal(next.removeLegacyDefault, false);
});
test('an essay or fill attachment never inherits a MCQ default', () => {
  for (const practiceType of ['essay', 'fillInTheBlanks']) {
    const plan = planSyllabus(syllabus, [{id: 't', preAssessmentPractices: {english: {practiceType}}}], frameworks);
    assert.equal(plan.conflicts.length, 1); assert.match(plan.conflicts[0].reason, /conflicts/);
    assert.equal(plan.assignments[0].assessmentFrameworkIds.english, undefined);
  }
});
test('missing, invalid, unavailable-language and incompatible explicit bindings require review', () => {
  for (const topic of [{assessmentFrameworkIds: {english: 'gone'}}, {assessmentFrameworkIds: {english: 'bad/id'}}, {assessmentFrameworkIds: {french: 'mcq'}},
    {assessmentFrameworkIds: {english: 'essay'}, preAssessmentPractices: {english: {}}}]) {
    assert.ok(planSyllabus(syllabus, [{id: 't', ...topic}], frameworks).conflicts.length);
  }
  assert.ok(planSyllabus({id: 's', languages: ['English']}, [{id: 't'}], frameworks).conflicts.length);
});
const root = 'projects/demo-topic/databases/(default)/documents';
const stamp = '2026-11-05T01:00:00Z';
const doc = (path, fields) => ({name: root + '/' + path, updateTime: stamp, fields});
const string = value => ({stringValue: value});
function clientFixture({conflict = false, stale = false} = {}) {
  const writes = [];
  const parent = doc('syllabuses/s', {languages: {arrayValue: {values: [string('English')]}}, assessmentFrameworkId: string('mcq')});
  const topic = doc('syllabuses/s/topics/t', conflict ? {preAssessmentPractices: {mapValue: {fields: {english: {mapValue: {fields: {practiceType: string('essay')}}}}}}} : {});
  const framework = doc('assessmentFrameworks/mcq', {});
  return {writes, parent, topic, framework, client: {
    async get(path) {return {body: {documents: path.endsWith('/topics') ? [topic] : path.endsWith('/syllabuses') ? [parent] : [framework]}};},
    async post(path, body) {
      assert.equal(path, 'projects/demo-topic/databases/(default)/documents:commit');
      if (stale) throw Object.assign(new Error('Concurrent edit'), {code: 'FAILED_PRECONDITION'});
      writes.push(body);
    },
  }};
}
test('dry-run performs zero writes even when it finds type conflicts', async () => {
  for (const conflict of [false, true]) {
    const f = clientFixture({conflict}), report = await migrate({client: f.client, project: 'demo-topic'});
    assert.equal(report.mode, 'dry-run'); assert.equal(report.applied, 0); assert.deepEqual(f.writes, []);
    assert.equal(report.syllabuses[0].conflicts.length, conflict ? 1 : 0);
  }
});
test('apply refuses every write when any syllabus has a conflict', async () => {
  const f = clientFixture({conflict: true});
  const report = await migrate({client: f.client, project: 'demo-topic', apply: true});
  assert.match(report.blocked, /No changes/); assert.deepEqual(f.writes, []);
});
test('apply uses one conditional commit per syllabus and changes only topic references and legacy root field', async () => {
  const f = clientFixture(), report = await migrate({client: f.client, project: 'demo-topic', apply: true});
  assert.equal(report.applied, 1); assert.equal(f.writes.length, 1);
  const writes = f.writes[0].writes;
  assert.deepEqual(writes[0].updateMask.fieldPaths, ['assessmentFrameworkId']);
  assert.deepEqual(writes[0].update.fields, {});
  assert.deepEqual(writes[1].updateMask.fieldPaths, ['assessmentFrameworkIds']);
  assert.equal(writes[1].update.fields.assessmentFrameworkIds.mapValue.fields.english.stringValue, 'mcq');
  assert.equal(writes[2].verify, f.framework.name);
  assert.ok(writes.every(write => write.currentDocument.updateTime === stamp));
  assert.ok(writes.every(write => !/student|practice|reward/i.test(write.update?.name || write.verify)));
});
test('a concurrent administrator change fails the migration without overwriting it', async () => {
  const f = clientFixture({stale: true});
  await assert.rejects(migrate({client: f.client, project: 'demo-topic', apply: true}), /Concurrent edit/);
  assert.deepEqual(f.writes, []);
});
test('malformed or conflicted plans cannot be applied', () => {
  assert.throws(() => buildWrites({conflicts: ['conflict']}, {}, [], new Map()), /conflicts/);
});
