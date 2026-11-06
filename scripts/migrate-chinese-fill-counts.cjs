// Read-only by default. Derive public Chinese length metadata from protected model answers.
const {isChineseLanguage, characterCount, passageCollection, scope} = require('../functions/features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks');
function decode(fields={}) {return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,
 'stringValue'in value?value.stringValue:'integerValue'in value?Number(value.integerValue):'doubleValue'in value?value.doubleValue:
 'booleanValue'in value?value.booleanValue:'mapValue'in value?decode(value.mapValue.fields):
 'arrayValue'in value?(value.arrayValue.values||[]).map(item=>decode({item}).item):null]));}
async function list(client,path) {
 const documents=[];let pageToken;
 do {const body=(await client.get(path,{queryParams:{pageSize:300,...(pageToken?{pageToken}:{})}})).body;
  documents.push(...(body.documents||[]));pageToken=body.nextPageToken;
 } while(pageToken);
 return documents;
}
async function get(client,path) {try{return(await client.get(path)).body;}catch(error){if(error.status===404)return null;throw error;}}
async function migrateChineseFillCounts({client,project,apply=false}) {
 const database=`projects/${project}/databases/(default)`,base=database+'/documents';
 const indexes=await list(client,base+'/fillInTheBlanksQuestionGenerator/passageIndex/entries');
 const plans=[],conflicts=[];
 let scannedChinesePassages=0;
 for(const index of indexes) {
  const savedScope=decode(index.fields);if(!isChineseLanguage(savedScope.language))continue;
  scannedChinesePassages++;
  const passageId=index.name.split('/').at(-1),selected=scope(savedScope),path=base+'/'+passageCollection(selected)+'/'+passageId;
  const [passage,questions,key]=await Promise.all([get(client,path),list(client,path+'/questionItems'),get(client,path+'/private/answerKey')]);
  const data=decode(passage?.fields),answers=decode(key?.fields).answers;
  const problem=message=>conflicts.push({passageId,reason:message});
  if(!passage||!key||!answers) {problem('Passage or protected answer key is missing.');continue;}
  if(data.format!=='fillInTheBlanks'||!isChineseLanguage(data.language)||data.syllabusId!==selected.syllabusId||data.topicId!==selected.topicId) {problem('The saved scope does not match its Chinese passage index.');continue;}
  if(!questions.length||questions.length!==data.questionCount||Object.keys(answers).length!==questions.length) {problem('Question count does not match the protected answer key.');continue;}
  const changes=[];let invalid=false;
  for(const question of questions) {
   const questionId=question.name.split('/').at(-1),answer=answers[questionId];
   if(typeof answer!=='string'||!answer.trim()||answer.length>1000) {problem('A protected model answer is missing or invalid.');invalid=true;break;}
   const count=characterCount(answer);
   if(count<1) {problem('A protected model answer has no countable characters.');invalid=true;break;}
   if(decode(question.fields).requiredCharacterCount!==count) changes.push({question,questionId,requiredCharacterCount:count});
  }
  if(!invalid)plans.push({passageId,index,passage,key,changes});
 }
 const report={project,mode:apply?'apply':'dry-run',scannedChinesePassages,passagesNeedingUpdate:plans.filter(p=>p.changes.length).length,
  questionsToUpdate:plans.reduce((sum,p)=>sum+p.changes.length,0),conflicts,appliedPassages:0,
  changes:plans.filter(p=>p.changes.length).map(p=>({passageId:p.passageId,questions:p.changes.map(({questionId,requiredCharacterCount})=>({questionId,requiredCharacterCount}))}))};
 if(apply&&conflicts.length) {report.blocked='Resolve the reported metadata conflicts first. No changes applied.';return report;}
 if(apply)for(const plan of plans.filter(p=>p.changes.length)) {
  const writes=[...plan.changes.map(change=>({update:{name:change.question.name,fields:{requiredCharacterCount:{integerValue:String(change.requiredCharacterCount)}}},
   updateMask:{fieldPaths:['requiredCharacterCount']},currentDocument:{updateTime:change.question.updateTime}})),
   ...[plan.index,plan.passage,plan.key].map(doc=>({verify:doc.name,currentDocument:{updateTime:doc.updateTime}}))];
  if(writes.length>450)throw Error('Passage is too large for one conditional metadata commit.');
  await client.post(database+'/documents:commit',{writes});report.appliedPassages++;
 }
 return report;
}
async function main() {
 const args=process.argv.slice(2);if(args.length>1||args.some(arg=>arg!=='--apply'))throw Error('Usage: migrate-chinese-fill-counts.cjs [--apply]');
 const dependencies=require(process.env.RHX_FIREBASE_DEPENDENCIES),firebase=require('node:module').createRequire(dependencies['firebase-tools'].entry);
 await firebase(dependencies['firebase-tools'].directory+'/lib/requireAuth').requireAuth({project:'readyherox',nonInteractive:true});
 const {Client}=firebase(dependencies['firebase-tools'].directory+'/lib/apiv2');
 const report=await migrateChineseFillCounts({client:new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'}),project:'readyherox',apply:args.includes('--apply')});
 process.stdout.write(JSON.stringify(report,null,2)+'\n',()=>process.exit(report.blocked?2:0));
}
if(require.main===module)main().catch(error=>process.stderr.write('Chinese count migration failed: '+(error.status||error.code||'unknown')+' '+(error.context?.body?.error?.message||error.message)+'\n',()=>process.exit(1)));
module.exports={migrateChineseFillCounts};
