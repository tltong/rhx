// Real web feature modules and Firestore; model services are mocked.
const test = require("node:test"), assert = require("node:assert/strict");
test("web Firestore features replace the dedicated HTTP transport", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):\d+$/);
  const {getFirestoreDb} = require("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {FieldValue} = require("firebase-admin/firestore");
  const originalFirebase = globalThis.firebase;
  const admin = {uid: "admin", email: "admin@example.test", emailVerified: true}, student = {uid: "web-student", email: "student@example.test", emailVerified: true};
  const auth = {currentUser: admin};
  const app = {firestore: () => db, auth: () => auth, functions: () => ({httpsCallable: name => async () => {
    assert.equal(name, "isCurrentUserSiteAdmin"); return {data: {isAdmin: auth.currentUser?.uid === admin.uid,
      emailVerified: true, email: auth.currentUser?.email}};
  }})};
  const firestore = () => db; firestore.FieldValue = FieldValue;
  globalThis.firebase = {apps: [], initializeApp: () => app, firestore};
  const llm = await import("../public/utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1");
  const originalProvider = new llm.LlmUtil().getProviderAdapter("deepseek");
  let generationCalls = 0, markingCalls = 0;
  llm.registerLlmProvider("deepseek", {call() {assert.fail("Use the shared text generation API");}, generateText: async prompt => {
    generationCalls++;
    const criteria=JSON.parse(prompt.slice(prompt.indexOf("\n")+1)).criteria;
    if(criteria.language==="chinese") return {passageText:"我们去{{q1}}看{{q2}}。",summary:"中文课堂",imagePrompt:null,
      questions:[{questionId:"q1",correctAnswer:"学校",requiredWordCount:1,requiredCharacterCount:1},{questionId:"q2",correctAnswer:"𠮷野家",requiredWordCount:1,requiredCharacterCount:1}]};
    if (generationCalls > 1 && JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)).criteria.difficulty === "easy") assert.match(prompt, /Web family outing/, "Previously saved summaries inform subsequent generation");
    return {passageText: "We took {{q1}} to the park. It was {{q2}}.", summary: "Web family outing", imagePrompt: null,
      questions: [{questionId: "q1", requiredWordCount: 2, correctAnswer: "the dog"}, {questionId: "q2", requiredWordCount: 1, correctAnswer: "sunny"}]};
  }});
  const {normaliseConfig} = require("./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
  const questions = await import("../public/features/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module.js?v=20261104-fill-firestore-v2");
  const practice = await import("../public/features/fill_in_the_blanks_practice/fill_in_the_blanks_practice_module.js?v=20261104-fill-firestore-v2");
  const session = await import("../public/features/fill_in_the_blanks_practice_session/fill_in_the_blanks_practice_session_module.js?v=20261104-fill-firestore-v2");
  const scoring = await import("../public/features/fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module.js?v=20261104-fill-firestore-v2");
  const {createStudentFillInTheBlanksPracticeFeature} = require("./features/student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module");
  const {createFillInTheBlanksScoringFeature} = require("./features/fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module");
  const {createFillInTheBlanksPracticeSession} = require("./features/fill_in_the_blanks_practice_session/fill_in_the_blanks_practice_session_module");
  const {processFillInTheBlanksSubmission} = require("./triggers/student_fill_in_the_blanks_practice_submission_trigger");
  try {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
    await db.doc("syllabuses/web-english").set({country: "MY", level: "primary", year: 1, subject: "English", active: true, languages: ["English"]});
    await db.doc("syllabuses/web-english/topics/vocabulary").set({topicName: "Vocabulary", pausable: true});
    const config = normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 2}}}});
    await questions.saveFillInTheBlanksQuestionGeneratorConfig(config);
    await scoring.saveFillInTheBlanksScoringConfig({markingInstructions: "Accept contextual alternatives."});
    const input = {syllabusId: "web-english", topicId: "vocabulary", language: "English", difficulty: "easy", passageId: "web-passage", save: false};
    const draft = await questions.generateFillInTheBlanksQuestion(input);
    assert.equal(draft.questions[0].correctAnswer, "the dog");
    assert.equal(generationCalls, 1);
    const saved = await questions.saveFillInTheBlanksQuestion({passageId: draft.passageId});
    assert.equal(saved.questions[0].correctAnswer, undefined);
    assert.ok(saved.generatedAt instanceof Date);
    assert.equal((await questions.generateFillInTheBlanksQuestion(input)).passageId, draft.passageId);
    assert.equal(generationCalls, 1, "Saving/reopening a draft does not call the LLM again");
    const definition = await practice.createFillInTheBlanksPractice({passageId: draft.passageId, practiceId: "web-practice"});
    await t.test("web pre-assessment generation attaches the configured difficulty", async () => {
      await db.doc("syllabuses/web-english/topics/vocabulary").update({assessmentFrameworkIds: {english: "web-framework"}});
      await db.doc("assessmentFrameworks/web-framework").set({name: "Web framework", frameworkType: "fillInTheBlanks", endLevelName: "Mastered"});
      await db.doc("assessmentFrameworks/web-framework/levels/first").set({levelName: "First", sequenceOrder: 1,
        criteria: {requiredPracticeCount: 2, minimumScore: 60, questionsPerPractice: 1, difficultyLevel: "easy"}});
      const frameworkWeb = await import("../public/features/assessment_framework/assessment_framework_module.js?v=20261104-fill-preassessment-v3");
      await frameworkWeb.saveAssessmentFrameworkPreAssessment("web-framework", {scoreLevelSplit: {
        under40Percent: "first", over40Percent: "first", over50Percent: "first", over60Percent: "first", over70Percent: "first", over80Percent: "first", over90Percent: "endLevel"}});
      const generator = await import("../public/features/fill_in_the_blanks_practice_generator/fill_in_the_blanks_practice_generator_module.js?v=20261104-fill-firestore-v2");
      const generated = await generator.generateFillInTheBlanksPractice(input);
      assert.equal(generated.practiceType, "fillInTheBlanks");
      assert.equal(generated.passage.difficulty, "medium");
      assert.equal(generated.practice.type, "pre assessment");
      assert.equal((await generator.loadFillInTheBlanksPractice(input)).practice.id, generated.practice.id);
    });
    await t.test("web adoption saves editable essay and fill frameworks readable by the backend", async () => {
      const webFrameworks = await import("../public/features/assessment_framework/assessment_framework_module.js?v=20261104-fill-preassessment-v3");
      const {adoptMcqFramework, adoptMcqPreAssessment} = await import("../public/features/assessment_framework/application/adopt_mcq_framework.js");
      const backendFrameworks = require("./features/assessment_framework/assessment_framework_module");
      const source = await webFrameworks.createAssessmentFrameworkRecord({name: "MCQ adoption source", endLevelName: "Fluent", levels: [
        {id: "mcq-first", levelName: "Starting", sequenceOrder: 1, criteria: {requiredPracticeCount: 10, minimumScore: 65, questionsPerPractice: 12, difficultyLevel: "Easy"}},
        {id: "mcq-second", levelName: "Developing", sequenceOrder: 2, criteria: {requiredPracticeCount: 20, minimumScore: 85, questionsPerPractice: 15, difficultyLevel: "Hard"}},
      ]});
      for (const frameworkType of ["essay", "fillInTheBlanks"]) {
        const target = await webFrameworks.createAssessmentFrameworkRecord({name: "Target " + frameworkType, frameworkType, endLevelName: "Prior end", levels: [
          {id: "existing-first", levelName: "Prior first", sequenceOrder: 1, criteria: {requiredPracticeCount: 5, minimumScore: 70, questionsPerPractice: 1, difficultyLevel: "Medium"}},
        ]});
        const adopted = adoptMcqFramework(source, target);
        assert.equal((await backendFrameworks.getAssessmentFrameworkById(target.id)).endLevelName, "Prior end", "Applying is a local draft operation");
        adopted.levels[0].criteria.minimumScore = 75;
        await webFrameworks.updateAssessmentFrameworkRecord(target, adopted);
        const saved = await backendFrameworks.getAssessmentFrameworkById(target.id);
        assert.equal(saved.frameworkType, frameworkType); assert.equal(saved.endLevelName, "Fluent");
        assert.deepEqual(saved.levels.map(level => [level.levelName, level.sequenceOrder, level.criteria.requiredPracticeCount, level.criteria.minimumScore, level.criteria.difficultyLevel, level.criteria.questionsPerPractice]),
          [["Starting", 1, 5, 75, "Easy", 1], ["Developing", 2, 3, 85, "Hard", 1]]);
        assert.equal(saved.levels[0].id, "existing_first");
        if (frameworkType === "fillInTheBlanks") {
          const bands = require("./schema/assessment_framework_schema").assessmentFrameworkPreAssessmentScoreBands;
          await webFrameworks.saveAssessmentFrameworkPreAssessment(source.id, {numberOfQuestions: 12,
            difficultySplit: {easyPercentage: 20, mediumPercentage: 50, hardPercentage: 30},
            scoreLevelSplit: Object.fromEntries(bands.map(({field}, index) => [field, index === 6 ? "endLevel" : source.levels[index >= 3 ? 1 : 0].id]))});
          const mcq = await webFrameworks.getAssessmentFrameworkById(source.id);
          const preDraft = adoptMcqPreAssessment(mcq, {...saved, preAssessment: {difficultyLevel: "hard"}}, bands);
          assert.equal((await backendFrameworks.getAssessmentFrameworkById(target.id)).preAssessment, null, "Applying does not save placement settings");
          preDraft.scoreLevelSplit.under40Percent = saved.levels[1].id;
          await webFrameworks.saveAssessmentFrameworkPreAssessment(target.id, preDraft);
          const placement = (await backendFrameworks.getAssessmentFrameworkById(target.id)).preAssessment;
          assert.equal(placement.difficultyLevel, "hard");
          assert.equal(placement.scoreLevelSplit.under40Percent, saved.levels[1].id);
          assert.equal(placement.scoreLevelSplit.over40Percent, saved.levels[0].id);
          assert.equal(placement.scoreLevelSplit.over90Percent, "endLevel");
          assert.equal(placement.numberOfQuestions, undefined); assert.equal(placement.difficultySplit, undefined);
          assert.equal((await backendFrameworks.getAssessmentFrameworkById(source.id)).preAssessment.numberOfQuestions, 12);
        }
      }
      const unchanged = await backendFrameworks.getAssessmentFrameworkById(source.id);
      assert.equal(unchanged.levels[0].criteria.minimumScore, 65); assert.equal(unchanged.levels[0].criteria.questionsPerPractice, 12);
    });
    await t.test("Chinese public counts, strict submission, static grading and legacy metadata migration", async () => {
      await db.doc("syllabuses/web-chinese").set({country:"MY",level:"primary",year:1,subject:"Chinese",languages:["Chinese"],active:true});
      await db.doc("syllabuses/web-chinese/topics/vocabulary").set({topicName:"词汇"});
      const chinese=await questions.generateFillInTheBlanksQuestion({syllabusId:"web-chinese",topicId:"vocabulary",language:"Chinese",difficulty:"easy",passageId:"chinese-pass"});
      assert.deepEqual(chinese.questions.map(q=>q.requiredCharacterCount),[2,3]);
      assert.ok(chinese.questions.every(q=>q.correctAnswer===undefined));
      const cnPractice=await practice.createFillInTheBlanksPractice({passageId:chinese.passageId,practiceId:"cn-practice"});
      const cnStudents=createStudentFillInTheBlanksPracticeFeature();
      await cnStudents.assignFillInTheBlanksPracticeToStudent({studentId:"cn-student",practiceId:cnPractice.id});
      const scope={studentId:"cn-student",practiceId:cnPractice.id};
      await assert.rejects(session.submitFillInTheBlanksPracticeSession({...scope,answers:{q1:"大学校",q2:"𠮷野家"},timeTakenSeconds:10}),/requires 2 character/);
      assert.equal((await db.doc("studentFillInTheBlanksPractices/cn-student/submissions/cn-practice").get()).exists,false);
      await session.submitFillInTheBlanksPracticeSession({...scope,answers:{q1:"学 校",q2:"𠮷 野 家"},timeTakenSeconds:10});
      const backendScore=createFillInTheBlanksScoringFeature({generateText:()=>assert.fail("Canonical Chinese answers do not need model marking")});
      const backendSession=createFillInTheBlanksPracticeSession({scoring:backendScore});
      const marked=await backendSession.submitFillInTheBlanksPracticeSession({...scope,answers:{q1:"学 校",q2:"𠮷 野 家"},timeTakenSeconds:10});
      assert.equal(marked.result.score,100);assert.ok(Object.values(marked.result.answers).every(answer=>answer.markingMethod==="static"));
      const path="fillInTheBlanksQuestions/web-chinese/topics/vocabulary/languages/chinese/passages/chinese-pass";
      const keyBefore=(await db.doc(path+"/private/answerKey").get()).data();
      for(const q of chinese.questions)await db.doc(path+"/questionItems/"+q.questionId).update({requiredCharacterCount:FieldValue.delete()});
      const backendQuestions=require("./features/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module");
      const legacy=await backendQuestions.getFillInTheBlanksQuestionById(chinese.passageId);
      assert.deepEqual(legacy.questions.map(q=>q.requiredCharacterCount),[2,3]);assert.ok(legacy.questions.every(q=>q.correctAnswer===undefined));
      assert.equal((await db.doc(path+"/questionItems/q1").get()).data().requiredCharacterCount,undefined,"Reading legacy counts does not write data");
      const {migrateChineseFillCounts}=require("../scripts/migrate-chinese-fill-counts.cjs");
      const prefix=`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/`;
      const client={async get(path,{queryParams}={}){const response=await fetch(prefix+path+"?"+new URLSearchParams(queryParams));const body=await response.json();if(response.status!==200)throw Object.assign(new Error("REST read failed"),{status:response.status});return {body};},
        async post(path,body){const response=await fetch(prefix+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return {body:result};}};
      const dry=await migrateChineseFillCounts({client,project:process.env.GCLOUD_PROJECT});assert.equal(dry.questionsToUpdate,2);assert.equal(dry.appliedPassages,0);
      const migrated=await migrateChineseFillCounts({client,project:process.env.GCLOUD_PROJECT,apply:true});assert.equal(migrated.appliedPassages,1);
      const publicChinese=await questions.getFillInTheBlanksQuestionById(chinese.passageId);
      assert.deepEqual(publicChinese.questions.map(q=>q.requiredCharacterCount),[2,3]);assert.ok(publicChinese.questions.every(q=>q.correctAnswer===undefined));
      assert.deepEqual((await db.doc(path+"/private/answerKey").get()).data(),keyBefore);
      assert.equal((await backendScore.getFillInTheBlanksResult(scope)).score,100);
      assert.equal((await migrateChineseFillCounts({client,project:process.env.GCLOUD_PROJECT,apply:true})).appliedPassages,0);
    });
    const students = createStudentFillInTheBlanksPracticeFeature();
    await students.assignFillInTheBlanksPracticeToStudent({studentId: student.uid, practiceId: definition.id});
    auth.currentUser = student;
    await assert.rejects(questions.saveFillInTheBlanksQuestionGeneratorConfig(config), /administrator|admin/i);
    const loaded = await session.loadFillInTheBlanksPracticeSession({studentId: student.uid, practiceId: definition.id});
    assert.equal(loaded.passage.questions[0].correctAnswer, undefined);
    const submissionInput = {studentId: student.uid, practiceId: definition.id, answers: {q1: "our puppy", q2: "SUNNY"}, timeTakenSeconds: 12};
    await session.submitFillInTheBlanksPracticeSession(submissionInput);
    const source = db.doc(`studentFillInTheBlanksPractices/${student.uid}/submissions/${definition.id}`);
    const queued = await source.get();
    assert.equal(queued.data().markingStatus, "submitted");
    assert.ok(queued.data().requestId);
    assert.equal(await scoring.getFillInTheBlanksResult(submissionInput), null, "No partial result before grading");
    const backendScoring = createFillInTheBlanksScoringFeature({generateText: async () => {
      markingCalls++; return {answers: [{questionId: "q1", isCorrect: true}]};
    }});
    const backendSession = createFillInTheBlanksPracticeSession({students, scoring: backendScoring});
    const event = {params: {studentId: student.uid, practiceId: definition.id}, data: {before: {data: () => undefined}, after: queued}};
    await processFillInTheBlanksSubmission(event, {sessions: backendSession});
    const complete = await session.loadFillInTheBlanksPracticeSession(submissionInput);
    assert.equal(complete.status, "completed"); assert.equal(complete.result.score, 100);
    assert.equal(markingCalls, 1); assert.equal(complete.submission.requestId, queued.data().requestId);
    const backendWrite = await source.get();
    await processFillInTheBlanksSubmission({...event, data: {before: queued, after: backendWrite}}, {sessions: {
      loadFillInTheBlanksPracticeSession() {assert.fail("Status writes must not grade again");}}});
    assert.equal(markingCalls, 1);
    await session.submitFillInTheBlanksPracticeSession({...submissionInput, answers: {q1: "other words", q2: "rainy"}});
    assert.deepEqual((await source.get()).data().answers, submissionInput.answers);
    await t.test("web follow-up retries use the immutable Firestore submission", async () => {
      const generations = await import("../public/features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module.js?v=20261104-fill-firestore-v2");
      const before = await source.get();
      await generations.generateNextStudentFillInTheBlanksPractice({studentId: student.uid, completedPracticeId: definition.id});
      const after = await source.get(); let repaired = 0;
      assert.notEqual(after.data().requestId, before.data().requestId);
      assert.deepEqual(after.data().answers, before.data().answers);
      await processFillInTheBlanksSubmission({...event, data: {before, after}}, {sessions: backendSession, followup: async () => {repaired++;}});
      assert.equal(repaired, 1); assert.equal(markingCalls, 1);
    });
    await t.test("a lost marking worker is retried with the original immutable answers", async () => {
      await practice.getFillInTheBlanksPracticeById(definition.id);
      const assigned = db.doc(`studentFillInTheBlanksPractices/${student.uid}/assignedPractices/retry-practice`);
      await db.doc("fillInTheBlanksPractices/retry-practice").set({...definition, id: "retry-practice", practiceId: "retry-practice"});
      await assigned.set(complete.assignment);
      const retryRef = db.doc(`studentFillInTheBlanksPractices/${student.uid}/submissions/retry-practice`);
      await retryRef.set({...queued.data(), markingStatus: "marking", leaseUntil: new Date(Date.now() - 1), requestId: "old"});
      await session.submitFillInTheBlanksPracticeSession({...submissionInput, practiceId: "retry-practice", answers: {q1: "other words", q2: "rainy"}});
      const retry = (await retryRef.get()).data();
      assert.notEqual(retry.requestId, "old"); assert.deepEqual(retry.answers, submissionInput.answers);
    });
  } finally {globalThis.firebase = originalFirebase; llm.registerLlmProvider("deepseek", originalProvider);}
});
