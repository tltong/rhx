// Move legacy syllabus defaults to explicit topic/language references.
// Default: read-only audit. --apply refuses the entire plan if any conflict exists.
const {createSyllabusLanguageKey: languageKey} = require('../functions/features/syllabus/domain/syllabus');
const types = new Set(['normal', 'essay', 'fillInTheBlanks']);
const validId = value => typeof value === 'string' && value.trim() === value && value.length && !value.includes('/') && !['.', '..'].includes(value);
function planSyllabus(syllabus, topics, frameworks) {
  const conflicts = [], assignments = [], legacyId = syllabus.assessmentFrameworkId;
  const languages = new Set((syllabus.languages || []).map(languageKey));
  if (!languages.size || !topics.length) conflicts.push({reason: 'Syllabus has no languages or topics.'});
  for (const topic of topics) {
    const current = topic.assessmentFrameworkIds || {}, next = {...current};
    for (const key of Object.keys(current)) if (!languages.has(key)) conflicts.push({topicId: topic.id, language: key, reason: 'Framework assignment uses an unavailable language.'});
    for (const key of languages) {
      const explicit = Object.hasOwn(current, key);
      const id = explicit ? current[key] : legacyId;
      const framework = validId(id) ? frameworks.get(id) : null;
      const attachment = topic.preAssessmentPractices?.[key];
      const type = framework?.frameworkType || 'normal';
      if (!framework || !types.has(type)) {
        conflicts.push({topicId: topic.id, language: key, reason: explicit ? 'Assigned framework is invalid or missing.' : 'No valid legacy default to copy; select a topic framework.'});
      } else if (attachment && (attachment.practiceType || 'normal') !== type) {
        conflicts.push({topicId: topic.id, language: key, frameworkId: id, reason: 'Framework type conflicts with the attached practice.', frameworkType: type, practiceType: attachment.practiceType || 'normal'});
      } else if (!explicit) Object.defineProperty(next, key, {value: id, enumerable: true, writable: true, configurable: true});
    }
    if (JSON.stringify(next) !== JSON.stringify(current)) assignments.push({topicId: topic.id, assessmentFrameworkIds: next});
  }
  return {syllabusId: syllabus.id, assignments, removeLegacyDefault: Object.hasOwn(syllabus, 'assessmentFrameworkId'), conflicts};
}
function decode(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key,
    'stringValue' in value ? value.stringValue : 'booleanValue' in value ? value.booleanValue :
    'integerValue' in value ? Number(value.integerValue) : 'nullValue' in value ? null :
    'arrayValue' in value ? (value.arrayValue.values || []).map(item => decode({value: item}).value) :
    'mapValue' in value ? decode(value.mapValue.fields) : undefined]));
}
function encodeMap(values) {return {mapValue: {fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {stringValue: value}]))}};}
async function listDocuments(client, path) {
  const docs = []; let pageToken;
  do {
    const result = (await client.get(path, {queryParams: {pageSize: 300, ...(pageToken ? {pageToken} : {})}})).body;
    docs.push(...(result.documents || [])); pageToken = result.nextPageToken;
  } while (pageToken);
  return docs;
}
function fromDocument(doc) {return {...decode(doc.fields), id: doc.name.split('/').at(-1)};}
function buildWrites(plan, syllabusDoc, topicDocs, frameworkDocs) {
  if (plan.conflicts.length) throw new Error('Cannot apply a migration with conflicts.');
  const updated = new Map(plan.assignments.map(value => [value.topicId, value.assessmentFrameworkIds]));
  const writes = [plan.removeLegacyDefault
    ? {update: {name: syllabusDoc.name, fields: {}}, updateMask: {fieldPaths: ['assessmentFrameworkId']}, currentDocument: {updateTime: syllabusDoc.updateTime}}
    : {verify: syllabusDoc.name, currentDocument: {updateTime: syllabusDoc.updateTime}}];
  const referenced = new Set();
  for (const doc of topicDocs) {
    const data = fromDocument(doc), values = updated.get(data.id);
    for (const id of Object.values(values || data.assessmentFrameworkIds || {})) referenced.add(id);
    writes.push(values
      ? {update: {name: doc.name, fields: {assessmentFrameworkIds: encodeMap(values)}}, updateMask: {fieldPaths: ['assessmentFrameworkIds']}, currentDocument: {updateTime: doc.updateTime}}
      : {verify: doc.name, currentDocument: {updateTime: doc.updateTime}});
  }
  for (const id of referenced) {
    const doc = frameworkDocs.get(id);
    writes.push({verify: doc.name, currentDocument: {updateTime: doc.updateTime}});
  }
  if (writes.length > 450) throw new Error('Syllabus is too large for one safe migration transaction. No changes applied.');
  return writes;
}
async function migrate({client, project, apply = false}) {
  const database = `projects/${project}/databases/(default)`, documents = database + '/documents';
  const [syllabusDocs, frameworkList] = await Promise.all([listDocuments(client, documents + '/syllabuses'), listDocuments(client, documents + '/assessmentFrameworks')]);
  const frameworkDocs = new Map(frameworkList.map(doc => [fromDocument(doc).id, doc]));
  const frameworks = new Map(frameworkList.map(doc => {const data = fromDocument(doc); return [data.id, data];}));
  const entries = [];
  for (const syllabusDoc of syllabusDocs) {
    const topicDocs = await listDocuments(client, syllabusDoc.name + '/topics');
    const plan = planSyllabus(fromDocument(syllabusDoc), topicDocs.map(fromDocument), frameworks);
    entries.push({plan, syllabusDoc, topicDocs});
  }
  const report = {project, mode: apply ? 'apply' : 'dry-run', syllabuses: entries.map(({plan}) => plan), applied: 0};
  if (apply && entries.some(({plan}) => plan.conflicts.length)) {
    report.blocked = 'Resolve every reported conflict in Syllabus administration, then rerun the audit. No changes applied.';
    return report;
  }
  // Prepare every atomic commit before writing any syllabus. Preconditions prevent overwriting edits made after the audit.
  if (!apply) return report;
  const pending = entries.filter(({plan}) => plan.removeLegacyDefault || plan.assignments.length)
    .map(entry => ({...entry, writes: buildWrites(entry.plan, entry.syllabusDoc, entry.topicDocs, frameworkDocs)}));
  for (const entry of pending) {
    await client.post(database + '/documents:commit', {writes: entry.writes}); report.applied++;
  }
  return report;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => arg !== '--apply')) throw new Error('Usage: migrate-topic-frameworks.cjs [--apply]');
  const dependencies = require(process.env.RHX_FIREBASE_DEPENDENCIES);
  const firebase = require('node:module').createRequire(dependencies['firebase-tools'].entry);
  await firebase(dependencies['firebase-tools'].directory + '/lib/requireAuth').requireAuth({project: 'readyherox', nonInteractive: true});
  const {Client} = firebase(dependencies['firebase-tools'].directory + '/lib/apiv2');
  const report = await migrate({client: new Client({urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1'}), project: 'readyherox', apply: args.includes('--apply')});
  // Firebase Tools keeps authentication refresh timers alive; finish this one-shot CLI explicitly.
  process.stdout.write(JSON.stringify(report, null, 2) + "\n", () => process.exit(report.blocked ? 2 : 0));
}
if (require.main === module) main().catch(error => {process.stderr.write('Topic framework migration failed: ' + (error.status || error.code || 'unknown') + ' ' + (error.context?.body?.error?.message || error.message) + '\n', () => process.exit(1));});
module.exports = {planSyllabus, buildWrites, migrate};
