import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {chooseEssayType, typeSelectionAllowed, eligibleEssayTypeIds} from './domain/essay_type_selection.js';
import {fromLegacyConfiguration} from './domain/essay_config.js';
const require = createRequire(import.meta.url);
const {selectStudentEssayQuestion} = require('../../../functions/features/essay_question_generator/application/select_student_essay_question');
const {SubjectAssessmentContentPool} = require('../../../functions/features/subject_assessment_generator/infrastructure/subject_assessment_content_pool');
const {AssignEssayPracticeToStudent} = require('../../../functions/features/student_essay_practice/application/assign_essay_practice_to_student');
const configuration = () => {
  const config = fromLegacyConfiguration();
  for (const level of ['primary','secondary']) for (let standard=1;standard<=6;standard++) config.gradeSettings[level][standard].essayTypes = ['normalEssay','finishTheStory','replyToEmail'].map(essayTypeId=>({essayTypeId,pictureEnabled:false}));
  return config;
};
const criteria={level:'primary',standard:3,language:'English',difficulty:'medium'};
const history=()=>({questionIds:new Set(),typeIds:new Set(['normalEssay']),themes:new Set(['friendship'])});
test('available types are used once before random selection; lifetime history crosses grades and languages',()=>{
  const config=configuration(), used=new Set();
  const eligible=eligibleEssayTypeIds(config,criteria);
  assert.equal(chooseEssayType(eligible,used,()=>0),'normalEssay');used.add('normalEssay');
  assert.equal(chooseEssayType(eligible,used,()=>0),'finishTheStory');used.add('finishTheStory');
  assert.equal(chooseEssayType(eligible,used,()=>0),'replyToEmail');used.add('replyToEmail');
  assert.equal(chooseEssayType(eligible,used,()=>0),'normalEssay');
  assert.equal(chooseEssayType(eligible,used,()=>0.99),'replyToEmail');
  assert.equal(typeSelectionAllowed(eligible,new Set(['normalEssay']),'normalEssay'),false);
  assert.equal(typeSelectionAllowed(eligible,used,'normalEssay'),true);
  assert.equal(chooseEssayType(eligibleEssayTypeIds(config,{...criteria,level:'secondary',standard:6,language:'Tamil'}),new Set(['normalEssay','finishTheStory']),()=>0),'replyToEmail');
});
test('initial assignment selects an unused type before checking a shared bank; other students can reuse its question',async()=>{
 const config=configuration(), calls=[];
 const questions=[{questionId:'normal',...criteria,essayTypeId:'normalEssay',questionText:'Normal question',seedUsed:'Kindness'},
  {questionId:'story',...criteria,essayTypeId:'finishTheStory',questionText:'Finish it',seedUsed:'Kindness'}];
 const api={getEssayQuestionGeneratorConfig:async()=>config,listEssayQuestions:async()=>({questions,nextCursor:null}),generateEssayQuestion:async()=>{throw new Error('Should reuse a pooled question');}};
 for(const studentId of ['one','two']){
  const result=await selectStudentEssayQuestion({studentId,sourceQuestion:questions[0],syllabusId:'s',topicId:'t'},{api,history:history(),random:()=>0,
    seeds:{getQuestionSeedEntries:async()=>[{value:'Friendship'},{value:'Kindness'}]}});
  assert.equal(result.question.questionId,'story');assert.equal(result.selection.essayTypeId,'finishTheStory');calls.push(result);
 }
 assert.equal(calls[0].question.questionId,calls[1].question.questionId);
});
test('a missing question of the unused type generates that type and respects theme exclusions',async()=>{
 let generated;
 const config=configuration();
 const result=await selectStudentEssayQuestion({studentId:'student',sourceQuestion:{...criteria}},{history:history(),random:()=>0,
  api:{getEssayQuestionGeneratorConfig:async()=>config,listEssayQuestions:async()=>({questions:[],nextCursor:null}),generateEssayQuestion:async input=>(generated=input,{questionId:'new',...input,seedUsed:input.seed})},
  seeds:{getQuestionSeedEntries:async()=>[{value:'Friendship'},{value:'Kindness'}]}});
 assert.equal(generated.essayTypeId,'finishTheStory');assert.equal(generated.seed,'Kindness');assert.equal(result.question.questionId,'new');
});
test('each essay in the same assessment consumes a type before reuse, including resumable checkpoints',async()=>{
 const config=configuration();
 const pool=new SubjectAssessmentContentPool({studentId:'student',syllabus:{level:'primary',year:3}}, {getEssayConfiguration:async()=>config,loadStudentEssayHistory:async()=>history(),random:()=>0});
 const slot={questionType:'essay',topicId:'writing',difficulty:'medium'};
 let selected=await pool.selectSlot(slot);assert.equal(selected.essayTypeId,'finishTheStory');
 await pool.recordSelection({questionType:'essay',contentSnapshot:{essayTypeId:selected.essayTypeId,seedUsed:'Kindness'}});
 selected=await pool.selectSlot(slot,{contentSnapshot:{essayTypeId:'normalEssay'}});assert.equal(selected.essayTypeId,'replyToEmail');
 await pool.recordSelection({questionType:'essay',contentSnapshot:{essayTypeId:selected.essayTypeId}});
 assert.equal((await pool.selectSlot(slot)).essayTypeId,'normalEssay');
});
test('initial assignment retries a stale type selection rather than assigning the used type',async()=>{
 let attempts=0, preparations=0;
 const useCase=new AssignEssayPracticeToStudent({getEssayQuestionById:async()=>({questionId:'source'}),
  prepareForStudent:async()=>({question:{questionId:'selected-'+(++preparations)},selection:{essayTypeId:'finishTheStory'}}),
  repository:{assign:async(input,context)=>{assert.equal(context.preventQuestionReuse,true);if(++attempts===1)throw Object.assign(new Error('Conflict'),{code:'essay-type-selection-conflict'});return input;}}});
 const result=await useCase.execute({studentId:'student',essayQuestionId:'source',syllabusId:'s',topicId:'t'});
 assert.equal(result.essayQuestionId,'selected-2');assert.equal(preparations,2);
});
