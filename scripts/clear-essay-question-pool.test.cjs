const assert=require('node:assert/strict'), test=require('node:test');
const {planClear}=require('./clear-essay-question-pool.cjs');
const root='projects/readyherox/databases/(default)/documents';
const question=id=>({name:`${root}/essayQuestionGenerator/primary/standards/3/languages/English/questions/${id}`,updateTime:'2026-11-12T00:00:00Z',fields:{questionText:{stringValue:'Write something'},seedUsed:{stringValue:'Kindness'},difficulty:{stringValue:'medium'},generatedAt:{timestampValue:'2026-11-11T00:00:00Z'}}});
test('clear removes only pool questions and index entries, freezes referenced content and backfills lifetime type history',()=>{
 const q=question('used'), unused=question('unused');
 const refs=[{name:`${root}/studentEssayPractices/student/completedEssayPractices/attempt`,updateTime:q.updateTime,fields:{essayQuestionId:{stringValue:'used'}}}];
 const plan=planClear({questions:[q,unused],references:refs,usage:[]});
 assert.equal(plan.summary.questionsToDelete,2);assert.equal(plan.summary.newSnapshots,1);assert.equal(plan.summary.newTypeHistoryEntries,1);
 assert.equal(plan.writes.filter(w=>w.delete).length,4);
 assert.ok(plan.writes.filter(w=>w.delete).every(w=>w.delete.includes('/essayQuestionGenerator/')));
 assert.equal(plan.writes.find(w=>w.update?.name===root+'/essayQuestionSnapshots/used').update.fields.level.stringValue,'primary');
 assert.equal(plan.writes.some(w=>w.update?.name.endsWith('/essayQuestionSnapshots/unused')),false);
 assert.ok(plan.writes.some(w=>w.update?.name.endsWith('/typeHistory/normalEssay')));
 assert.equal(plan.writes.some(w=>w.delete?.includes('/studentEssayPractices/')),false);
});
test('clear is resumable and retains prior type history and frozen snapshots',()=>{
 const q=question('used');const plan=planClear({questions:[q],references:[{name:root+'/studentEssayPractices/student/assignedEssayPractices/a',updateTime:q.updateTime,fields:{essayQuestionId:{stringValue:'used'}}}],usage:[],
 snapshots:[{name:root+'/essayQuestionSnapshots/used'}],typeHistory:[{name:root+'/studentEssayPractices/student/typeHistory/normalEssay'}]});
 assert.equal(plan.summary.newSnapshots,0);assert.equal(plan.summary.newTypeHistoryEntries,0);
 assert.ok(plan.writes.find(w=>w.delete===q.name).currentDocument.updateTime);
});
