/** Clear the reusable essay pool while keeping referenced content and lifetime type history. */
const fs = require('node:fs'), path = require('node:path');
const {randomUUID} = require('node:crypto');
const ROOT = 'projects/readyherox/databases/(default)/documents';
const string = value => ({stringValue: value});
function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  return {};
}
function planClear({questions, references, usage, snapshots = [], typeHistory = [], retirements = []}, {now = new Date().toISOString()} = {}) {
  const byId = new Map(questions.map(doc => [doc.name.split('/').at(-1), doc]));
  if (byId.size !== questions.length) throw new Error("Question IDs are not unique across the pool.");
  const frozen = new Set(snapshots.map(doc => doc.name.split('/').at(-1))), types = new Set(typeHistory.map(doc => doc.name));
  const retired = new Set(retirements.map(doc => doc.name.split("/").at(-1)));
  const required = new Set(), writes = [], history = new Map();
  const metadata = id => {
    const question = byId.get(id); if (!question) return null;
    return {essayTypeId: question.fields.essayTypeId || string('normalEssay'), seedUsed: question.fields.seedUsed};
  };
  for (const doc of [...references, ...usage]) {
    const data = doc.fields || {}, assignment = data.essayQuestionId?.stringValue;
    const fromUsage = data.identity?.stringValue?.startsWith('essay:') ? data.identity.stringValue.slice(6) : null;
    const questionId = assignment || fromUsage || (doc.name.includes('/questionUsage/') ? doc.name.split('/').at(-1) : null);
    for (const id of [questionId, data.sourceEssayQuestionId?.stringValue]) if (byId.has(id)) required.add(id);
    const meta = metadata(questionId);
    if (!meta) continue;
    if (!meta.seedUsed?.stringValue) throw new Error('A referenced essay question has no seed. Repair before clearing.');
    const isStudent = /\/studentEssayPractices\/([^/]+)\//.exec(doc.name) || /\/studentSubjectAssessmentUsage\/([^/]+)\//.exec(doc.name);
    if (isStudent) {
      const typePath = `${ROOT}/studentEssayPractices/${isStudent[1]}/typeHistory/${meta.essayTypeId.stringValue}`;
      const firstAssignedAt = data.assignedAt || data.selectedAt || {timestampValue: now};
      if (!history.has(typePath) || Date.parse(firstAssignedAt.timestampValue) < Date.parse(history.get(typePath).firstAssignedAt.timestampValue)) history.set(typePath, {firstAssignedAt});
      writes.push({update: {name: doc.name, fields: meta}, updateMask: {fieldPaths: ['essayTypeId','seedUsed']}, currentDocument: {updateTime: doc.updateTime}});
    }
  }
  for (const id of required) {
    if (frozen.has(id)) continue;
    const doc = byId.get(id), parts = doc.name.slice(ROOT.length+1).split('/');
    if (parts.length !== 8 || parts[0] !== 'essayQuestionGenerator' || parts[2] !== 'standards' || parts[4] !== 'languages' || parts[6] !== 'questions') throw new Error('Invalid essay question pool path.');
    const {readQuestion} = require('../functions/features/essay_question_generator/domain/essay_question');
    const scope = {level: parts[1], standard: Number(parts[3]), language: decodeURIComponent(parts[5])};
    readQuestion(Object.fromEntries(Object.entries(doc.fields).map(([key, value]) => [key, decode(value)])), scope, id);
    writes.push({update: {name: `${ROOT}/essayQuestionSnapshots/${id}`, fields: {...doc.fields,
      level: string(parts[1]), standard: {integerValue: parts[3]}, language: string(decodeURIComponent(parts[5]))}}, currentDocument: {exists: false}});
  }
  for (const [name, fields] of history) if (!types.has(name)) writes.push({update: {name, fields}, currentDocument: {exists: false}});
  for (const doc of questions) {
    if (!doc.name.startsWith(`${ROOT}/essayQuestionGenerator/`) || !doc.updateTime) throw new Error('Refusing a delete outside the essay pool.');
    const id = doc.name.split('/').at(-1);
    if (!retired.has(id)) writes.push({update: {name: `${ROOT}/essayQuestionRetirements/${id}`, fields: {clearedAt: {timestampValue: now}}}, currentDocument: {exists: false}});
    writes.push({delete: doc.name, currentDocument: {updateTime: doc.updateTime}});
    writes.push({delete: `${ROOT}/essayQuestionGenerator/questionIndex/entries/${id}`});
  }
  return {summary: {questionsToDelete: questions.length, referencedQuestionsFrozen: required.size,
    newSnapshots: [...required].filter(id => !frozen.has(id)).length, studentMetadataUpdates: writes.filter(w => w.updateMask).length,
    newRetirementMarkers: questions.filter(doc => !retired.has(doc.name.split("/").at(-1))).length,
    newTypeHistoryEntries: [...history.keys()].filter(name => !types.has(name)).length, writes: writes.length}, writes};
}
function createStore(request) {
  const base = 'https://firestore.googleapis.com/v1/'+ROOT;
  const query = async (collectionId, allDescendants = false) => (await request(base+':runQuery', {structuredQuery: {from: [{collectionId, allDescendants}]}})).filter(item => item.document).map(item => item.document);
  return {
    async inventory() {
      const [allQuestions, assigned, completed, practices, allUsage, oldSnapshots, oldTypes, questionUsage, retirements, practiceJobs, assessmentJobs] = await Promise.all([
        query('questions',true), query('assignedEssayPractices',true), query('completedEssayPractices',true), query('essayPractices'),
        query('items',true), query('essayQuestionSnapshots'), query('typeHistory',true), query('questionUsage',true), query('essayQuestionRetirements'), query('completions',true), query('subjectAssessmentGenerations'),
      ]);
      const activeGenerations = [...practiceJobs.filter(doc => doc.name.includes('/studentEssayPracticeGenerations/')), ...assessmentJobs].filter(doc => doc.fields?.status?.stringValue === 'generating' && Date.parse(doc.fields?.leaseUntil?.timestampValue || 0) > Date.now()).length;
      return {activeGenerations, questions: allQuestions.filter(doc => doc.name.startsWith(ROOT+'/essayQuestionGenerator/')),
        references: [...assigned, ...completed, ...practices], usage: [...questionUsage, ...allUsage.filter(doc => doc.name.startsWith(ROOT+'/studentSubjectAssessmentUsage/'))],
        snapshots: oldSnapshots, typeHistory: oldTypes, retirements};
    },
    async maintenance(active, owner) {
      const name = ROOT+'/essayConfig/poolMaintenance';
      let current;
      try {current = await request(base+'/essayConfig/poolMaintenance', undefined, 'GET');}
      catch(error) {if(error.response?.status !== 404) throw error;}
      if (active && current?.fields?.active?.booleanValue) throw new Error('Another essay pool clear is already running.');
      if (!active && current?.fields?.owner?.stringValue !== owner) throw new Error('Maintenance ownership changed; refusing to release another clear.');
      await request(base+':commit', {writes: [{update: {name, fields: {active: {booleanValue: active}, owner: string(owner), updatedAt: {timestampValue: new Date().toISOString()}}},
        currentDocument: current ? {updateTime: current.updateTime} : {exists: false}}]});
    },
    async apply(plan) {
      // Small releases are atomic. Larger pools fail explicitly rather than partially clearing referenced content.
      if (plan.writes.length > 450) throw new Error('More than 450 writes are required; use a reviewed batched migration.');
      if (plan.writes.length) await request(base+':commit', {writes: plan.writes});
    },
  };
}
async function main(args) {
  const apply = args.includes('--apply'), reportAt = args.indexOf('--report'), reportPath = args[reportAt+1];
  if (reportAt < 0 || !reportPath || args.some(arg => !['--apply','--report',reportPath].includes(arg))) throw new Error('Usage: node scripts/clear-essay-question-pool.cjs --report /path/report.json [--apply]');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('The production clear cannot run with emulator settings.');
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 'null');
  if (credentials?.project_id !== 'readyherox') throw new Error('Configured readyherox credentials are required.');
  const {GoogleAuth} = require('node:module').createRequire(path.resolve(__dirname,'../../.rhx-tools/package.json'))('google-auth-library');
  const client = await new GoogleAuth({credentials, scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
  const store = createStore(async (url,data,method = 'POST') => (await client.request({url,data,method,timeout:60000,retry:false})).data);
  const owner = randomUUID(), report = {project:'readyherox', startedAt:new Date().toISOString(), apply, owner, status:'preview'};
  const save = () => {fs.mkdirSync(path.dirname(path.resolve(reportPath)),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});};
  let locked = false;
  try {
    if (apply) {await store.maintenance(true,owner);locked=true;}
    const inventory = await store.inventory();
    if (apply && inventory.activeGenerations) throw new Error('Essay generation is still active. Retry the clear after it finishes.');
    const plan = planClear(inventory);
    Object.assign(report,plan.summary); save(); console.log(JSON.stringify({apply,...plan.summary}));
    if (apply) {
      await store.apply(plan);
      const verified = await store.inventory();
      if (verified.questions.length) throw new Error('Verification found essay questions remaining in the pool.');
      report.status = 'complete';report.completedAt=new Date().toISOString();report.remainingQuestions=0;save();
      console.log(JSON.stringify({status:'complete',deletedQuestions:plan.summary.questionsToDelete,remainingQuestions:0}));
    }
  } catch (error) {report.status='failed';report.error='Pool clear did not finish. Inspect the current preview before retrying.';save();throw error;}
  finally {if(locked) {await store.maintenance(false,owner);report.maintenanceReleased=true;save();}}
}
module.exports = {planClear, createStore};
if(require.main === module) main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({failed:true,status:error.response?.status,message:error.response?'The backend rejected the pool clear request.':error.message}));process.exitCode=1;});
