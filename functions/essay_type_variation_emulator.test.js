const assert=require('node:assert/strict'),test=require('node:test');
const {Firestore}=require('firebase-admin/firestore');
const {loadStudentEssayHistory,checkStudentEssayTypes}=require('./features/essay_question_generator/infrastructure/student_essay_history');
const {chooseEssayType}=require('./features/essay_config/domain/essay_type_selection');
const {fromLegacyConfiguration,generatorConfiguration}=require('./features/essay_config/domain/essay_config');
const {GenerateSubjectAssessment}=require('./features/subject_assessment_generator/application/generate_subject_assessment');
const {SubjectAssessmentContentPool}=require('./features/subject_assessment_generator/infrastructure/subject_assessment_content_pool');
const {FirestoreSubjectAssessmentGenerationRepository}=require('./features/subject_assessment_generator/infrastructure/firestore_subject_assessment_generation_repository');
const {FirestoreSubjectAssessmentRepository}=require('./features/subject_assessment/infrastructure/firestore_subject_assessment_repository');
const {FirestoreEssayQuestionGeneratorRepository}=require('./features/essay_question_generator/infrastructure/firestore_essay_question_generator_repository');
const {FirestoreStudentContentHistory}=require('./features/subject_assessment_generator/infrastructure/firestore_student_content_history');
const host=process.env.FIRESTORE_EMULATOR_HOST;
test('global type history, concurrent cross-flow assignment, paper slot variation, and history after pool clearing',{skip:!host},async()=>{
 assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/);
 const projectId='demo-rhx-essay-variation',db=new Firestore({projectId});
 await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,{method:'DELETE'});
 const eligibleTypeIds=['normalEssay','finishTheStory','replyToEmail'];
 try{
  const studentId='concurrent';
  const firstAssignedAt=new Date('2020-01-01');
  await db.doc(`studentEssayPractices/${studentId}/typeHistory/normalEssay`).set({firstAssignedAt});
  for (const id of ['practice-question','assessment-question','third']) await db.doc('essayQuestionGenerator/questionIndex/entries/'+id).set({documentPath:'test/'+id});
  const selections=['practice','assessment'].map(source=>({questionId:source+'-question',essayTypeId:'finishTheStory',eligibleTypeIds,usedTypeIds:['normalEssay'],seedUsed:source}));
  const results=await Promise.allSettled(selections.map(selection=>db.runTransaction(async tx=>{
    const commit=await checkStudentEssayTypes(tx,db,studentId,[selection]);commit();
  })));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'essay-type-selection-conflict');
  let history=await loadStudentEssayHistory(studentId,{getDb:()=>db});
  assert.equal(history.questionIds.size,1);assert.equal(chooseEssayType(eligibleTypeIds,history.typeIds,()=>0),'replyToEmail');
  await db.runTransaction(async tx=>(await checkStudentEssayTypes(tx,db,studentId,[{questionId:'third',essayTypeId:'replyToEmail',eligibleTypeIds,usedTypeIds:[...history.typeIds],seedUsed:'third'}]))());
  history=await loadStudentEssayHistory(studentId,{getDb:()=>db});
  assert.equal(chooseEssayType(eligibleTypeIds,history.typeIds,()=>0),'normalEssay');
  await assert.rejects(db.runTransaction(async tx=>(await checkStudentEssayTypes(tx,db,studentId,[{questionId:'third',essayTypeId:'normalEssay',eligibleTypeIds,seedUsed:'third'}]))()),error=>error.code==='essay-question-already-used');
  assert.equal((await db.doc(`studentEssayPractices/${studentId}/typeHistory/normalEssay`).get()).data().firstAssignedAt.toDate().getTime(),firstAssignedAt.getTime());
  // Initial pre-assessments use the same global history and preserve retry identity.
  const {AssignEssayPracticeToStudent}=require('./features/student_essay_practice/application/assign_essay_practice_to_student');
  const {FirestoreStudentEssayPracticeRepository}=require('./features/student_essay_practice/infrastructure/firestore_student_essay_practice_repository');
  const {selectStudentEssayQuestion}=require('./features/essay_question_generator/application/select_student_essay_question');
  const initialStudent='initial';
  await db.doc(`studentEssayPractices/${initialStudent}/typeHistory/normalEssay`).set({firstAssignedAt});
  const initialConfig=fromLegacyConfiguration(); initialConfig.gradeSettings.primary[3].essayTypes=eligibleTypeIds.map(essayTypeId=>({essayTypeId,pictureEnabled:false}));
  const bank=eligibleTypeIds.map((essayTypeId,index)=>({questionId:'bank-'+index,level:'primary',standard:3,language:'English',difficulty:'medium',essayTypeId,seedUsed:'Theme '+index}));
  for (const question of bank) await db.doc('essayQuestionGenerator/questionIndex/entries/'+question.questionId).set({documentPath:'test/'+question.questionId});
  const initialApi={getEssayQuestionGeneratorConfig:async()=>initialConfig,listEssayQuestions:async()=>({questions:bank,nextCursor:null}),generateEssayQuestion:async()=>{throw new Error('Initial assignment should reuse the selected type from the pool');}};
  const initialRepo=new FirestoreStudentEssayPracticeRepository({getFirestoreDb:()=>db});
  const initialUseCase=new AssignEssayPracticeToStudent({repository:initialRepo,getEssayQuestionById:async id=>bank.find(q=>q.questionId===id),
   prepareForStudent:input=>selectStudentEssayQuestion({...input,sourceQuestion:bank[0]},{api:initialApi,history:undefined,random:()=>0,
    seeds:{getQuestionSeedEntries:async()=>bank.map(q=>({value:q.seedUsed}))},
   })});
  // Inject the isolated history reader rather than consulting the configured production app.
  initialUseCase.prepareForStudent=async input=>selectStudentEssayQuestion({...input,sourceQuestion:bank[0]},{api:initialApi,history:await loadStudentEssayHistory(initialStudent,{getDb:()=>db}),random:()=>0,seeds:{getQuestionSeedEntries:async()=>bank.map(q=>({value:q.seedUsed}))}});
  const firstInitial=await initialUseCase.execute({studentId:initialStudent,essayQuestionId:'bank-0',syllabusId:'s',topicId:'t',essayPracticeId:'first'});
  assert.equal(firstInitial.essayQuestionId,'bank-1');
  const retryInitial=await initialUseCase.execute({studentId:initialStudent,essayQuestionId:'bank-0',syllabusId:'s',topicId:'t',essayPracticeId:'first'});
  assert.equal(retryInitial.essayQuestionId,'bank-1');
  const nextInitial=await initialUseCase.execute({studentId:initialStudent,essayQuestionId:'bank-0',syllabusId:'another-s',topicId:'another-t',essayPracticeId:'second'});
  assert.equal(nextInitial.essayQuestionId,'bank-2');
  assert.equal((await db.collection(`studentEssayPractices/${initialStudent}/typeHistory`).get()).size,3);
  // One assessment uses each remaining type before returning to random selection.
  const paperStudent='paper';await db.doc('students/'+paperStudent).set({});
  await db.doc(`studentEssayPractices/${paperStudent}/typeHistory/normalEssay`).set({firstAssignedAt});
  const config=fromLegacyConfiguration();config.gradeSettings.primary[3].essayTypes=eligibleTypeIds.map(essayTypeId=>({essayTypeId,pictureEnabled:false}));
  const essayConfig=generatorConfiguration(config),syllabus={id:'syllabus',level:'primary',year:3,subject:'English',topics:[{id:'writing',topicName:'Writing'}]};
  const configuration={syllabusId:'syllabus',language:'English',version:1,topics:[{topicId:'writing',questionType:'essay',totalCount:3,difficultyCounts:{easy:0,medium:3,hard:0}}]};
  const jobs=new FirestoreSubjectAssessmentGenerationRepository({getDb:()=>db}),assessments=new FirestoreSubjectAssessmentRepository({getDb:()=>db});
  const repository=new FirestoreEssayQuestionGeneratorRepository({getFirestoreDb:()=>db,readDocument:async(collection,id)=>(await db.doc(collection+'/'+id).get()).data()||null});
  const engine=new GenerateSubjectAssessment({authorize:async()=>({uid:'admin'}),loadContext:async()=>({configuration,syllabus,topics:[{topicId:'writing',topicName:'Writing',questionType:'essay'}]}),
   jobs,assessments,history:new FirestoreStudentContentHistory({getDb:()=>db}),random:()=>0,
   createPool:run=>new SubjectAssessmentContentPool(run,{getDb:()=>db,random:()=>0,getEssayConfiguration:async()=>essayConfig,
    loadStudentEssayHistory:id=>loadStudentEssayHistory(id,{getDb:()=>db}),getQuestionSeedEntries:async()=>[],getDefaultQuestionSeedTheme:async()=>'Latest news',
    generateText:async()=>({questionText:'Write the requested task.'}),saveEssayQuestion:input=>repository.saveQuestion({...input,seed:input.seedUsed})})});
  const paper=await engine.execute({studentId:paperStudent,syllabusId:'syllabus',language:'English',requestId:'paper-request'});
  assert.deepEqual(paper.items.map(item=>item.contentSnapshot.essayTypeId),['finishTheStory','replyToEmail','normalEssay']);
  assert.ok(paper.items.every(item=>!item.essayTypeSelection));
  assert.equal((await db.collection(`studentEssayPractices/${paperStudent}/typeHistory`).get()).size,3);
  assert.equal((await db.collection(`studentEssayPractices/${paperStudent}/questionUsage`).get()).size,3);
  // Removing the shared pool does not remove historical content or its used-type/seed records.
  const questionDocs=await db.collection('essayQuestionGenerator/primary/standards/3/languages/English/questions').get();
  for(const doc of questionDocs.docs){
   await db.doc('essayQuestionSnapshots/'+doc.id).set({...doc.data(),level:'primary',standard:3,language:'English'});
   await doc.ref.delete();await db.doc('essayQuestionGenerator/questionIndex/entries/'+doc.id).delete();
  }
  assert.equal((await repository.listQuestions({level:'primary',standard:3,language:'English',limit:100})).questions.length,0);
  assert.equal((await repository.getQuestionById(questionDocs.docs[0].id)).questionText,'Write the requested task.');
  await assert.rejects(db.runTransaction(async tx=>(await checkStudentEssayTypes(tx,db,paperStudent,[{questionId:questionDocs.docs[0].id,essayTypeId:'normalEssay',eligibleTypeIds,seedUsed:'cleared'}]))()),error=>error.code==='essay-question-not-in-pool');
  const invalidated=await new SubjectAssessmentContentPool({studentId:paperStudent,syllabus:{level:'primary',year:3}}, {getDb:()=>db,random:()=>0,getEssayConfiguration:async()=>essayConfig,loadStudentEssayHistory:id=>loadStudentEssayHistory(id,{getDb:()=>db})}).selectSlot({questionType:'essay',difficulty:'medium'}, {identity:'essay:'+questionDocs.docs[0].id,contentSnapshot:{essayTypeId:'normalEssay'}});
  assert.equal(invalidated.invalidateCheckpoint,true);
  const draftPool=new SubjectAssessmentContentPool({studentId:paperStudent,syllabus:{level:'primary',year:3}}, {getDb:()=>db,random:()=>0,getEssayConfiguration:async()=>essayConfig,loadStudentEssayHistory:id=>loadStudentEssayHistory(id,{getDb:()=>db})});
  const pendingDraft={identity:'essay:pending-draft',contentSnapshot:{essayTypeId:'normalEssay'}};
  assert.equal((await draftPool.selectSlot({questionType:'essay',difficulty:'medium'},pendingDraft,{pooled:false})).invalidateCheckpoint,false);
  await db.doc('essayQuestionRetirements/pending-draft').set({clearedAt:new Date()});
  assert.equal((await draftPool.selectSlot({questionType:'essay',difficulty:'medium'},pendingDraft,{pooled:false})).invalidateCheckpoint,true);
  const after=await loadStudentEssayHistory(paperStudent,{getDb:()=>db,getQuestion:()=>{throw new Error('History must not require the cleared pool');}});
  assert.equal(after.typeIds.size,3);assert.equal(after.questionIds.size,3);assert.ok(after.themes.has('latest news'));
 }finally{await db.terminate();}
});
