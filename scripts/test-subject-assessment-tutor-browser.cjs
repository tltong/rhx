const assert = require("node:assert/strict"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const origin = process.env.SUBJECT_ASSESSMENT_TEST_ORIGIN || "http://127.0.0.1:8769";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], writes = [], modelCalls = [], operations = [], docs = new Map(); let enabled = true, published = true, poolReads = 0;
    page.on("pageerror", error => errors.push(error.message));
    docs.set("tutor/config", {miniQuestionCount: 2, promptInstructions: "One short step at a time.", correctAnswerMessage: {English: "Good thinking!"}, incorrectAnswerMessage: {English: "Have another go."}, updatedAt: new Date().toISOString(), updatedBy: "admin"});
    const content = {language: "English", questionText: "Frozen original question", options: {a: "One", b: "Two", c: "Three", d: "Four"}, hasDiagram: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>A = 60°</text></svg>'};
    const items = [1, 2, 3, 4, 5, 6].map(position => ({position, topicId: "reading", topicName: "Reading", questionType: position === 5 ? "essay" : position === 6 ? "fillInTheBlanks" : "normal", difficulty: "medium", tutorEnabled: position < 3,
      tutorQuestionId: "assessment-frozen-" + position, contentSnapshot: position === 6 ? {language: "English", passageText: "A {{q1}}.", questions: [{questionId: "q1", position: 1, requiredWordCount: 1}]} : content}));
    const answers = items.map(item => ({position: item.position, questionType: item.questionType,
      ...(item.questionType === "normal" ? {selectedOption: item.position === 2 ? null : item.position === 3 ? "b" : "a"} : item.questionType === "essay" ? {answer: "My essay"} : {answers: {q1: "cat"}})}));
    const result = {assessmentId: "attempt", studentId: "student", score: 20, scoringPolicy: {version: 2, aggregation: "topic"}, topicBreakdown: [], formatBreakdown: [], difficultyBreakdown: [],
      items: items.map(item => ({position: item.position, questionType: item.questionType, score: item.position === 3 ? 100 : 0, answer: item.questionType === "normal"
        ? {correctAnswer: "b", isCorrect: item.position === 3, explanation: "Two is correct."} : item.questionType === "essay" ? {reviewComment: "Add detail.", corrections: []}
          : {answers: {q1: {submittedAnswer: "cat", correctAnswer: "dog", isCorrect: false}}}}))};
    await page.exposeFunction("__assessmentBackend", ({action, input}) => {
      operations.push({action, input}); assert.ok(["attempt", "another-attempt"].includes(input.assessmentId));
      if (action === "session") return {assessment: {assessmentId: "attempt", studentId: "student", syllabusId: "english", language: "English", items: items.map(item => ({...item, tutorEnabled: item.tutorEnabled && enabled && published}))},
        submission: {status: "submitted", revision: 1, markingStatus: published ? "completed" : "pending", items: answers}, result: published ? result : null, canSubmit: true};
      if (action === "tutor") {
        assert.ok([1, 2].includes(input.position)); assert.equal(published, true);
        return {...content, id: (input.assessmentId === "attempt" ? "assessment-frozen-" : "another-frozen-") + input.position, syllabusId: "english", topicId: "reading", difficulty: "medium", language: "English", correctAnswer: "b", explanation: "Two is correct.", tutorEnabled: enabled};
      }
      throw new Error("Unexpected assessment write/operation: " + action);
    });
    await page.exposeFunction("__readDoc", key => docs.get(key) || null);
    await page.exposeFunction("__writeDoc", (key, data) => {assert.match(key, /^tutor\/shared-[a-f0-9]{64}-[a-f0-9]{64}\/counts\/[24]\/languages\/English$/); writes.push(key); docs.set(key, data);});
    await page.exposeFunction("__getPoolQuestion", id => {
      assert.equal(id, "bank-question"); poolReads++;
      return {...content, id, syllabusId: "english", topicId: "reading", difficulty: "Medium", language: "English", correctAnswer: "b", explanation: "Two is correct."};
    });
    await page.exposeFunction("__isTutorEnabled", () => enabled);
    await page.exposeFunction("__generate", (prompt, options) => {
      modelCalls.push({prompt, options}); assert.equal(options.useDirectFunction, true);
      if (prompt.startsWith("You check a student's answer")) return {isCorrect: false};
      assert.match(prompt, /Frozen original question/); assert.match(prompt, /A = 60°/); assert.match(prompt, /One short step at a time/);
      const count = Number(prompt.match(/^Number of mini questions: (\d+)$/m)[1]);
      return {language: "English", miniQuestions: Array.from({length: count}, (_, index) => ({sequence: index + 1, questionText: "Reasoning step " + (index + 1) + "?", expectedAnswer: "two", acceptedAnswers: ["2"], answerExplanation: "Consider the given values."}))};
    });
    await page.evaluateOnNewDocument(() => {window.__user = {uid: "student"};});
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.includes("/__/firebase/")) return js("");
      if (url.pathname.endsWith("/firebase_auth.js")) return js('export const getFirebaseAuth=()=>({onAuthStateChanged(callback){queueMicrotask(()=>callback(window.__user));return()=>{};}});export const requireCurrentFirebaseAuthUser=()=>window.__user;');
      if (url.pathname.endsWith("/firebase_ops.js")) return js(`
        export const initFirebase=()=>({});
        export const getFirebaseApp=()=>({functions:()=>({httpsCallable:()=>async data=>({data:await window.__assessmentBackend(data)})})});
        export const getFirebaseNamespace=()=>({firestore:{FieldValue:{serverTimestamp:()=>new Date()}}});
        export async function readDocument(collection,id){const data=await window.__readDoc(collection+"/"+id);if(data)for(const key of ["updatedAt","generatedAt","configUpdatedAt"])if(data[key])data[key]=new Date(data[key]);return data;}
        export const writeDocument=(collection,id,data)=>window.__writeDoc(collection+"/"+id,data);
        export const createDocumentIfAbsent=writeDocument;`);
      if (url.pathname.endsWith("/student/student_module.js")) return js('export const onStudentAuthStateChanged=callback=>{queueMicrotask(()=>callback(window.__user));return()=>{};};');
      if (url.pathname.endsWith("/site_admin_module.js")) return js('export const requireCurrentSiteAdmin=()=>{throw new Error("Not an admin flow");};');
      if (url.pathname.endsWith("/question/question_module.js")) return js('export const getQuestionById=id=>window.__getPoolQuestion(id);');
      if (url.pathname.endsWith("/pre_assessment_question_module.js")) return js('export const getPreAssessmentQuestionById=async()=>null;');
      if (url.pathname.endsWith("/syllabus/syllabus_module.js")) return js('export const isTopicTutorEnabled=()=>window.__isTutorEnabled();');
      if (url.pathname.endsWith("/llm_util.js")) return js('export const generateLlmText=(prompt,options)=>window.__generate(prompt,options);');
      if (url.origin !== origin && !url.protocol.startsWith("blob")) return request.abort();
      request.continue();
    });
    const resultUrl = origin + "/features/subject_assessment/pages/assessment/subject_assessment.html?assessmentId=attempt&studentId=student&syllabusId=english";
    await page.goto(resultUrl, {waitUntil: "networkidle0"}); await page.waitForSelector(".question-review-link");
    assert.equal(await page.$$eval(".question-review-link", links => links.length), 2);
    const reviewLinks = await page.$$eval(".question-review-link", links => links.map(link => link.href));
    assert.deepEqual(reviewLinks.map(href => new URL(href).searchParams.get("position")), ["1", "2"]);
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click('.assessment-card[data-position="1"] .question-review-link')]);
    await page.waitForFunction(() => document.querySelector("#review-step").textContent === "Step 1 of 2" || !document.querySelector("#review-load-error").hidden);
    assert.equal(await page.$eval("#review-step", el => el.textContent), "Step 1 of 2", JSON.stringify({errors, message: await page.$eval("#review-error-message", el => el.textContent)}));
    assert.equal(await page.$eval("#review-question-text", el => el.textContent), content.questionText);
    assert.equal(await page.$eval("#review-diagram img", el => el.src.startsWith("blob:")), true);
    await page.type("#review-answer", "wrong"); await page.click("#check-review-answer");
    await page.waitForFunction(() => document.querySelector("#review-feedback").textContent.includes("Have another go."));
    await page.click("#next-review-question");
    await page.type("#review-answer", "two"); await page.click("#check-review-answer");
    await page.waitForFunction(() => document.querySelector("#review-feedback").textContent.includes("Good thinking!"));
    await page.click("#review-more-guidance");
    await page.waitForFunction(() => document.querySelector("#review-step").textContent === "Step 1 of 4");
    assert.equal(writes.length, 2);
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#review-back-to-results")]);
    assert.equal(new URL(page.url()).pathname, new URL(resultUrl).pathname); assert.equal(new URL(page.url()).searchParams.get("assessmentId"), "attempt");
    assert.equal(new URL(page.url()).searchParams.get("studentId"), "student"); assert.equal(new URL(page.url()).searchParams.get("syllabusId"), "english");
    await page.goto(reviewLinks[0], {waitUntil: "networkidle0"}); await page.waitForFunction(() => document.querySelector("#review-step").textContent === "Step 1 of 2");
    assert.equal(writes.length, 2, "Reopening guidance reuses its existing count/language cache");
    for (let step = 1; step <= 2; step++) {
      await page.type("#review-answer", "two"); await page.click("#check-review-answer");
      await page.waitForFunction(() => !document.querySelector("#next-review-question").disabled);
      if (step === 1) await page.click("#next-review-question");
    }
    const callsBeforeDisabled = modelCalls.length;
    enabled = false; await page.click("#review-more-guidance");
    await page.waitForFunction(() => document.querySelector("#review-error-message").textContent.includes("disabled"));
    assert.equal(await page.$eval("#retry-review", el => el.hidden), true);
    assert.equal(modelCalls.length, callsBeforeDisabled, "Disabling Tutor blocks even cached additional guidance");
    await page.goto(resultUrl, {waitUntil: "networkidle0"}); await page.waitForSelector(".assessment-card");
    assert.equal(await page.$$eval(".question-review-link", links => links.length), 0);
    enabled = true; published = false;
    await page.goto(resultUrl, {waitUntil: "networkidle0"}); await page.waitForSelector(".assessment-card");
    assert.equal(await page.$$eval(".question-review-link", links => links.length), 0, "Pending marking cannot reveal Tutor");
    assert.equal(poolReads, 0, "Assessment reviews always load their frozen source");
    published = true;
    const sharedCalls = modelCalls.length, sharedWrites = writes.length;
    await page.goto(origin + "/features/tutor/pages/question_review/question_review.html?questionId=bank-question&practiceId=normal-practice&language=English", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.querySelector("#review-step").textContent === "Step 1 of 2");
    assert.ok(poolReads > 0);
    assert.equal(modelCalls.length, sharedCalls); assert.equal(writes.length, sharedWrites, "Regular practice reuses the assessment guide");
    assert.equal(new URL(await page.$eval("#review-back-to-results", el => el.href)).searchParams.get("practiceId"), "normal-practice");
    await page.goto(origin + "/features/tutor/pages/question_review/question_review.html?assessmentId=another-attempt&position=1&questionId=another-frozen-1&language=English", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.querySelector("#review-step").textContent === "Step 1 of 2");
    assert.equal(modelCalls.length, sharedCalls); assert.equal(writes.length, sharedWrites, "Another assessment reuses the same guide");
    assert.equal(new URL(await page.$eval("#review-back-to-results", el => el.href)).searchParams.get("assessmentId"), "another-attempt");
    assert.equal(operations.some(operation => !["session", "tutor"].includes(operation.action)), false);
    assert.deepEqual(errors, []);
    console.log("PASS: shared guides across assessments and regular practice, wrong/unanswered-only links, frozen diagrams, Tutor settings, count variants, live disable, return navigation and marking gate.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
