const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {createServer} = require("node:http");
const {createRequire} = require("node:module");

const publicRoot = path.resolve(__dirname, "../public");
const fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));

(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const server = createServer(async (request, response) => {
    try {
      const filename = path.resolve(publicRoot, "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname));
      if (!filename.startsWith(publicRoot + path.sep)) throw new Error("Invalid path");
      const contentType = {".html": "text/html", ".js": "application/javascript", ".css": "text/css"}[path.extname(filename)] || "application/octet-stream";
      const content = await fs.readFile(filename);
      response.writeHead(200, {"Content-Type": contentType});
      response.end(content);
    } catch {response.writeHead(404); response.end();}
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage();
    await page.setViewport({width: 390, height: 844});
    const errors = [], saves = [];
    page.on("pageerror", error => errors.push(error.message));
    let syllabus = {id: "math", country: "Malaysia", level: "primary", year: 4, subject: "Mathematics", languages: ["English"], active: true,
      topics: [
        {id: "off", topicName: "Disabled topic", tutorEnabled: false},
        {id: "on", topicName: "Enabled topic", tutorEnabled: true},
        {id: "legacy", topicName: "Existing topic"},
      ].map(topic => ({...topic, assessmentFrameworkIds: {english: "mcq"}, pausable: true, subtopics: {}, preAssessmentPractices: {}}))};
    let rejectSave = false;
    await page.exposeFunction("__syllabusApi", async (action, changes) => {
      if (action === "list") return [syllabus];
      if (action === "get") return syllabus;
      if (action === "save") {
        if (rejectSave) throw new Error("Save unavailable");
        saves.push(changes); syllabus = {...syllabus, ...changes}; return syllabus;
      }
      throw new Error("Unexpected admin operation " + action);
    });
    let tutorLoads = 0;
    await page.exposeFunction("__tutorLoaded", () => {tutorLoads++;});
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false; import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href).href);');
      if (url.pathname.endsWith("/syllabus_module.js")) return js(`export const listSyllabuses=()=>window.__syllabusApi('list'); export const getSyllabusById=()=>window.__syllabusApi('get'); export const updateSyllabusRecord=(current,changes)=>window.__syllabusApi('save',changes); export const createSyllabusRecord=changes=>window.__syllabusApi('save',changes); export const deleteSyllabusRecord=()=>{throw Error('Unexpected delete')};`);
      if (url.pathname.endsWith("/assessment_framework_module.js")) return js('export const listAssessmentFrameworks=async()=>[{id:"mcq",name:"MCQ",frameworkType:"normal"}];');
      if (url.pathname.endsWith("/syllabusscope_module.js")) return js('export const listSyllabusScopes=async()=>[{country:"Malaysia",languages:["English"],levels:{primary:{4:true}}}];');
      if (url.pathname.endsWith("/student_module.js")) return js('export const onStudentAuthStateChanged=callback=>{queueMicrotask(()=>callback({uid:"student"}));return ()=>{}};');
      if (url.pathname.endsWith("/practice_result_module.js")) {
        const questions = syllabus.topics.slice(0, 2).map((topic, index) => ({questionId: "q" + index, questionText: "What is 1 + 1?", options: {a: "1", b: "2", c: "3", d: "4"}, selectedOption: "a", correctAnswer: "b", isCorrect: false, tutorEnabled: topic.tutorEnabled, explanation: "Add one and one.", hasDiagram: false}));
        questions.push({...questions[0], questionId: "correct", selectedOption: "b", isCorrect: true, tutorEnabled: true});
        return js('export const getPracticeResultReview=async()=>({...'+JSON.stringify({practiceId: "p", studentId: "student", practiceType: "assessment", score: 33, questionsCorrect: 1, totalQuestions: 3, timeTakenSeconds: 20, questions})+',submittedAt:new Date()});');
      }
      if (url.pathname.endsWith("/tutor_module.js")) return js('export const getTutorQuestionById=async()=>{const e=Error("Tutor is disabled for this topic.");e.code="tutor-disabled";throw e}; export const getTutorConfig=async()=>null; export const getTutorMiniQuestionSet=()=>window.__tutorLoaded(); export const checkTutorMiniQuestionAnswer=()=>window.__tutorLoaded();');
      if (url.origin !== base) return request.abort();
      return request.continue();
    });

    const adminUrl = base + "/features/syllabus/pages/admin/syllabus_admin.html";
    await page.goto(adminUrl, {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.querySelectorAll("[data-field='tutorEnabled']").length === 3);
    assert.deepEqual(await page.$$eval("[data-field='tutorEnabled']", inputs => inputs.map(input => input.checked)), [false, true, true]);
    await page.click(".topic-row:nth-child(2) [data-field='tutorEnabled']");
    rejectSave = true;
    await page.click("#save-syllabus");
    await page.waitForFunction(() => /Save unavailable/.test(document.querySelector("#status-message").textContent));
    assert.equal(saves.length, 0);
    assert.equal(await page.$eval(".topic-row:nth-child(2) [data-field='tutorEnabled']", input => input.checked), false);
    rejectSave = false;
    await page.click("#save-syllabus");
    await page.waitForFunction(() => document.querySelector("#status-message").textContent === "Syllabus saved.");
    assert.deepEqual(saves[0].topics.map(topic => topic.tutorEnabled), [false, false, true]);
    await page.reload({waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.querySelectorAll("[data-field='tutorEnabled']").length === 3);
    assert.deepEqual(await page.$$eval("[data-field='tutorEnabled']", inputs => inputs.map(input => input.checked)), [false, false, true]);
    await page.click("#add-topic");
    assert.equal(await page.$eval(".topic-row:last-child [data-field='tutorEnabled']", input => input.checked), true);

    // Actual results-page rendering, with the two topic policies returned by the feature.
    syllabus.topics[1].tutorEnabled = true;
    const resultUrl = base + "/features/practice_result/pages/result/practice_result.html?studentId=student&practiceId=p";
    await page.goto(resultUrl, {waitUntil: "networkidle0"});
    await page.waitForSelector(".question-review-link");
    assert.equal((await page.$$(".question-review-link")).length, 1);
    assert.ok((await page.$eval(".question-review-link", link => link.href)).includes("questionId=q1"));
    assert.equal((await page.$$(".question-item")).length || (await page.$$("#practice-result-questions > li")).length, 3);
    syllabus.topics[1].tutorEnabled = false;
    await page.reload({waitUntil: "networkidle0"});
    await page.waitForFunction(() => !document.querySelector("#practice-result-questions").hidden);
    assert.equal((await page.$$(".question-review-link")).length, 0);

    // A stale/bookmarked tutor link uses the normal page error state and cannot load a set.
    await page.goto(base + "/features/tutor/pages/question_review/question_review.html?questionId=q0&practiceId=p", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => /Tutor is disabled/.test(document.querySelector("#review-error-message").textContent));
    assert.equal(await page.$eval("#review-answer-form", element => element.hidden), true);
    assert.equal(await page.$eval("#retry-review", element => element.hidden), true);
    assert.equal(tutorLoads, 0);
    assert.deepEqual(errors, []);
    console.log("PASS: Mobile topic tutor settings save/reload, preserve drafts on failure, default new topics, hide result links, and block a direct review page.");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
