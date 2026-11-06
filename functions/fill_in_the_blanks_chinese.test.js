const {test}=require('node:test'),assert=require('node:assert/strict');
const backend=require('./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks');
const {markPassage}=require('./features/fill_in_the_blanks_scoring/application/mark_passage');
const {buildPassagePrompt}=require('./features/fill_in_the_blanks_question_generator/application/build_passage_prompt');
const settings={questionsPerPassage:1,imageEnabled:false};
const generated={passageText:'我们去{{q1}}。',summary:'学校生活',questions:[{questionId:'q1',correctAnswer:'学校',requiredWordCount:1,requiredCharacterCount:1}]};
for(const layer of ['backend','web']) {
 const core=async()=>layer==='backend'?backend:import('../public/features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js');
 test(layer+': Chinese language labels and Unicode character lengths',async()=>{
  const c=await core();
  for(const value of ['Chinese','chinese','Chinese (Simplified)','Traditional Chinese','Mandarin','zh','zh_CN','zh-Hant','中文','中文（简体）','华文','華語'])assert.equal(c.isChineseLanguage(value),true,value);
  for(const value of ['English','Tamil','Bahasa Melayu','Japanese',undefined])assert.equal(c.isChineseLanguage(value),false);
  for(const [value,count] of [['学校',2],['图书馆',3],['𠮷野家',3],['学 校！',2],['２０２６',4],['AI 老师 2026。',8],['， 。 !',0]])assert.equal(c.characterCount(value),count,value);
 });
 test(layer+': generated Chinese counts come from the answer and other languages keep words',async()=>{
  const c=await core(),before=structuredClone(generated);
  const passage=c.validateGenerated(generated,settings,'Chinese');
  assert.equal(passage.questions[0].requiredCharacterCount,2);assert.equal(passage.questions[0].requiredWordCount,1);
  assert.equal(c.requiredAnswerLength(passage.questions[0],'Chinese'),2);assert.equal(c.answerLengthUnit('Chinese',passage.questions[0]),'characters');
  assert.deepEqual(generated,before);
  for(const [language,answer,count] of [['English','the dog',2],['Tamil','தமிழ் மொழி',2],['Bahasa Melayu','rumah saya',2]]){
   const value=c.validateGenerated({...generated,questions:[{questionId:'q1',correctAnswer:answer}]},settings,language).questions[0];
   assert.equal(value.requiredWordCount,count);assert.equal(value.requiredCharacterCount,undefined);assert.equal(c.answerLengthUnit(language,value),'words');
  }
 });
 test(layer+': Chinese submission validation uses characters with and without a language argument',async()=>{
  const c=await core(),q=c.validateGenerated(generated,settings,'Chinese').questions;
  for(const language of ['Chinese',undefined]){
   assert.equal(c.validateAnswers(q,{q1:'学 校'},language).q1,'学 校');
   assert.equal(c.validateAnswers(q,{q1:''},language).q1,'');
   assert.throws(()=>c.validateAnswers(q,{q1:'大学校'},language),/requires 2 character/);
  }
  assert.throws(()=>c.validateAnswers([{questionId:'q1',position:1,requiredWordCount:1}],{q1:'学校'},'Chinese'),/refreshed character counts/);
 });
 test(layer+': private legacy answers derive counts while the public projection hides answers',async()=>{
  const c=await core(),old={language:'Chinese',questions:[{questionId:'q1',position:1,requiredWordCount:1,correctAnswer:'图书馆'}]};
  const counted=c.normalisePassageAnswerLengths(old);
  assert.equal(counted.questions[0].requiredCharacterCount,3);assert.equal(old.questions[0].requiredCharacterCount,undefined);
  const visible=c.publicPassage(counted);assert.equal(visible.questions[0].requiredCharacterCount,3);assert.equal(visible.questions[0].correctAnswer,undefined);
  assert.equal(c.requiredAnswerLength({correctAnswer:'图书馆',requiredWordCount:1},'Chinese'),3);
  assert.equal(c.requiredAnswerLength({requiredWordCount:1},'Chinese'),null);
 });
}
test('Chinese static matching ignores inter-character spaces and supplementary characters count once',async()=>{
 const passage={language:'Chinese',...backend.validateGenerated({...generated,questions:[{questionId:'q1',correctAnswer:'𠮷野家'}]},settings,'Chinese')};
 const result=await markPassage({passage,answers:{q1:'𠮷 野 家'},generateText:()=>assert.fail('No model call needed')});
 assert.equal(result.score,100);assert.equal(result.answers.q1.markingMethod,'static');
});
test('Chinese alternative marking receives character counts and rejects wrong lengths before calling the model',async()=>{
 const passage={language:'Chinese',grade:4,difficulty:'medium',...backend.validateGenerated(generated,settings,'Chinese')};
 let calls=0;
 const generateText=async prompt=>{calls++;assert.match(prompt,/required number of Chinese characters/);const data=JSON.parse(prompt.slice(prompt.indexOf('\n')+1));
  assert.equal(data.answers[0].requiredCharacterCount,2);assert.equal(data.answers[0].requiredWordCount,undefined);
  return {answers:[{questionId:'q1',isCorrect:true}]};};
 assert.equal((await markPassage({passage,answers:{q1:'校园'},generateText})).score,100);
 await assert.rejects(markPassage({passage,answers:{q1:'大学校'},generateText}),/requires 2 character/);assert.equal(calls,1);
});
test('Chinese generation prompts request characters while other languages request words',async()=>{
 const web=await import('../public/features/fill_in_the_blanks_question_generator/application/build_passage_prompt.js');
 for(const build of [buildPassagePrompt,web.buildPassagePrompt]){
  const input={criteria:{language:'Chinese',difficulty:'medium'},topicName:'词汇',settings,configuration:backend.normaliseConfig(),summaries:[]};
  const chinese=build(input);assert.match(chinese,/requiredCharacterCount/);assert.match(chinese,/'学校' has 2/);assert.doesNotMatch(chinese,/Count whitespace-separated words/);
  const english=build({...input,criteria:{language:'English',difficulty:'medium'}});assert.match(english,/Count whitespace-separated words/);assert.match(english,/requiredWordCount/);
 }
});
