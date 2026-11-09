const {test} = require("node:test"), assert = require("node:assert/strict");

test("student-specific assessment generation, persistence and read-only demos", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const {FieldValue} = require("firebase-admin/firestore");
  const {createSubjectAssessmentGenerator} = require("./features/subject_assessment_generator/subject_assessment_generator_module");
  const {SubjectAssessmentContentPool} = require("./features/subject_assessment_generator/infrastructure/subject_assessment_content_pool");
  const {FirestorePassageRepository} = require("./features/fill_in_the_blanks_question_generator/infrastructure/firestore_passage_repository");
  const {FirestoreSubjectAssessmentRepository} = require("./features/subject_assessment/infrastructure/firestore_subject_assessment_repository");
  const {identity, sourceKey, poolReference} = require("./features/subject_assessment/domain/subject_assessment");
  const essay = require("./features/essay_question_generator/essay_question_generator_module");
  const questions = require("./features/question/question_module");
  const essayConfig = require("./features/essay_question_generator/domain/essay_question_generator_config").createDefaultConfiguration();
  essayConfig.gradeSupport.primary[3].pictureEnabled = true;
  const fillConfig = require("./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks").normaliseConfig({gradeSettings: {primary: {3: {questionsPerPassage: 2, imageEnabled: true}}}});
  const passages = new FirestorePassageRepository();
  const scope = {studentId: "student", syllabusId: "english", language: "English"};
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVAAAAABJRU5ErkJggg==";
  let textCalls = 0, previewImages = 0, storedImages = 0;
  const authorize = async () => ({uid: "admin", assertAccess() {}});
  const deps = {getDb: () => db, llmProfiles: {STANDARD_PRO: {}, DIAGRAM_PRO: {}}, random: () => 0,
    getDefaultPrompt: async () => ({id: "default"}), getDiagramPercentage: async () => 0,
    generatePrompt: async (_config, _syllabus, input) => JSON.stringify({kind: "mcq", input}),
    generatePromptWithDiagram: async () => {throw new Error("Unexpected diagram");}, renderDiagram: async () => ({svg: "<svg></svg>"}),
    generateText: async prompt => {
      textCalls++;
      if (prompt.startsWith('{"kind":"mcq"')) return {questions: [{questionText: "New number task " + textCalls,
        topicName: "Numbers", hasDiagram: false, options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", answerExplanation: "Two is correct."}]};
      if (prompt.startsWith("Generate one coherent")) return {passageText: "We saw {{q1}} near the {{q2}}.", summary: "New park " + textCalls,
        imagePrompt: "A park", questions: [{questionId: "q1", correctAnswer: "birds"}, {questionId: "q2", correctAnswer: "pond"}]};
      assert.match(prompt, /Required syllabus topic context/);
      assert.match(prompt, /Writing/);
      return {questionText: "Write about a family outing " + textCalls, imagePrompt: "A family visiting a park"};
    },
    getRandomQuestionSeedEntry: async input => {
      assert.deepEqual(input, {vertical: "theme", level: "primary", grade: 3});
      return "A family outing";
    }, getEssayConfiguration: async () => essayConfig,
    saveEssayQuestion: essay.saveEssayQuestion, getPassageConfiguration: async () => fillConfig,
    passages, writeQuestion: questions.writeQuestion,
    generateImage: async () => {previewImages++; return {images: [{mimeType: "image/png", base64: png}]};},
    createEssayPicture: async input => {storedImages++; return {storagePath: `essay-question-images/${input.questionId}.png`, url: "https://firebasestorage.googleapis.com/v0/b/demo/o/example.png"};},
    createPassagePicture: async () => {storedImages++; return {storagePath: "fill-in-the-blanks-images/example.png", url: "https://firebasestorage.googleapis.com/v0/b/demo/o/example.png"};},
  };
  const api = createSubjectAssessmentGenerator({authorize, random: () => 0, createPool: run => new SubjectAssessmentContentPool(run, deps)});
  async function snapshotDatabase() {
    const result = {};
    async function visit(collection) {
      for (const ref of await collection.listDocuments()) {
        const doc = await ref.get();
        if (doc.exists) result[ref.path] = JSON.stringify(doc.data());
        for (const child of await ref.listCollections()) await visit(child);
      }
    }
    for (const collection of await db.listCollections()) await visit(collection);
    return result;
  }
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await db.doc("syllabuses/english").set({country: "MY", level: "primary", year: 3, subject: "English", languages: ["English"], active: true});
  for (const [topicId, topicName, type] of [["numbers", "Numbers", "normal"], ["writing", "Writing", "essay"], ["vocabulary", "Vocabulary", "fillInTheBlanks"]]) {
    await db.doc(`syllabuses/english/topics/${topicId}`).set({topicName, assessmentFrameworkIds: {english: type}});
    await db.doc("assessmentFrameworks/" + type).set({frameworkType: type});
  }
  for (const studentId of ["student", "other", "retry", "concurrent"]) await db.doc("students/" + studentId).set({name: studentId});
  await db.doc("essayQuestionGenerator/config").set({...essayConfig, updatedAt: new Date(), updatedBy: "admin"});
  await db.doc("fillInTheBlanksQuestionGenerator/config").set({...fillConfig, updatedAt: new Date(), updatedBy: "admin"});
  const configApi = require("./features/subject_assessment_config/subject_assessment_config_module").createSubjectAssessmentConfigFeature({authorize});
  await configApi.saveSubjectAssessmentConfig({...scope, expectedVersion: 0, topics: [
    {topicId: "numbers", totalCount: 2, difficultyCounts: {easy: 1, medium: 0, hard: 1}},
    {topicId: "writing", totalCount: 2, difficultyCounts: {easy: 1, medium: 1, hard: 0}},
    {topicId: "vocabulary", totalCount: 2, difficultyCounts: {easy: 0, medium: 1, hard: 1}},
  ]});
  const mcq = (id, difficulty) => ({id, syllabusId: "english", topicId: "numbers", language: "English", difficulty, group: "assessment",
    questionText: "Numbers " + id, hasDiagram: false, svg: "", options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", explanation: "Explanation"});
  const essayQuestion = (questionId, difficulty, tagged = true) => ({questionId, level: "primary", standard: 3, language: "English", difficulty,
    ...(tagged ? {syllabusId: "english", topicId: "writing", topicName: "Writing", subject: "English"} : {}),
    questionText: "Writing task " + questionId, seedUsed: "Family", wordCountRequirement: {minWords: null},
    support: {version: 1, settings: essayConfig.gradeSupport.primary[3], pictureStatus: "failed", picture: null, helpingWordsStatus: "disabled", helpingWords: []}});
  const passage = (passageId, difficulty) => ({passageId, syllabusId: "english", topicId: "vocabulary", language: "english", level: "primary", grade: 3,
    difficulty, passageText: "We saw {{q1}} at the {{q2}}.", summary: passageId, imagePrompt: null, image: null, imageStatus: "failed", questionCount: 2,
    settings: fillConfig.gradeSettings.primary[3], questions: [{questionId: "q1", position: 1, requiredWordCount: 1, correctAnswer: "birds"}, {questionId: "q2", position: 2, requiredWordCount: 1, correctAnswer: "park"}]});
  for (const item of [mcq("free-easy", "Easy"), mcq("assigned-hard", "Hard"), mcq("completed-easy", "easy"), mcq("subject-easy", "easy")]) await questions.writeQuestion(item);
  for (const item of [essayQuestion("free-essay", "easy"), essayQuestion("assigned-essay", "medium"), essayQuestion("completed-essay", "easy"), essayQuestion("legacy-essay", "medium", false)]) await essay.saveEssayQuestion(item, {updatedBy: "admin"});
  for (const item of [passage("free-passage", "medium"), passage("assigned-passage", "hard"), passage("completed-passage", "medium")]) await passages.save(item);
  for (const [kind, questionId, difficulty] of [["assignedPractices", "assigned-hard", "hard"], ["completedPractices", "completed-easy", "easy"]]) {
    await db.doc(`studentPractices/student/${kind}/${kind}`).set({});
    await db.doc("practices/" + kind).set({type: "assessment", questions: [{...mcq(questionId, difficulty), questionId}]});
  }
  await db.doc("studentEssayPractices/student/assignedEssayPractices/a").set({essayQuestionId: "assigned-essay"});
  await db.doc("studentEssayPractices/student/completedEssayPractices/c").set({essayQuestionId: "completed-essay"});
  await db.doc("studentFillInTheBlanksPractices/student/assignedPractices/a").set({passageId: "assigned-passage"});
  await db.doc("studentFillInTheBlanksPractices/student/completedPractices/c").set({passageId: "completed-passage"});
  const priorIdentity = identity("normal", mcq("subject-easy", "easy"));
  await db.doc("studentSubjectAssessmentUsage/student/items/" + await sourceKey(priorIdentity)).set({identity: priorIdentity, assessmentId: "earlier"});
  const regularBefore = await snapshotDatabase();

  await t.test("demo checks all assigned/completed histories, generates only shortages and writes nothing", async () => {
    const progress = [], before = await snapshotDatabase();
    const demo = await api.previewSubjectAssessment(scope, {onProgress: value => progress.push(value)});
    assert.equal(demo.previewOnly, true); assert.equal(demo.items.length, 6);
    assert.equal(demo.reusedCount, 3); assert.equal(demo.generatedCount, 3);
    assert.equal(demo.questionCount, 8); assert.equal(demo.passageCount, 2);
    assert.deepEqual(demo.items.filter(item => item.source === "reused").map(item => item.sourceReference.split("/").at(-1)), ["free-easy", "free-essay", "free-passage"]);
    assert.equal(demo.items.filter(item => item.contentSnapshot.previewImage).length, 2);
    assert.equal(previewImages, 2); assert.equal(storedImages, 0);
    assert.equal(progress.at(-1).prepared, 6);
    assert.equal(new Set(demo.items.map(item => item.sourceKey)).size, 6);
    assert.deepEqual(await snapshotDatabase(), before, "Preview changes no database documents, including drafts, pools, usage and jobs");
  });

  let saved;
  await t.test("persistent generation publishes frozen content, private answers and usage; retries are idempotent", async () => {
    saved = await api.generateSubjectAssessment({...scope, requestId: "first"});
    assert.equal(saved.studentId, "student"); assert.equal(saved.items.length, 6);
    assert.equal(saved.reusedCount, 3); assert.equal(saved.generatedCount, 3);
    for (const item of saved.items) {
      assert.equal(item.marking, undefined); assert.equal(item.contentSnapshot.correctAnswer, undefined);
      assert.ok((await db.doc(item.sourceReference).get()).exists, "Generated content belongs to the existing pool");
      assert.ok((await db.doc(`subjectAssessments/${saved.assessmentId}/private/${String(item.position).padStart(8, "0")}`).get()).exists);
    }
    assert.equal((await db.collection("studentSubjectAssessmentUsage/student/items").get()).size, 7);
    const calls = textCalls;
    assert.deepEqual(await api.generateSubjectAssessment({...scope, requestId: "first"}), saved);
    assert.equal(textCalls, calls);
    assert.equal((await api.getSubjectAssessmentGeneration({generationId: "first"})).leaseToken, undefined);
    const root = await db.doc("subjectAssessments/" + saved.assessmentId).get();
    assert.equal(root.data().configurationVersion, 1);
    const previousText = saved.items[0].contentSnapshot.questionText;
    await db.doc(saved.items[0].sourceReference).update({questionText: "Edited after generation"});
    assert.equal((await new FirestoreSubjectAssessmentRepository().get(saved.assessmentId)).items[0].contentSnapshot.questionText, previousText);
    await assert.rejects(api.generateSubjectAssessment({...scope, studentId: "other", requestId: "first"}), /different student/);
  });

  await t.test("the next assessment excludes earlier subject assessments too; demo still consumes no usage", async () => {
    const before = await snapshotDatabase();
    const demo = await api.previewSubjectAssessment(scope);
    const used = new Set(saved.items.map(item => item.sourceKey));
    assert.ok(demo.items.every(item => !used.has(item.sourceKey)));
    assert.equal(demo.reusedCount, 0);
    assert.deepEqual(await snapshotDatabase(), before);
  });

  await t.test("a failed pool save resumes its stored draft without repeating the model request", async () => {
    let fail = true, drafts = 0;
    const retryApi = createSubjectAssessmentGenerator({authorize, createPool: run => {
      const pool = new SubjectAssessmentContentPool(run, deps);
      const draft = pool.draft.bind(pool), save = pool.save.bind(pool);
      pool.list = async () => [];
      pool.draft = async (...args) => {drafts++; return draft(...args);};
      pool.save = async (...args) => {if (fail) {fail = false; throw new Error("Interrupted pool save");} return save(...args);};
      return pool;
    }});
    const input = {...scope, studentId: "retry", requestId: "resume"};
    await assert.rejects(retryApi.generateSubjectAssessment(input), /Interrupted pool save/);
    const failed = await retryApi.getSubjectAssessmentGeneration({generationId: "resume"});
    assert.equal(failed.status, "failed");
    assert.equal((await db.collection("studentSubjectAssessmentUsage/retry/items").get()).size, 0);
    const result = await retryApi.retrySubjectAssessmentGeneration(input);
    assert.equal(result.assessmentId, failed.assessmentId);
    assert.equal(drafts, 6, "The saved first draft is reused rather than generated twice");
  });

  await t.test("invalid/missing student and configuration changes fail before paid work", async () => {
    const calls = textCalls;
    await assert.rejects(api.previewSubjectAssessment({...scope, studentId: "missing"}), /student could not be found/);
    await assert.rejects(api.previewSubjectAssessment({...scope, expectedConfigurationVersion: 99}), /configuration changed/i);
    assert.equal(textCalls, calls);
    await db.doc("studentPractices/other/assignedPractices/deleted-definition").set({});
    await assert.rejects(api.previewSubjectAssessment({...scope, studentId: "other"}), /history is missing/);
    assert.equal(textCalls, calls);
    await db.doc("studentPractices/other/assignedPractices/deleted-definition").delete();
  });

  await t.test("two generation requests for one student cannot publish overlapping assessments concurrently", async () => {
    let release, signal;
    const gate = new Promise(resolve => {release = resolve;});
    const entered = new Promise(resolve => {signal = resolve;});
    let hold = true;
    const concurrentApi = createSubjectAssessmentGenerator({authorize, createPool: run => {
      const pool = new SubjectAssessmentContentPool(run, deps), original = pool.draft.bind(pool);
      pool.list = async () => [];
      pool.draft = async (...args) => {if (hold) {hold = false; signal(); await gate;} return original(...args);};
      return pool;
    }});
    const first = concurrentApi.generateSubjectAssessment({...scope, studentId: "concurrent", requestId: "concurrent-first"});
    await entered;
    await assert.rejects(concurrentApi.generateSubjectAssessment({...scope, studentId: "concurrent", requestId: "concurrent-second"}), /already being generated/);
    release();
    const completed = await first;
    assert.equal(completed.items.length, 6);
    assert.equal((await db.collection("studentSubjectAssessmentUsage/concurrent/items").get()).size, 6);
  });

  await t.test("the actual browser demo module reuses pooled content without exposing any save operation", async () => {
    const original = globalThis.firebase, admin = {uid: "admin", email: "admin@example.test", emailVerified: true};
    const auth = {currentUser: admin};
    const app = {firestore: () => db, auth: () => auth, functions: () => ({httpsCallable: name => async () => {
      assert.equal(name, "isCurrentUserSiteAdmin"); return {data: {isAdmin: true, email: admin.email, emailVerified: true}};
    }})};
    const firestore = () => db; firestore.FieldValue = FieldValue;
    globalThis.firebase = {apps: [], initializeApp: () => app, firestore};
    try {
      const web = await import("../public/features/subject_assessment_generator/subject_assessment_generator_module.js");
      assert.equal(web.generateSubjectAssessment, undefined);
      const before = await snapshotDatabase();
      const demo = await web.previewSubjectAssessment({...scope, studentId: "other"});
      assert.equal(demo.reusedCount, 6);
      assert.deepEqual(await snapshotDatabase(), before);
      const {SubjectAssessmentContentPool: WebPool} = await import("../public/features/subject_assessment_generator/infrastructure/subject_assessment_content_pool.js");
      const webDrafts = web.createSubjectAssessmentGenerator({createPool: run => {
        const pool = new WebPool(run, deps); pool.list = async () => []; return pool;
      }});
      const imagesBefore = storedImages;
      const generatedDemo = await webDrafts.previewSubjectAssessment({...scope, studentId: "other"}, {previewOnly: false});
      assert.equal(generatedDemo.generatedCount, 6);
      assert.equal(generatedDemo.previewOnly, true, "The browser API cannot switch a demo into persisted generation");
      assert.equal(storedImages, imagesBefore, "Preview pictures never use asset/Storage persistence callbacks");
      assert.deepEqual(await snapshotDatabase(), before);
    } finally {globalThis.firebase = original;}
  });

  await t.test("persistent generation leaves missions, progression, coins, reliability and regular assignments untouched", async () => {
    const after = await snapshotDatabase();
    for (const [path, data] of Object.entries(regularBefore)) {
      if (path.startsWith("questions/") || path.startsWith("essayQuestionGenerator/") || path.startsWith("fillInTheBlanksQuestions/") || path.startsWith("studentSubjectAssessmentUsage/")) continue;
      assert.equal(after[path], data, path);
    }
    assert.equal((await db.collection("studentDailyMissions").get()).size, 0);
    assert.equal((await db.collection("rewards").get()).size, 0);
  });
});
