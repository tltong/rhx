// Serve public/ on 127.0.0.1:8769 before running. All auth/provider/API traffic is mocked.
const assert = require("node:assert/strict");
const path = require("node:path");
const {createRequire} = require("node:module");
const fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {normaliseConfig, publicPassage, validateGenerated} = require("../functions/features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.RHX_CHROMIUM || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
  const errors = [], actions = []; page.on("pageerror", error => errors.push(error.message));
  const config = normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 3, imageEnabled: true}}}});
  const draft = {passageId: "browser-passage", syllabusId: "english", topicId: "vocabulary", language: "english", level: "primary", grade: 1,
    difficulty: "easy", questionCount: 3, passageText: "Ali took {{q1}} to the park. It was {{q2}}. His {{q3}} came too. <b>Read carefully.</b>",
    summary: "Family park outing", imagePrompt: "A family walking a dog in a sunny park.", imageStatus: "generated",
    image: {storagePath: "test.png", url: "https://fixture.invalid/passage.svg"}, settings: {questionsPerPassage: 3, imageEnabled: true},
    questions: [{questionId: "q1", position: 1, requiredWordCount: 2, correctAnswer: "the dog"},
      {questionId: "q2", position: 2, requiredWordCount: 1, correctAnswer: "sunny"}, {questionId: "q3", position: 3, requiredWordCount: 1, correctAnswer: "sister"}]};
  const previewImage = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAACYElEQVR4nO3TQQ0AIBDAsNOODbygDQ98yJImFbDPZp0NRM33AuCZgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEXlFz5IjwMqmcAAAAASUVORK5CYII="};
  let loaded = {status: "assigned", assignment: {studentId: "student", practiceId: "browser-practice"}, practice: {id: "browser-practice", type: "pre assessment"},
    passage: publicPassage(draft), result: null, submission: null}, generation = null, allowAdmin = true;
  await page.evaluateOnNewDocument(() => {window.__fillRevokedUrls = []; const revoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = url => {window.__fillRevokedUrls.push(url); revoke(url);}; window.__fillWatchers = []; window.__fillAuthCallbacks = []; window.__fillUser = {uid: "student", email: "test@example.test", getIdToken: async () => "local-test"};});
  await page.exposeFunction("__fillFeature", async (action, input = {}) => {
    actions.push({action, input}); let result;
        if (action === "getConfig") result = config;
        else if (action === "getScoringConfig") result = {markingInstructions: "Accept contextual alternatives with correct spelling."};
        else if (action === "getOptions") result = {syllabuses: [{id: "english", subject: "English", level: "primary", year: 1,
          languages: ["English"], topics: [{id: "vocabulary", topicName: "Vocabulary"}]}]};
        else if (action === "generateQuestion") {assert.equal(input.previewOnly, true); assert.equal(input.save, false); result = {...draft, ...validateGenerated({...draft, questions: draft.questions.map(q => ({...q, requiredWordCount: 1}))}, draft.settings), image: null, previewImage};}
        else if (action === "saveQuestion") result = publicPassage(draft);
        else if (action === "loadSession") result = loaded;
        else if (action === "getGenerationStatus") result = generation;
        else if (action === "submitSession") {
          loaded = {...loaded, submission: {answers: input.answers, markingStatus: "submitted", retryAt: new Date(Date.now() + 120000).toISOString()}};
          result = loaded;
          setTimeout(async () => {
          loaded = {...loaded, status: "completed", submission: {answers: input.answers, markingStatus: "completed"},
            result: {questionsCorrect: 2, totalQuestions: 3, score: 2 / 3 * 100, answers: {
              q1: {submittedAnswer: input.answers.q1, correctAnswer: "the dog", isCorrect: true, markingMethod: "llm"},
              q2: {submittedAnswer: input.answers.q2, correctAnswer: "sunny", isCorrect: true, markingMethod: "static"},
              q3: {submittedAnswer: "", correctAnswer: "sister", isCorrect: false, markingMethod: "unanswered"}}}};
          generation = {status: "generating"};
          await page.evaluate(() => window.__fillWatchers.forEach(callback => callback()));
          }, 350);
        } else if (action === "saveConfig" || action === "saveScoringConfig") result = input;
        else throw new Error("Unexpected browser action " + action);
    return result;
  });
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    try {
      if (url.pathname.includes("/__/firebase/")) return request.respond({status: 200, contentType: "application/javascript",
        body: url.pathname.endsWith("/firebase-functions-compat.js") ? "window.__fillFunctionsSdkLoaded=true;" : ""});
      if (url.pathname.endsWith("/utils/firebase/firebase_auth.js")) return request.respond({status: 200, contentType: "application/javascript", body:
        "export const getCurrentFirebaseAuthRawUser=()=>window.__fillUser; export const getCurrentFirebaseAuthUser=getCurrentFirebaseAuthRawUser; export const requireCurrentFirebaseAuthUser=getCurrentFirebaseAuthRawUser; export const onFirebaseAuthStateChanged=fn=>{window.__fillAuthCallbacks.push(fn);queueMicrotask(()=>fn(window.__fillUser));return()=>{window.__fillAuthCallbacks=window.__fillAuthCallbacks.filter(x=>x!==fn)}};"});
      if (url.pathname.endsWith("/utils/firebase/firebase_ops.js")) return request.respond({status: 200, contentType: "application/javascript", body:
        `export const getFirebaseApp=()=>({functions:window.__fillFunctionsSdkLoaded ? region=>({httpsCallable:name=>async()=>{
          if(region!=="us-central1"||name!=="isCurrentUserSiteAdmin")throw new Error("Unexpected administrator check");
          window.__fillAdminChecks=(window.__fillAdminChecks||0)+1;
          return {data:{isAdmin:${allowAdmin},emailVerified:true,email:"test@example.test"}};
        }}) : undefined});
        export const getFirestoreDb=()=>({collection:path=>({onSnapshot:cb=>{window.__fillWatchers.push(cb); return ()=>{window.__fillWatchers=window.__fillWatchers.filter(x=>x!==cb)}}})});`});
      if (url.hostname === "fixture.invalid") return request.respond({status: 200, contentType: "image/svg+xml", body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220"><rect width="360" height="220" fill="#dff4fa"/><circle cx="290" cy="40" r="25" fill="#ffda65"/><path d="M0 160 Q90 110 180 165 T360 150 V220 H0Z" fill="#8bbf8d"/></svg>'});
      const modules = {
        "/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module.js": {
          getFillInTheBlanksQuestionGeneratorConfig: "getConfig", saveFillInTheBlanksQuestionGeneratorConfig: "saveConfig",
          generateFillInTheBlanksQuestion: "generateQuestion", saveFillInTheBlanksQuestion: "saveQuestion", loadFillInTheBlanksGeneratorOptions: "getOptions"},
        "/fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module.js": {getFillInTheBlanksScoringConfig: "getScoringConfig", saveFillInTheBlanksScoringConfig: "saveScoringConfig"},
        "/fill_in_the_blanks_practice_session/fill_in_the_blanks_practice_session_module.js": {loadFillInTheBlanksPracticeSession: "loadSession", submitFillInTheBlanksPracticeSession: "submitSession"},
        "/fill_in_the_blanks_practice_generator/fill_in_the_blanks_practice_generator_module.js": {generateFillInTheBlanksPractice: "generatePractice"},
        "/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module.js": {getFillInTheBlanksGenerationStatus: "getGenerationStatus", generateNextStudentFillInTheBlanksPractice: "retryGeneration"},
      };
      for (const [suffix, exports] of Object.entries(modules)) if (url.pathname.endsWith(suffix)) {
        return request.respond({status: 200, contentType: "application/javascript", body: Object.entries(exports)
          .map(([name, action]) => `export const ${name} = input => window.__fillFeature(${JSON.stringify(action)}, input);`).join("\n")});
      }
      if (url.pathname.endsWith("/student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module.js")) {
        return request.respond({status: 200, contentType: "application/javascript", body:
          "export function watchStudentFillInTheBlanksPracticeUpdates(scope, callback) {window.__fillWatchers.push(callback);return()=>{window.__fillWatchers=window.__fillWatchers.filter(x=>x!==callback)}}"});
      }
      return request.continue();
    } catch (error) {errors.push(error.message); if (!request.isInterceptResolutionHandled()) await request.abort();}
  });
  try {
    const base = "http://127.0.0.1:8769";
    await page.goto(base + "/features/fill_in_the_blanks_question_generator/pages/admin/fill_in_the_blanks_admin.html", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.getElementById("fill-status").textContent === "Settings loaded.");
    assert.equal(await page.evaluate(() => window.__fillFunctionsSdkLoaded), true, "The page must load the Firebase Functions SDK");
    assert.ok(await page.evaluate(() => window.__fillAdminChecks > 0), "Real administrator gateway must complete its existing callable check");
    assert.equal(await page.$$eval("#fill-grade-settings details", items => items.length), 12);
    await page.select("#fill-syllabus", "english"); await page.select("#fill-topic", "vocabulary"); await page.select("#fill-language", "English");
    await page.click("#fill-generate"); await page.waitForFunction(() => !document.getElementById("fill-preview").hidden);
    await page.waitForFunction(() => {const image=document.querySelector("#fill-passage-preview img");return image?.complete && image.naturalWidth > 0 && image.src.startsWith("blob:")});
    assert.equal(await page.$$eval("#fill-model-answers li", items => items.length), 3);
    assert.match(await page.$eval("#fill-model-answers li", item => item.textContent), /the dog \(2 word/);
    assert.match(await page.$eval("#fill-image-prompt", item => item.value), /family walking/);
    assert.equal(await page.$eval("#fill-passage-preview b", () => true).catch(() => false), false, "LLM markup must be text");
    assert.equal(await page.$("#fill-save-passage"), null, "The test area is preview-only");
    assert.equal(await page.$("#fill-attach"), null, "The question generator page must not attach pre-assessments");
    assert.equal(actions.some(action => action.action === "saveQuestion" || action.action === "generatePractice"), false, "Preview never commits or attaches a practice");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Admin page fits mobile viewport");
    await page.screenshot({path: "/tmp/rhx-fill-admin-mobile.png", fullPage: true});
    const previewUrl = await page.$eval("#fill-passage-preview img", image => image.src);
    await page.select("#fill-difficulty", "medium");
    assert.ok(await page.evaluate(url => window.__fillRevokedUrls.includes(url), previewUrl), "Discarding preview releases the browser-only image");
    allowAdmin = false;
    await page.goto(base + "/features/fill_in_the_blanks_practice_session/pages/practice/fill_in_the_blanks_practice.html?practiceId=browser-practice", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.getElementById("fill-submit").disabled === false);
    assert.equal(await page.evaluate(() => window.__fillFunctionsSdkLoaded), true, "The student page must also load the SDK for administrator/guardian access checks");
    assert.match(await page.$eval("#fill-session-meta", item => item.textContent), /Pre-assessment/);
    await page.type("#blank-q1", "too many words"); await page.type("#blank-q2", "SUNNY");
    await page.click("#fill-submit");
    assert.equal(actions.filter(action => action.action === "submitSession").length, 0, "Wrong word count blocks submission");
    await page.$eval("#blank-q1", input => {input.value = "our puppy"; input.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.click("#fill-submit");
    await page.waitForFunction(() => document.getElementById("fill-final-score").hidden === false);
    assert.match(await page.$eval("#fill-final-score", item => item.textContent), /2 \/ 3 correct/);
    assert.match(await page.$eval("#fill-placement", item => item.textContent), /Determining your starting level/);
    assert.equal(await page.$$eval(".answer-correct", items => items.length), 2);
    assert.match(await page.$eval(".answer-incorrect", item => item.textContent), /Unanswered.*sister/);
    await page.waitForFunction(() => document.getElementById("fill-next-status").textContent.includes("Preparing"));
    generation = {status: "completed", nextPracticeId: "next", outcome: "assigned"};
    loaded = {...loaded, assessment: {levelId: "second", levelName: "Developing", isFrameworkCompleted: false}};
    await page.evaluate(() => window.__fillWatchers.forEach(callback => callback()));
    await page.waitForFunction(() => document.getElementById("fill-next-status").textContent.includes("ready on the dashboard"));
    assert.match(await page.$eval("#fill-placement", item => item.textContent), /Starting level: Developing/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Student page fits mobile viewport");
    await page.click(".picture-button"); assert.equal(await page.$eval("dialog", dialog => dialog.open), true);
    await page.click("dialog button");
    await page.screenshot({path: "/tmp/rhx-fill-student-mobile.png", fullPage: true});
    // A worker can disappear without a final failure write. The original answers
    // stay locked, and expiry makes the same submission retryable automatically.
    loaded = {...loaded, status: "assigned", result: null, submission: {answers: {q1: "our puppy", q2: "SUNNY", q3: ""},
      markingStatus: "marking", timeTakenSeconds: 12, retryAt: new Date(Date.now() + 2500).toISOString()}};
    await page.goto(base + "/features/fill_in_the_blanks_practice_session/pages/practice/fill_in_the_blanks_practice.html?practiceId=browser-practice", {waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => document.getElementById("fill-session-status").textContent.includes("being marked"));
    assert.equal(await page.$eval("#fill-submit", button => button.disabled), true);
    await page.waitForFunction(() => document.getElementById("fill-submit").disabled === false, {timeout: 6000});
    assert.equal(await page.$eval("#blank-q1", input => input.disabled), true, "Original submitted answers remain immutable");
    await page.click("#fill-submit");
    await page.waitForFunction(() => document.getElementById("fill-final-score").hidden === false);
    await page.evaluate(() => {window.__fillUser = null; window.__fillAuthCallbacks.forEach(callback => callback(null));});
    await page.waitForFunction(() => document.getElementById("fill-session-content").hidden);
    assert.equal(await page.evaluate(() => window.__fillWatchers.length), 0, "Sign-out stops student listeners");
    const chineseChecks = await page.evaluate(async () => {
      const {mountFillInTheBlanksPassage} = await import("/features/fill_in_the_blanks_question_generator/components/passage_view.js?v=20261105-chinese-count-v1");
      const root = document.createElement("div"); document.body.append(root);
      const passage = {language: "Chinese", passageText: "我们去{{cn1}}看{{cn2}}。", questions: [
        {questionId:"cn1",position:1,requiredWordCount:1,requiredCharacterCount:2},
        {questionId:"cn2",position:2,requiredWordCount:1,requiredCharacterCount:3}]};
      const view = mountFillInTheBlanksPassage({root,passage}); await view.ready;
      const first=root.querySelector("#blank-cn1"),second=root.querySelector("#blank-cn2");
      const hints=[...root.querySelectorAll("small")].map(item=>item.textContent);
      first.value="学 校";second.value="𠮷野家";const valid=view.validate();
      first.value="学";const shortRejected=!view.validate(),message=first.validationMessage;
      first.value="大学校";const longRejected=!view.validate();
      first.value="学校";second.value="𠮷 野 家";const unicodeValid=view.validate();view.dispose();
      const legacy=mountFillInTheBlanksPassage({root,passage:{language:"Chinese",passageText:"{{old}}",questions:[{questionId:"old",position:1,requiredWordCount:1}]}});
      const legacyHint=root.querySelector("small").textContent;root.querySelector("input").value="学校";const legacyBlocked=!legacy.validate();legacy.dispose();root.remove();
      return {hints,valid,shortRejected,longRejected,unicodeValid,message,legacyHint,legacyBlocked};
    });
    assert.deepEqual(chineseChecks.hints,["2 characters","3 characters"]);
    assert.ok(chineseChecks.valid&&chineseChecks.shortRejected&&chineseChecks.longRejected&&chineseChecks.unicodeValid);
    assert.match(chineseChecks.message,/exactly 2 characters/);assert.match(chineseChecks.legacyHint,/Character count unavailable/);assert.equal(chineseChecks.legacyBlocked,true);
    assert.deepEqual(errors, []);
    console.log("Passed mobile preview-only question/image rendering, administrator SDK checks, image cleanup, word/Chinese-character validation, marking/results and live updates.");
  } catch (error) {
    console.error({url: page.url(), errors, status: await page.$eval(".status", item => item.textContent).catch(() => "")});
    await page.screenshot({path: "/tmp/rhx-fill-browser-failure.png", fullPage: true});
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
