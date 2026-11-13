const assert=require('node:assert/strict'),test=require('node:test');
const {Firestore}=require('firebase-admin/firestore');
const {createStore,planClear}=require('../scripts/clear-essay-question-pool.cjs');
const {FirestoreEssayQuestionGeneratorRepository}=require('./features/essay_question_generator/infrastructure/firestore_essay_question_generator_repository');
const {loadStudentEssayHistory}=require('./features/essay_question_generator/infrastructure/student_essay_history');
const host=process.env.FIRESTORE_EMULATOR_HOST;
test('actual clear commit is atomic, removes the reusable pool, retains referenced snapshots and standalone history',{skip:!host},async()=>{
 assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/);
 const projectId='demo-rhx-essay-clear',db=new Firestore({projectId});
 await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,{method:'DELETE'});
 const request=async(url,data,method='POST')=>{
  const local=url.replace('https://firestore.googleapis.com',`http://${host}`).replaceAll('projects/readyherox/','projects/'+projectId+'/');
  const response=await fetch(local,{method,headers:{'content-type':'application/json',authorization:'Bearer owner'},...(data?{body:JSON.stringify(data).replaceAll('projects/readyherox/','projects/'+projectId+'/')}:{})});
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error?.message||'Request failed'),{response:{status:response.status}});
  return JSON.parse(JSON.stringify(result).replaceAll('projects/'+projectId+'/','projects/readyherox/'));
 };
 const store=createStore(request),collection='essayQuestionGenerator/primary/standards/3/languages/English/questions';
 try{
  await db.doc('essayQuestionGenerator/config').set({additionalLlmInstructions:'Keep me'});
  for(const id of ['used','unused']){
   await db.doc(collection+'/'+id).set({questionText:'Write about '+id,seedUsed:'Theme '+id,difficulty:'medium',generatedAt:new Date()});
   await db.doc('essayQuestionGenerator/questionIndex/entries/'+id).set({documentPath:collection+'/'+id});
  }
  const assigned='studentEssayPractices/student/assignedEssayPractices/attempt';
  await db.doc(assigned).set({essayQuestionId:'used',syllabusId:'s',topicId:'t',assignedAt:new Date()});
  await db.doc('studentEssayPractices/student/questionUsage/used').set({essayPracticeId:'attempt',syllabusId:'s',topicId:'t',assignedAt:new Date()});
  await store.maintenance(true,'test-owner');
  await assert.rejects(store.maintenance(true,'other-owner'),/already running/);
  let inventory=await store.inventory(),plan=planClear(inventory);
  assert.equal(plan.summary.questionsToDelete,2);assert.equal(plan.summary.newSnapshots,1);
  await db.doc(collection+'/used').update({questionText:'Changed concurrently'});
  await assert.rejects(store.apply(plan));
  assert.equal((await db.doc('essayQuestionSnapshots/used').get()).exists,false,'Failed precondition leaves no partial snapshot');
  assert.equal((await db.collection(collection).get()).size,2);
  plan=planClear(await store.inventory());await store.apply(plan);
  assert.equal((await store.inventory()).questions.length,0);
  assert.equal((await db.doc('essayQuestionGenerator/config').get()).data().additionalLlmInstructions,'Keep me');
  assert.equal((await db.doc(assigned).get()).data().essayTypeId,'normalEssay');
  assert.equal((await db.doc('studentEssayPractices/student/typeHistory/normalEssay').get()).exists,true);
  const repository=new FirestoreEssayQuestionGeneratorRepository({getFirestoreDb:()=>db,readDocument:async(collection,id)=>(await db.doc(collection+"/"+id).get()).data()||null});
  assert.equal((await repository.getQuestionById('used')).questionText,'Changed concurrently');
  assert.equal(await repository.getQuestionById('unused'),null);
  const history=await loadStudentEssayHistory('student',{getDb:()=>db,getQuestion:()=>{throw new Error('Self-contained history must not read the cleared pool');}});
  assert.ok(history.typeIds.has('normalEssay'));assert.ok(history.themes.has('theme used'));
  await store.maintenance(false,'test-owner');
  assert.equal((await db.doc('essayConfig/poolMaintenance').get()).data().active,false);
  assert.equal((await db.doc('essayQuestionRetirements/used').get()).exists,true);
  const frozen=await repository.getQuestionById('used');
  await assert.rejects(repository.saveQuestion({...frozen,seed:frozen.seedUsed}),error=>error.code==='essay-question-not-in-pool');
  assert.equal((await db.collection(collection).get()).size,0,'A cached draft cannot repopulate the cleared pool');
 }finally{await db.terminate();}
});
