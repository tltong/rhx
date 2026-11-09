const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const origin = process.env.SUBJECT_ASSESSMENT_TEST_ORIGIN || "http://127.0.0.1:8769";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], requests = [], dashboardPath = "/features/student/pages/landing/landing.html";
    const source = fs.readFileSync(path.resolve(__dirname, "../public/features/student/pages/landing/landing.js"), "utf8");
    const modules = new Map();
    for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];/g)) {
      const url = new URL(match[2], origin + "/features/student/pages/landing/landing.js");
      if (url.pathname.includes("/subject_assessment/")) continue;
      const code = match[1].split(",").map(name => name.trim()).filter(Boolean).map(name => {
        if (name === "onStudentAuthStateChanged") return 'export const onStudentAuthStateChanged=callback=>{window.__studentAuth=callback;queueMicrotask(()=>callback(window.__user));};';
        if (name === "getStudentDashboard") return 'export const getStudentDashboard=()=>window.__dashboard();';
        if (/Controller$|Section$/.test(name)) return `export class ${name}{constructor(){} start(){} stop(){} mount(){}}`;
        if (name === "DEFAULT_REWARD_CONFIG") return 'export const DEFAULT_REWARD_CONFIG={recentActivitiesLimit:10};';
        if (name === "completionProcessingStages" || name === "completionProcessingStatuses") return `export const ${name}={};`;
        return `export const ${name}=async()=>null;`;
      }).join("\n");
      modules.set(url.pathname, code);
    }
    const date = new Date(Date.now() + 86400000).toISOString();
    const base = syllabusId => ({syllabusId, language: "English", configured: true, canStart: false, reason: null, activeAssessment: null, generation: null, latestSubmission: null, latestResult: null, nextAvailableAt: null});
    const states = {
      english: {...base("english"), canStart: true},
      math: {...base("math"), reason: "cooldown", nextAvailableAt: date, latestResult: {assessmentId: "math-old", score: 88.5}},
      science: {...base("science"), activeAssessment: {assessmentId: "science-draft", status: "inProgress"}},
      language: {...base("language"), generation: {generationId: "language-job", requestId: "original-language-request", status: "failed", canRetry: true, progress: {prepared: 1, total: 2}}},
      unavailable: {...base("unavailable"), configured: false, reason: "subjectNotConfigured"},
      initialOnly: {...base("initialOnly"), reason: "noRepeat", latestResult: {assessmentId: "initial-only-result", score: 79}},
    };
    let releaseStart, failOverview = false;
    const startGate = new Promise(resolve => {releaseStart = resolve;});
    page.on("pageerror", error => errors.push(error.stack || error.message));
    await page.exposeFunction("__dashboard", async () => ({student: {id: "student", name: "Student", country: "Malaysia", level: "primary", currentGrade: 4}, stream: {name: "Primary"},
      syllabuses: Object.keys(states).map(syllabusId => ({syllabusId, subject: syllabusId, language: "English", topics: [], readinessUnavailable: true, reliabilityUnavailable: true}))}));
    await page.exposeFunction("__assessmentCalls", action => requests.filter(request => request.action === action).length);
    await page.exposeFunction("__assessmentBackend", async ({action, input}, uid) => {
      requests.push({action, input, uid}); assert.equal(uid, "student");
      if (action === "overview") {if (failOverview) throw new Error("Backend temporarily unavailable"); return {intervalDays: 7, subjects: Object.values(states)};}
      if (action === "start") {
        assert.deepEqual(Object.keys(input).sort(), ["requestId", "syllabusId"]);
        if (input.syllabusId === "english") {
          await startGate; states.english.canStart = false; states.english.generation = {generationId: "english-job", requestId: input.requestId, status: "queued", canRetry: false, progress: {prepared: 0, total: 2}};
          return {status: "generating", generationId: "english-job", requestId: input.requestId};
        }
        assert.equal(input.syllabusId, "language"); assert.equal(input.requestId, "original-language-request");
        states.language.generation = {...states.language.generation, status: "queued", canRetry: false};
        return {error: {code: "functions/unavailable", message: "Response lost after preparation request committed."}};
      }
      if (action === "retry") {assert.equal(input.assessmentId, "needs-marking"); states.english.latestSubmission.markingStatus = "pending"; return {markingStatus: "pending"};}
      throw new Error("Unexpected backend operation: " + action);
    });
    await page.evaluateOnNewDocument(() => {window.__user = {uid: "student"};});
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/firebase_auth.js")) return js('export const requireCurrentFirebaseAuthUser=()=>{if(!window.__user)throw new Error("Sign in");return window.__user;};');
      if (url.pathname.endsWith("/firebase_ops.js")) return js('export const getFirebaseApp=()=>({functions:()=>({httpsCallable:name=>async data=>{if(name!=="subjectAssessment")throw new Error("Unexpected callable");const value=await window.__assessmentBackend(data,window.__user.uid);if(value?.error)throw Object.assign(new Error(value.error.message),{code:value.error.code});return {data:value};}})});');
      if (modules.has(url.pathname)) return js(modules.get(url.pathname));
      if (url.pathname.endsWith("/subject_assessment.html")) return request.respond({status: 200, contentType: "text/html", body: "<html><body>Assessment opened</body></html>"});
      if (url.pathname === "/index.html") return request.respond({status: 200, contentType: "text/html", body: "<html><body>Signed out</body></html>"});
      if (url.origin !== origin) return request.abort();
      request.continue();
    });
    const root = id => `.subject-assessment-box[data-syllabus-id="${id}"]`;
    const waitText = (id, text) => page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent.includes(text), {}, root(id), text).catch(async error => {
      console.error("Dashboard diagnostic:", JSON.stringify({errors, requestCount: requests.length, body: await page.$eval("body", element => element.textContent.slice(0, 1600))})); throw error;
    });
    const click = (id, text) => page.$eval(root(id), (root, text) => {const button = [...root.querySelectorAll("button")].find(button => button.textContent === text); if (!button) throw new Error("Missing " + text); button.click();}, text);
    await page.goto(origin + dashboardPath, {waitUntil: "networkidle0"});
    await waitText("english", "Take assessment"); await waitText("math", "Next assessment available"); await waitText("science", "Resume assessment"); await waitText("language", "Retry preparation");
    await waitText("unavailable", "not configured yet");
    assert.equal(await page.$eval("#student-welcome", element => element.textContent), "Welcome back, Student.");
    await waitText("initialOnly", "Repeat assessments are disabled");
    assert.equal(await page.$eval(root("initialOnly"), box => [...box.querySelectorAll("button")].some(button => button.textContent === "Take assessment")), false);
    assert.equal(await page.$eval(root("initialOnly"), box => [...box.querySelectorAll("a")].some(link => link.textContent === "View result")), true);
    assert.equal(await page.$$eval(".subject-assessment-box", nodes => nodes.length), 6);
    assert.equal(await page.$eval("#student-subject-assessment-count", node => node.textContent), "6 subjects");
    assert.equal(await page.$$eval("#student-subject-assessment-list .subject-assessment-box", nodes => nodes.length), 6, "Every subject is grouped in the dedicated assessment section");
    assert.equal(await page.$$eval(".syllabus-panel .subject-assessment-box", nodes => nodes.length), 0, "Assessment controls are not buried among topic progress rows");
    assert.deepEqual(await page.$$eval("#student-subject-assessment-list h3", nodes => nodes.map(node => node.textContent)), Object.keys(states));
    assert.match(await page.$eval(root("math"), element => element.textContent), /88.5%/);
    assert.equal(await page.$eval(root("english") + ' a', link => new URL(link.href).searchParams.get("syllabusId")), "english");
    await click("english", "Take assessment");
    await page.waitForFunction(async () => await window.__assessmentCalls("start") === 1);
    await click("english", "Take assessment");
    assert.equal(requests.filter(request => request.action === "start").length, 1, "Repeated clicks cannot queue duplicate starts");
    releaseStart(); await waitText("english", "Preparing your assessment");
    states.english.generation = null; states.english.activeAssessment = {assessmentId: "assessment-new", status: "ready"};
    await Promise.all([page.waitForNavigation({waitUntil: "domcontentloaded"}), click("english", "Check availability")]);
    assert.equal(new URL(page.url()).searchParams.get("assessmentId"), "assessment-new");
    assert.equal(new URL(page.url()).searchParams.get("syllabusId"), "english");
    states.english.activeAssessment = null; states.english.reason = "cooldown"; states.english.nextAvailableAt = date;
    states.english.latestSubmission = {assessmentId: "assessment-new", markingStatus: "pending", markedItemCount: 0, itemCount: 2};
    states.english.latestResult = {assessmentId: "previous", score: 80};
    await page.goto(origin + dashboardPath, {waitUntil: "networkidle0"});
    await waitText("english", "Marking your submitted assessment"); await waitText("english", "80%");
    states.english.latestSubmission.markingStatus = "completed"; states.english.latestResult = {assessmentId: "assessment-new", score: 93.3333333333};
    await click("english", "Check availability"); await waitText("english", "93.3%");
    assert.match(await page.$eval(root("english") + ' a', link => link.href), /assessmentId=assessment-new/);
    await click("language", "Retry preparation"); await waitText("language", "Preparing your assessment");
    assert.equal(requests.filter(request => request.action === "start" && request.input.syllabusId === "language").length, 1, "Lost start response is reconciled without a second generation");
    states.english.latestSubmission = {assessmentId: "needs-marking", markingStatus: "failed"};
    await click("english", "Check availability"); await waitText("english", "Retry marking");
    await click("english", "Retry marking"); await waitText("english", "Marking your submitted assessment");
    states.math.canStart = true; states.math.reason = null; states.math.nextAvailableAt = new Date(Date.now() - 1).toISOString();
    await click("math", "Check availability"); await waitText("math", "Take assessment");
    failOverview = true; await click("english", "Check availability"); await waitText("english", "Could not check assessment availability");
    assert.equal(await page.$eval("#student-welcome", element => element.textContent), "Welcome back, Student.", "Assessment failures do not break the dashboard");
    failOverview = false; await click("english", "Check again"); await waitText("english", "93.3%");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/rhx-student-subject-assessment-mobile.png", fullPage: true});
    await page.setViewport({width: 1280, height: 900}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await Promise.all([page.waitForNavigation({waitUntil: "domcontentloaded"}), page.click("#student-log-off")]);
    assert.equal(new URL(page.url()).pathname, "/index.html");
    assert.deepEqual(errors, []);
    console.log("PASS: Real student dashboard subject controls, resume/history links, duplicate clicks, queued generation, lost-response recovery, marking retry, ready scores, interval availability, isolated failures and responsive layout.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
