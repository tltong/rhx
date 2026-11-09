const assert = require("node:assert/strict"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const origin = process.env.SUBJECT_ASSESSMENT_TEST_ORIGIN || "http://127.0.0.1:8769";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], requests = [];
    let release, fail = false, failStudents = false, emptyStudents = false;
    const gate = new Promise(resolve => {release = resolve;});
    page.on("pageerror", error => errors.push(error.message));
    const topics = [{topicId: "reading", topicName: "Reading", questionType: "normal"}, {topicId: "writing", topicName: "Writing", questionType: "essay"}, {topicId: "vocabulary", topicName: "Vocabulary", questionType: "fillInTheBlanks"}];
    const config = {version: 3, updatedAt: new Date().toISOString(), topics: topics.map(topic => ({...topic, totalCount: 1, difficultyCounts: {easy: 0, medium: 1, hard: 0}}))};
    const year = new Date().getFullYear();
    const students = [
      {id: "student-123", name: "Sam Lee", username: "sam-first", level: "Primary", yearOfRegistration: year - 1, standardAtYearOfRegistration: "2"},
      {id: "student-other", name: "Sam Lee", username: "sam-second", level: "primary", yearOfRegistration: year, standardAtYearOfRegistration: "3"},
      {id: "primary-four", name: "Aisha", level: "primary", yearOfRegistration: year - 1, standardAtYearOfRegistration: "3"},
      {id: "secondary-two", name: "Nina", level: "secondary", yearOfRegistration: year, standardAtYearOfRegistration: "2"},
      {id: "invalid", name: "Incomplete", level: "primary", yearOfRegistration: "invalid", standardAtYearOfRegistration: "3"},
    ];
    await page.exposeFunction("__demoApi", async (action, input) => {
      if (action === "list") return [{id: "english", country: "MY", level: "primary", year: 3, subject: "English", active: true, languages: ["English", "Tamil"]}];
      if (action === "options") return {...input, topics, configuration: config};
      if (action === "students") {
        if (failStudents) {failStudents = false; throw new Error("Student list unavailable");}
        return emptyStudents ? [] : students;
      }
      if (action === "save") throw new Error("The demo must not save configuration");
      if (action !== "preview") throw new Error("Unexpected operation " + action);
      requests.push(input); await gate;
      if (fail) {fail = false; throw new Error("Temporary preview failure");}
      return {...input, previewOnly: true, reusedCount: 2, generatedCount: 1, questionCount: 4, passageCount: 1, items: [
        {position: 1, topicName: "Reading", questionType: "normal", difficulty: "medium", source: "reused",
          contentSnapshot: {questionText: "Which answer fits? <img src=x onerror=alert(1)>", hasDiagram: false, options: {a: "One", b: "Two", c: "Three", d: "Four"}}, marking: {correctAnswer: "b", explanation: "Two is correct."}},
        {position: 2, topicName: "Writing", questionType: "essay", difficulty: "medium", source: "generated",
          contentSnapshot: {questionText: "Write about a family outing.", wordCountRequirement: {minWords: 30}, support: {helpingWords: ["family", "park"]}}, marking: {}},
        {position: 3, topicName: "Vocabulary", questionType: "fillInTheBlanks", difficulty: "medium", source: "reused",
          contentSnapshot: {passageText: "We saw {{q1}} at the {{q2}}.", language: input.language, questionCount: 2,
            questions: [{questionId: "q1", position: 1, requiredWordCount: 1}, {questionId: "q2", position: 2, requiredWordCount: 1}]}, marking: {answers: {q1: "birds", q2: "park"}}},
      ]};
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false; import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href).href);');
      if (url.pathname.endsWith("/syllabus_module.js")) return js("export const listSyllabuses=()=>window.__demoApi('list');");
      if (url.pathname.endsWith("/student_module.js")) return js("export const listStudents=()=>window.__demoApi('students');");
      if (url.pathname.endsWith("/subject_assessment_config_module.js")) return js("export const getSubjectAssessmentConfigOptions=input=>window.__demoApi('options',input); export const saveSubjectAssessmentConfig=input=>window.__demoApi('save',input); export const getSubjectAssessmentSettings=async()=>null; export const saveSubjectAssessmentSettings=async()=>{throw new Error('Demo must not save global settings');};");
      if (url.pathname.endsWith("/subject_assessment_generator_module.js")) return js("export const previewSubjectAssessment=async(input,options)=>{options.onProgress({prepared:0,total:3,reused:0,generated:0});const result=await window.__demoApi('preview',input);options.onProgress({prepared:3,total:3,reused:2,generated:1});return result};");
      if (url.origin !== origin) return request.abort();
      return request.continue();
    });
    await page.goto(origin + "/features/subject_assessment_config/pages/admin/subject_assessment_config_admin.html", {waitUntil: "networkidle0"});
    const waitStatus = text => page.waitForFunction(text => document.querySelector("#demo-status").textContent.includes(text), {}, text);
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), true);
    await page.select("#syllabus-select", "english"); await page.select("#language-select", "English");
    await page.waitForFunction(() => document.querySelectorAll(".topic-card").length === 3);
    await page.waitForFunction(() => !document.querySelector("#demo-student-level").disabled);
    assert.equal(await page.$("#demo-student-id"), null, "Student IDs are no longer typed manually");
    assert.equal(await page.$eval("#demo-student-grade", element => element.disabled), true);
    assert.equal(await page.$eval("#demo-student", element => element.disabled), true);
    await page.select("#demo-student-level", "primary");
    assert.deepEqual(await page.$$eval("#demo-student-grade option", nodes => nodes.map(node => node.value)), ["", "3", "4"], "Grade uses current academic year, not the registration grade");
    await page.select("#demo-student-grade", "3");
    assert.deepEqual(await page.$$eval("#demo-student option", nodes => nodes.map(node => node.textContent)), ["Select student name", "Sam Lee (sam-first)", "Sam Lee (sam-second)"]);
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), true);
    await page.select("#demo-student", "student-123");
    await page.click("#generate-demo");
    await waitStatus("Preparing 0 of 3");
    assert.equal(await page.$eval("#syllabus-select", element => element.disabled), true);
    for (const selector of ["#demo-student-level", "#demo-student-grade", "#demo-student"]) {
      assert.equal(await page.$eval(selector, element => element.disabled), true);
    }
    release(); await waitStatus("Demo ready");
    assert.deepEqual(requests[0], {syllabusId: "english", language: "English", studentId: "student-123", expectedConfigurationVersion: 3});
    assert.equal((await page.$$("#demo-items .demo-item")).length, 3);
    assert.match(await page.$eval("#demo-summary", element => element.textContent), /2 reused.*1 generated/);
    assert.equal(await page.$("#demo-items .demo-question img"), null, "Question text cannot inject HTML");
    assert.match(await page.$eval("#demo-items", element => element.textContent), /Minimum 30 words/);
    assert.equal((await page.$$("#demo-items .fill-in-the-blanks-view input")).length, 2);
    assert.equal((await page.$$("#demo-items details[open]")).length, 0);
    await page.click("#demo-items details summary");
    assert.match(await page.$eval("#demo-items details", element => element.textContent), /Answer: B/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/subject-assessment-demo-mobile.png", fullPage: true});
    await page.select("#demo-student-level", "secondary");
    assert.equal(await page.$eval("#demo-student-grade", element => element.value), "");
    assert.equal(await page.$eval("#demo-student", element => element.value), "");
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), true);
    assert.deepEqual(await page.$$eval("#demo-student-grade option", nodes => nodes.map(node => node.value)), ["", "2"]);
    await page.select("#demo-student-grade", "2");
    assert.deepEqual(await page.$$eval("#demo-student option", nodes => nodes.map(node => node.textContent)), ["Select student name", "Nina"]);
    await page.select("#demo-student-level", "primary");
    await page.select("#demo-student-grade", "3");
    await page.select("#demo-student", "student-other");
    assert.equal(await page.$eval("#demo-result", element => element.hidden), true);
    fail = true; await page.click("#generate-demo"); await waitStatus("Temporary preview failure");
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), false);
    await page.click("#generate-demo"); await waitStatus("Demo ready");
    assert.equal(requests.at(-1).studentId, "student-other");
    await page.$eval('[data-topic-id="reading"] [data-count="totalCount"]', input => {input.value = "2"; input.dispatchEvent(new Event("input", {bubbles: true}));});
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), true);
    assert.match(await page.$eval("#demo-help", element => element.textContent), /Save your configuration/);
    assert.equal(await page.$eval("#demo-result", element => element.hidden), true);
    await page.click("#reload-config");
    await page.waitForFunction(() => !document.querySelector("#generate-demo").disabled);
    await page.select("#language-select", "Tamil");
    await page.waitForFunction(() => !document.querySelector("#generate-demo").disabled);
    await page.click("#generate-demo"); await waitStatus("Demo ready");
    assert.equal(requests.at(-1).language, "Tamil");
    await page.click("#clear-demo");
    assert.equal(await page.$eval("#demo-result", element => element.hidden), true);
    assert.equal(await page.$("#subject-assessment-demo [data-save]"), null);
    failStudents = true; await page.click("#reload-demo-students");
    await page.waitForFunction(() => document.querySelector("#demo-student-status").textContent.includes("Student list unavailable"));
    assert.equal(await page.$eval("#demo-student-level", element => element.disabled), true);
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), true);
    await page.click("#reload-demo-students");
    await page.waitForFunction(() => !document.querySelector("#demo-student-level").disabled);
    assert.equal(await page.$eval("#demo-student", element => element.value), "", "Reloading students clears the old selection");
    emptyStudents = true; await page.click("#reload-demo-students");
    await page.waitForFunction(() => document.querySelector("#demo-student-status").textContent.startsWith("No students"));
    assert.equal(await page.$eval("#demo-student-level", element => element.disabled), true);
    assert.equal(await page.$eval("#generate-demo", element => element.disabled), true);
    await page.setViewport({width: 1280, height: 900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log("PASS: Cascading level/current-grade/student-name selection, duplicate names, selected ID, loading/empty recovery, all-format previews and responsive layout; no save action.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
