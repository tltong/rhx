const {test}=require('node:test'),assert=require('node:assert/strict');
const {migrateChineseFillCounts}=require('./migrate-chinese-fill-counts.cjs');
const base='projects/demo-counts/databases/(default)/documents',stamp='2026-11-05T10:00:00Z';
const str=v=>({stringValue:v}),int=v=>({integerValue:String(v)}),map=fields=>({mapValue:{fields}});
function fixture({language='chinese',answer='学校',missingKey=false,stale=false}={}){
 const path=base+'/fillInTheBlanksQuestions/s/topics/t/languages/'+language+'/passages/p',documents=new Map(),writes=[];
 const put=(name,fields)=>documents.set(name,{name,fields,updateTime:stamp});
 put(base+'/fillInTheBlanksQuestionGenerator/passageIndex/entries/p',{syllabusId:str('s'),topicId:str('t'),language:str(language)});
 put(path,{format:str('fillInTheBlanks'),syllabusId:str('s'),topicId:str('t'),language:str(language),questionCount:int(1)});
 put(path+'/questionItems/q1',{position:int(1),requiredWordCount:int(1)});
 if(!missingKey)put(path+'/private/answerKey',{answers:map({q1:str(answer)})});
 const client={async get(name){if(documents.has(name))return {body:structuredClone(documents.get(name))};
  if(['/entries','/questionItems'].some(s=>name.endsWith(s)))return {body:{documents:[...documents.values()].filter(d=>d.name.startsWith(name+'/')&&!d.name.slice(name.length+1).includes('/')).map(d=>structuredClone(d))}};
  throw Object.assign(Error('Missing'),{status:404});},
 async post(name,body){assert.equal(name,'projects/demo-counts/databases/(default)/documents:commit');
  if(stale)throw Object.assign(Error('Concurrent edit'),{code:'FAILED_PRECONDITION'});
  for(const write of body.writes){const doc=documents.get(write.update?.name||write.verify);assert.equal(write.currentDocument.updateTime,doc.updateTime);}
  writes.push(body);for(const write of body.writes)if(write.update)Object.assign(documents.get(write.update.name).fields,write.update.fields);
 }};
 return {client,documents,writes,path};
}
test('dry-run derives characters without exposing answers or writing data',async()=>{
 const f=fixture(),r=await migrateChineseFillCounts({client:f.client,project:'demo-counts'});
 assert.equal(r.questionsToUpdate,1);assert.equal(r.changes[0].questions[0].requiredCharacterCount,2);assert.equal(r.appliedPassages,0);assert.deepEqual(f.writes,[]);
 assert.equal(JSON.stringify(r).includes('学校'),false);
});
test('apply changes only the public character metadata with preconditions and replays idempotently',async()=>{
 const f=fixture(),before=structuredClone(f.documents.get(f.path+'/private/answerKey'));
 const r=await migrateChineseFillCounts({client:f.client,project:'demo-counts',apply:true});assert.equal(r.appliedPassages,1);
 const patch=f.writes[0].writes[0];assert.deepEqual(patch.updateMask.fieldPaths,['requiredCharacterCount']);assert.deepEqual(patch.update.fields,{requiredCharacterCount:int(2)});
 assert.ok(f.writes[0].writes.every(write=>write.currentDocument.updateTime===stamp));
 assert.deepEqual(f.documents.get(f.path+'/private/answerKey'),before);assert.equal(f.documents.get(f.path+'/questionItems/q1').fields.requiredWordCount.integerValue,'1');
 assert.equal((await migrateChineseFillCounts({client:f.client,project:'demo-counts',apply:true})).appliedPassages,0);
});
test('existing long Chinese answers keep their full length',async()=>{
 const f=fixture({answer:'中'.repeat(40)}),r=await migrateChineseFillCounts({client:f.client,project:'demo-counts'});
 assert.equal(r.changes[0].questions[0].requiredCharacterCount,40);
});
test('non-Chinese passages are left untouched',async()=>{
 const f=fixture({language:'english',answer:'the dog'}),r=await migrateChineseFillCounts({client:f.client,project:'demo-counts',apply:true});
 assert.equal(r.scannedChinesePassages,0);assert.equal(r.questionsToUpdate,0);assert.deepEqual(f.writes,[]);
});
test('missing keys or invalid answers block application without writes',async()=>{
 for(const options of [{missingKey:true},{answer:'，。'}]){
  const f=fixture(options),r=await migrateChineseFillCounts({client:f.client,project:'demo-counts',apply:true});
  assert.ok(r.blocked);assert.equal(r.conflicts.length,1);assert.deepEqual(f.writes,[]);
 }
});
test('a concurrent edit prevents metadata overwrite',async()=>{
 const f=fixture({stale:true});await assert.rejects(migrateChineseFillCounts({client:f.client,project:'demo-counts',apply:true}),/Concurrent edit/);assert.deepEqual(f.writes,[]);
});
